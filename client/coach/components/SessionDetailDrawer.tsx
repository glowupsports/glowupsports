import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_DETAILS_INTRO_KEY = "skipSessionDetailsIntro";

const BALL_LEVELS = ["Blue", "Red", "Orange", "Green", "Yellow", "Glow"];

const CANCELLATION_REASONS = [
  { label: "Select a reason...", value: "" },
  { label: "Personal emergency", value: "Personal emergency" },
  { label: "Weather conditions", value: "Weather conditions" },
  { label: "Court unavailable", value: "Court unavailable" },
  { label: "Player requested cancellation", value: "Player requested cancellation" },
  { label: "Illness / Health issue", value: "Illness / Health issue" },
  { label: "Schedule conflict", value: "Schedule conflict" },
  { label: "Equipment issues", value: "Equipment issues" },
  { label: "Other", value: "Other" },
];
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, getPlayerLevelColor, getPlayerLevelTextColor, GlowColors } from "@/constants/theme";
import { getBallLevelColor } from "./series-detail/utils";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { invalidatePlayersList } from "@/lib/credit-cache";
import { useNetwork } from "@/context/NetworkContext";
import { showOfflineAlert } from "@/hooks/useOfflineGuard";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { CoachStackParamList } from "@/coach/navigation/CoachNavigator";
import InSessionFeedbackDrawer from "./InSessionFeedbackDrawer";
import PlayerFeedbackHistorySheet from "./PlayerFeedbackHistorySheet";
import StrokeFeedbackModal from "./StrokeFeedbackModal";
import QuickBaselineDrawer from "./QuickBaselineDrawer";
import { DeepAssessmentDrawer } from "./DeepAssessmentDrawer";
import { useAIModal } from "@/coach/context/AIModalContext";
import { AISessionPlanModal } from "./AISessionPlanModal";
import SendGroupReminderModal from "./SendGroupReminderModal";

interface Player {
  id: string;
  name: string;
  level?: string;
  ballLevel?: string | null;
  status?: string;
  isGuest?: boolean;
  joinType?: string | null;
  attendanceStatus?: string | null;
  profilePhotoUrl?: string | null;
}

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status: string | null;
  skipReason?: string | null;
  players?: Player[];
  seriesId?: string | null;
  title?: string | null;
}

interface Court {
  id: string;
  name: string;
}

interface AvailablePlayer {
  id: string;
  name: string;
  ballLevel?: string | null;
}

interface SessionDetailDrawerProps {
  visible: boolean;
  session: Session | null;
  courts: Court[];
  onClose: () => void;
  onAttendance: () => void;
  onFeedback?: () => void;
  initialAction?: "attendance" | "detail" | "extend" | "end" | "ai";
}

type StartDateOption = "today" | "previous" | "custom";

export default function SessionDetailDrawer({
  visible,
  session,
  courts,
  onClose,
  onAttendance,
  onFeedback,
  initialAction,
}: SessionDetailDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isOffline, logOfflineAttempt } = useNetwork();
  const navigation = useNavigation<NativeStackNavigationProp<CoachStackParamList>>();
  const { t } = useTranslation();
  const isOfflineRef = useRef(isOffline);
  useEffect(() => { isOfflineRef.current = isOffline; }, [isOffline]);
  const [showReminderModal, setShowReminderModal] = useState(false);

  const [liveSession, setLiveSession] = useState<Session | null>(session);
  useEffect(() => {
    if (session) setLiveSession(session);
  }, [session]);

  const reminderSeriesQuery = useQuery<{
    title?: string;
    players?: Array<{ status?: string | null }>;
  }>({
    queryKey: ["/api/coach/series", liveSession?.seriesId],
    enabled: !!liveSession?.seriesId && showReminderModal,
  });
  const reminderSeriesName =
    reminderSeriesQuery.data?.title || liveSession?.title || "Class";
  const reminderActiveCount =
    (reminderSeriesQuery.data?.players || []).filter(
      (p) => ((p?.status as string | undefined) || "active") === "active",
    ).length || (liveSession?.players?.length ?? 0);

  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showExtendOptions, setShowExtendOptions] = useState(false);
  const [showQuickFeedback, setShowQuickFeedback] = useState(false);
  const [selectedPlayerForHistory, setSelectedPlayerForHistory] = useState<{ id: string; name: string; photoUrl?: string | null; level?: string | null; ballLevel?: string | null } | null>(null);
  const [feedbackInitialPlayerId, setFeedbackInitialPlayerId] = useState<string | null>(null);
  const [showStrokeFeedback, setShowStrokeFeedback] = useState(false);
  const [baselinePlayer, setBaselinePlayer] = useState<Player | null>(null);
  const [deepAssessPlayer, setDeepAssessPlayer] = useState<Player | null>(null);
  const [feedbackPickerMode, setFeedbackPickerMode] = useState<"evidence" | "baseline" | "deep" | "ai" | null>(null);
  const { openAIChat } = useAIModal();
  const [showAISessionPlan, setShowAISessionPlan] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showIntroCard, setShowIntroCard] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_DETAILS_INTRO_KEY).then((value) => {
      if (value === "true") setShowIntroCard(false);
    });
  }, []);

  const handleDismissIntro = async () => {
    await AsyncStorage.setItem(SESSION_DETAILS_INTRO_KEY, "true");
    setShowIntroCard(false);
  };
  const [cancelReason, setCancelReason] = useState("");
  const [showReasonDropdown, setShowReasonDropdown] = useState(false);
  const [cancelResult, setCancelResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Keep a stable ref to onAttendance so the attendance-auto-trigger effect doesn't go stale
  const onAttendanceRef = useRef(onAttendance);
  useEffect(() => { onAttendanceRef.current = onAttendance; }, [onAttendance]);

  // Handle initial action from deep linking and reset when drawer closes
  useEffect(() => {
    if (visible) {
      if (initialAction === "extend") {
        setShowExtendOptions(true);
        setShowEndConfirm(false);
      } else if (initialAction === "end") {
        setShowEndConfirm(true);
        setShowExtendOptions(false);
      } else if (initialAction === "attendance") {
        // Auto-trigger attendance flow: close this drawer and open AttendanceDrawer
        setShowExtendOptions(false);
        setShowEndConfirm(false);
        const timer = setTimeout(() => {
          onAttendanceRef.current?.();
        }, 150);
        return () => clearTimeout(timer);
      } else if (initialAction === "ai") {
        // Auto-trigger AI chat intake flow
        setShowExtendOptions(false);
        setShowEndConfirm(false);
        // Will be handled by the "Coach with AI" button auto-click via useEffect below
      } else {
        // Reset to main view for normal openings
        setShowExtendOptions(false);
        setShowEndConfirm(false);
      }
    } else {
      // Reset all views when drawer closes
      setShowExtendOptions(false);
      setShowEndConfirm(false);
      setShowAddPlayer(false);
      setShowCancelConfirm(false);
      setCancelReason("");
      setCancelResult(null);
    }
  }, [visible, initialAction]);
  const [selectedPlayer, setSelectedPlayer] = useState<AvailablePlayer | null>(null);
  const [startDateOption, setStartDateOption] = useState<StartDateOption>("today");
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showCatchUp, setShowCatchUp] = useState(false);
  const [pastSessions, setPastSessions] = useState<Session[]>([]);
  const [catchUpAttendance, setCatchUpAttendance] = useState<Map<string, "present" | "absent" | "holiday">>(new Map());
  const [showPastSessionsConfirm, setShowPastSessionsConfirm] = useState<{weeksDiff: number; startDate: Date} | null>(null);
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [guestMode, setGuestMode] = useState<"new" | "academy">("new");
  const [guestSearch, setGuestSearch] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestWeeks, setGuestWeeks] = useState(1);
  const [showWeeksPicker, setShowWeeksPicker] = useState(false);
  const [pendingGuestName, setPendingGuestName] = useState("");
  const [pendingAcademyPlayer, setPendingAcademyPlayer] = useState<{ id: string; name: string; ballLevel?: string | null } | null>(null);
  const [showGuestConvert, setShowGuestConvert] = useState<{id: string; name: string} | null>(null);
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestAge, setGuestAge] = useState("");
  const [guestBallLevel, setGuestBallLevel] = useState<string>("");
  const [conversionErrors, setConversionErrors] = useState<{email?: string; age?: string}>({});
  const [playerSearch, setPlayerSearch] = useState("");
  const [ballLevelFilter, setBallLevelFilter] = useState<string | null>(null);
  
  // Remove player state
  const [showRemovePlayer, setShowRemovePlayer] = useState<Player | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removeFromDate, setRemoveFromDate] = useState<"today" | "next_session">("today");
  const [removedPlayerIds, setRemovedPlayerIds] = useState<Set<string>>(new Set());
  const currentSessionId = session?.id;
  React.useEffect(() => {
    setRemovedPlayerIds(new Set());
  }, [currentSessionId]);
  
  // Credit mismatch warning state
  const [creditMismatchWarning, setCreditMismatchWarning] = useState<{
    playerName: string;
    playerId: string;
    sessionId: string;
    requiredCreditType: string;
    message: string;
  } | null>(null);

  const { data: allPlayersData } = useQuery<AvailablePlayer[]>({
    queryKey: ["/api/players"],
    enabled: visible && (showAddPlayer || (showGuestInput && guestMode === "academy")),
  });
  const allPlayers = Array.isArray(allPlayersData) ? allPlayersData : [];

  const isGroupSession = session?.sessionType === "group" || session?.sessionType === "semi_private";
  const [showWaitlist, setShowWaitlist] = useState(false);

  interface WaitlistEntry {
    id: string;
    position: number;
    status: string;
    offeredAt: string | null;
    claimWindowMinutes: number;
    joinedAt: string;
    player: {
      id: string;
      name: string;
      level: number;
      ballLevel?: string;
      avatarUrl?: string;
      credits: number;
    } | null;
  }

  const { data: waitlistData, refetch: refetchWaitlist } = useQuery<{ waitlist: WaitlistEntry[]; count: number }>({
    queryKey: [`/api/coach/sessions/${session?.id}/waitlist`],
    enabled: visible && isGroupSession && !!session?.id,
  });

  interface SessionBriefPlayerSummary {
    playerId: string;
    playerName: string;
    bullets: string[];
  }
  interface SessionBrief {
    id: string;
    sessionId: string;
    coachId: string;
    briefText: string;
    playerSummaries: SessionBriefPlayerSummary[];
    generatedAt: string;
  }

  const { data: sessionBrief } = useQuery<SessionBrief>({
    queryKey: [`/api/coach/sessions/${session?.id}/brief`],
    enabled: visible && !!session?.id,
    retry: false,
  });

  const { data: sessionRatingsData } = useQuery<{
    ratings: { playerId: string; playerName: string; rating: number; comment: string | null }[];
    average: number | null;
    count: number;
  }>({
    queryKey: [`/api/coach/sessions/${session?.id}/ratings`],
    enabled: visible && !!session?.id && session?.status === "completed",
    retry: false,
  });

  const [briefExpanded, setBriefExpanded] = useState(true);

  const existingPlayerIds = liveSession?.players?.filter(p => !removedPlayerIds.has(p.id)).map(p => p.id) || [];
  const availablePlayers = allPlayers.filter(p => !existingPlayerIds.includes(p.id));
  
  // Filter players by search query and ball level
  const filteredPlayers = availablePlayers.filter(p => 
    (p.name.toLowerCase().includes(playerSearch.toLowerCase()) ||
    (p.ballLevel && p.ballLevel.toLowerCase().includes(playerSearch.toLowerCase()))) &&
    (!ballLevelFilter || (p.ballLevel && p.ballLevel.toLowerCase() === ballLevelFilter))
  );

  const addPlayerMutation = useMutation({
    mutationFn: async ({ playerId, skipCreditCheck }: { playerId: string; skipCreditCheck?: boolean }) => {
      const response = await apiRequest("POST", `/api/coach/sessions/${session?.id}/players`, { 
        playerId,
        isGuest: false,
        skipCreditCheck,
      });
      return response.json();
    },
    onSuccess: (data) => {
      // Check for credit mismatch warning
      if (data.warning === "credit_mismatch") {
        setCreditMismatchWarning({
          playerName: data.playerName,
          playerId: data.playerId,
          sessionId: data.sessionId,
          requiredCreditType: data.requiredCreditType,
          message: data.message,
        });
        return;
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (selectedPlayer) {
        setLiveSession(prev => {
          if (!prev) return prev;
          const alreadyExists = prev.players?.some(p => p.id === selectedPlayer.id);
          if (alreadyExists) return prev;
          return {
            ...prev,
            players: [
              ...(prev.players || []),
              {
                id: selectedPlayer.id,
                name: selectedPlayer.name,
                ballLevel: selectedPlayer.ballLevel || null,
                status: "active",
                attendanceStatus: null,
                isGuest: false,
                profilePhotoUrl: null,
              },
            ],
          };
        });
      }
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/coach/calendar');
        }
      });
      setShowAddPlayer(false);
      setSelectedPlayer(null);
      setStartDateOption("today");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to add player");
    },
  });
  
  const handleAddPlayerAnyway = async () => {
    if (!creditMismatchWarning) return;
    
    try {
      await apiRequest("POST", `/api/coach/sessions/${creditMismatchWarning.sessionId}/players`, { 
        playerId: creditMismatchWarning.playerId,
        isGuest: false,
        skipCreditCheck: true,
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLiveSession(prev => {
        if (!prev) return prev;
        const playerId = creditMismatchWarning.playerId;
        const playerName = creditMismatchWarning.playerName;
        const ballLevel = selectedPlayer?.ballLevel || null;
        const alreadyExists = prev.players?.some(p => p.id === playerId);
        if (alreadyExists) return prev;
        return {
          ...prev,
          players: [
            ...(prev.players || []),
            {
              id: playerId,
              name: playerName,
              ballLevel: ballLevel,
              status: "active",
              attendanceStatus: null,
              isGuest: false,
              profilePhotoUrl: null,
            },
          ],
        };
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/coach/calendar');
        }
      });
      setCreditMismatchWarning(null);
      setShowAddPlayer(false);
      setSelectedPlayer(null);
    } catch (error) {
      Alert.alert("Error", "Failed to add player");
    }
  };

  const saveCatchUpMutation = useMutation({
    mutationFn: async (records: { sessionId: string; playerId: string; status: string }[]) => {
      const promises = records.map(record => 
        apiRequest("POST", `/api/coach/sessions/${record.sessionId}/attendance`, {
          playerId: record.playerId,
          status: record.status,
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/coach/calendar');
        }
      });
      setShowCatchUp(false);
      setCatchUpAttendance(new Map());
      setPastSessions([]);
      setShowAddPlayer(false);
      setSelectedPlayer(null);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to save attendance");
    },
  });

  const addGuestMutation = useMutation({
    mutationFn: async ({ name, weeks }: { name: string; weeks: number }) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error("Guest name is required");
      }
      if (!session?.id) {
        throw new Error("No session selected");
      }
      const createRes = await apiRequest("POST", "/api/players", {
        name: `${trimmedName} (Guest)`,
        membershipType: "guest",
      });
      const guest = await createRes.json();
      let multiWeekResult = null;
      if (weeks > 1) {
        const res = await apiRequest("POST", `/api/coach/sessions/${session.id}/players/multi-week`, {
          playerId: guest.id,
          isGuest: true,
          weeks,
        });
        multiWeekResult = await res.json();
      } else {
        await apiRequest("POST", `/api/coach/sessions/${session.id}/players`, {
          playerId: guest.id,
          isGuest: true,
        });
      }
      return { guest, weeks, multiWeekResult };
    },
    onSuccess: ({ weeks, multiWeekResult }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/coach/calendar');
        }
      });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      if (multiWeekResult && weeks > 1) {
        const { added, notFound } = multiWeekResult;
        if (notFound > 0) {
          Alert.alert("Guest Added", `Added to ${added} of ${weeks} weeks. ${notFound} future session(s) not found.`);
        }
      }
      setGuestName("");
      setPendingGuestName("");
      setShowWeeksPicker(false);
      setGuestWeeks(1);
      setShowGuestInput(false);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to add guest");
    },
  });

  const addExistingGuestMutation = useMutation({
    mutationFn: async ({ player, weeks }: { player: { id: string; name: string; ballLevel?: string | null }; weeks: number }) => {
      if (!session?.id) throw new Error("No session selected");
      let multiWeekResult = null;
      if (weeks > 1) {
        const res = await apiRequest("POST", `/api/coach/sessions/${session.id}/players/multi-week`, {
          playerId: player.id,
          isGuest: true,
          skipCreditCheck: true,
          weeks,
        });
        multiWeekResult = await res.json();
      } else {
        await apiRequest("POST", `/api/coach/sessions/${session.id}/players`, {
          playerId: player.id,
          isGuest: true,
          skipCreditCheck: true,
        });
      }
      return { player, weeks, multiWeekResult };
    },
    onSuccess: ({ player, weeks, multiWeekResult }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLiveSession(prev => {
        if (!prev) return prev;
        const alreadyExists = prev.players?.some(p => p.id === player.id);
        if (alreadyExists) return prev;
        return {
          ...prev,
          players: [
            ...(prev.players || []),
            {
              id: player.id,
              name: player.name,
              ballLevel: player.ballLevel || null,
              status: "active",
              attendanceStatus: null,
              isGuest: true,
              profilePhotoUrl: null,
            },
          ],
        };
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/coach/calendar');
        }
      });
      if (multiWeekResult && weeks > 1) {
        const { added, notFound } = multiWeekResult;
        if (notFound > 0) {
          Alert.alert("Guest Added", `Added to ${added} of ${weeks} weeks. ${notFound} future session(s) not found.`);
        }
      }
      setGuestSearch("");
      setPendingAcademyPlayer(null);
      setShowWeeksPicker(false);
      setGuestWeeks(1);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to add guest");
    },
  });

  const convertGuestMutation = useMutation({
    mutationFn: async ({ playerId, phone, email, age, ballLevel }: { playerId: string; phone: string | null; email: string | null; age: number | null; ballLevel: string | null }) => {
      const cleanName = showGuestConvert?.name.replace(" (Guest)", "") || "";
      return apiRequest("PATCH", `/api/players/${playerId}`, {
        name: cleanName,
        phone,
        email,
        age,
        ballLevel,
        membershipType: "regular",
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/coach/calendar');
        }
      });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setShowGuestConvert(null);
      setGuestPhone("");
      setGuestEmail("");
      setGuestAge("");
      setGuestBallLevel("");
      setConversionErrors({});
      Alert.alert("Success", "Guest converted to player");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to convert guest");
    },
  });

  // Extend session mutation
  const extendSessionMutation = useMutation({
    mutationFn: async (minutes: number) => {
      if (!session) throw new Error("No session selected");
      const currentEnd = new Date(session.endTime);
      const newEnd = new Date(currentEnd.getTime() + minutes * 60 * 1000);
      return apiRequest("PATCH", `/api/coach/sessions/${session.id}`, {
        endTime: newEnd.toISOString(),
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/coach/calendar');
        }
      });
      setShowExtendOptions(false);
      Alert.alert("Success", "Session extended");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to extend session");
    },
  });

  // End session mutation
  const endSessionMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("No session selected");
      const now = new Date();
      return apiRequest("PATCH", `/api/coach/sessions/${session.id}`, {
        endTime: now.toISOString(),
        status: "completed",
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/coach/calendar');
        }
      });
      setShowEndConfirm(false);
      onClose();
      Alert.alert("Session Ended", "Session has been marked as completed");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to end session");
    },
  });

  // Cancel session mutation (coach-initiated, no charge)
  const cancelSessionMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!session) throw new Error("No session selected");
      const response = await apiRequest("POST", `/api/coach/sessions/${session.id}/cancel`, {
        reason: reason.trim() || "Cancelled by coach",
      });
      return response.json();
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && (
            key.startsWith('/api/coach/calendar') || 
            key.startsWith('/api/coach/series')
          );
        }
      });
      // Task #930 — cancelling a session may refund consumed credits;
      // refresh the coach Players list so the pill updates instantly.
      invalidatePlayersList(queryClient);
      setShowCancelConfirm(false);
      onClose();
      setTimeout(() => {
        Alert.alert("Session Deleted", "The session has been removed from your calendar.");
      }, 350);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to cancel session");
      setShowCancelConfirm(false);
    },
  });

  // Remove player from session mutation
  const removePlayerMutation = useMutation({
    mutationFn: async ({ playerId, reason, fromDate }: { playerId: string; reason: string; fromDate: string }) => {
      if (!session) throw new Error("No session selected");
      const dateParam = fromDate === "today" ? new Date().toISOString() : undefined;
      const url = dateParam 
        ? `/api/coach/sessions/${session.id}/players/${playerId}?date=${dateParam}`
        : `/api/coach/sessions/${session.id}/players/${playerId}`;
      return apiRequest("DELETE", url);
    },
    onSuccess: (data: any, variables: { playerId: string; reason: string; fromDate: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRemovedPlayerIds(prev => new Set(prev).add(variables.playerId));
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/coach/calendar');
        }
      });
      // Task #930 — removing a player can refund a credit; refresh the
      // coach Players list pill instantly.
      invalidatePlayersList(queryClient);
      setShowRemovePlayer(null);
      setRemoveReason("");
      setRemoveFromDate("today");
      const refundMsg = data?.creditRefunded ? " Credits refunded." : "";
      Alert.alert("Success", `Player removed from session.${refundMsg}`);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to remove player");
    },
  });

  const validateConversionFields = (): boolean => {
    const errors: {email?: string; age?: string} = {};
    
    // Validate email format if provided
    const emailTrimmed = guestEmail.trim();
    if (emailTrimmed) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailTrimmed)) {
        errors.email = "Invalid email format";
      }
    }
    
    // Validate age if provided
    const ageTrimmed = guestAge.trim();
    if (ageTrimmed) {
      const ageNum = parseInt(ageTrimmed, 10);
      if (isNaN(ageNum)) {
        errors.age = "Age must be a number";
      } else if (ageNum < 0) {
        errors.age = "Age must be positive";
      } else if (ageNum > 120) {
        errors.age = "Age must be realistic";
      }
    }
    
    setConversionErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  const handleConvertGuest = async () => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "SessionDetailDrawer", action: "convert_guest" });
      showOfflineAlert();
      return;
    }
    if (!showGuestConvert) return;
    if (!validateConversionFields()) return;
    
    const ageTrimmed = guestAge.trim();
    const ageNum = ageTrimmed ? parseInt(ageTrimmed, 10) : null;
    const emailTrimmed = guestEmail.trim();
    
    convertGuestMutation.mutate({
      playerId: showGuestConvert.id,
      phone: guestPhone.trim() || null,
      email: emailTrimmed || null,
      age: ageNum !== null && !isNaN(ageNum) ? ageNum : null,
      ballLevel: guestBallLevel || null,
    });
  };

  const handleAddGuest = async () => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "SessionDetailDrawer", action: "add_guest" });
      showOfflineAlert();
      return;
    }
    if (!guestName.trim()) return;
    setPendingGuestName(guestName.trim());
    setPendingAcademyPlayer(null);
    setGuestWeeks(1);
    setShowWeeksPicker(true);
  };

  const handleConfirmGuestWeeks = () => {
    if (pendingGuestName) {
      addGuestMutation.mutate({ name: pendingGuestName, weeks: guestWeeks });
    } else if (pendingAcademyPlayer) {
      addExistingGuestMutation.mutate({ player: pendingAcademyPlayer, weeks: guestWeeks });
    }
  };

  const handleSelectAcademyGuest = (player: { id: string; name: string; ballLevel?: string | null }) => {
    if (isOffline) {
      showOfflineAlert();
      return;
    }
    setPendingAcademyPlayer(player);
    setPendingGuestName("");
    setGuestWeeks(1);
    setShowWeeksPicker(true);
  };

  const [showCourtPicker, setShowCourtPicker] = useState(false);

  const changeCourtMutation = useMutation({
    mutationFn: async (newCourtId: string) => {
      return apiRequest("PATCH", `/api/coach/sessions/${session!.id}/edit-single`, { courtId: newCourtId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      setShowCourtPicker(false);
      Alert.alert("Court Updated", "The session court has been changed.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to change court");
    },
  });

  if (!visible || !session) return null;

  const court = courts.find(c => c.id === session.courtId);
  const sessionDate = new Date(session.startTime);
  const sessionType = session.sessionType === "private" ? "Private" :
                      session.sessionType === "semi_private" ? "Semi-Private" :
                      session.sessionType === "group" ? "Group" :
                      session.sessionType === "physical" ? "Physical" : session.sessionType;

  const getStartDate = (): Date => {
    if (startDateOption === "today") return new Date();
    if (startDateOption === "previous") {
      const prev = new Date(session.startTime);
      prev.setDate(prev.getDate() - 7);
      return prev;
    }
    return customDate;
  };

  const handleAddPlayer = async () => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "SessionDetailDrawer", action: "add_player" });
      showOfflineAlert();
      return;
    }
    if (!selectedPlayer) return;
    
    const startDate = getStartDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    
    if (startDate < today) {
      const weeksDiff = Math.ceil((today.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
      setShowPastSessionsConfirm({ weeksDiff, startDate });
    } else {
      addPlayerMutation.mutate({ playerId: selectedPlayer.id });
    }
  };

  const handleSkipPastSessions = async () => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "SessionDetailDrawer", action: "add_player_skip" });
      showOfflineAlert();
      return;
    }
    if (!selectedPlayer) return;
    setShowPastSessionsConfirm(null);
    addPlayerMutation.mutate({ playerId: selectedPlayer.id });
  };

  const handleReviewAttendance = () => {
    if (!showPastSessionsConfirm || !selectedPlayer) return;
    
    const { startDate } = showPastSessionsConfirm;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const sessions: Session[] = [];
    const date = new Date(startDate);
    const sessionDay = new Date(session.startTime).getDay();
    
    while (date <= today) {
      if (date.getDay() === sessionDay && date < today) {
        const sessionDate = new Date(date);
        sessions.push({
          ...session,
          id: `${session.id}-${sessionDate.toISOString()}`,
          startTime: new Date(sessionDate.setHours(new Date(session.startTime).getHours(), new Date(session.startTime).getMinutes())).toISOString(),
          endTime: new Date(sessionDate.setHours(new Date(session.endTime).getHours(), new Date(session.endTime).getMinutes())).toISOString(),
        });
      }
      date.setDate(date.getDate() + 1);
    }
    
    setPastSessions(sessions);
    const initial = new Map<string, "present" | "absent" | "holiday">();
    sessions.forEach(s => initial.set(s.id, "present"));
    setCatchUpAttendance(initial);
    setShowPastSessionsConfirm(null);
    setShowCatchUp(true);
  };

  const handleSaveCatchUp = async () => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "SessionDetailDrawer", action: "save_catchup" });
      showOfflineAlert();
      return;
    }
    if (!selectedPlayer) return;
    
    const records = pastSessions.map(s => ({
      sessionId: session.id,
      playerId: selectedPlayer.id,
      status: catchUpAttendance.get(s.id) || "present",
    }));
    
    addPlayerMutation.mutate({ playerId: selectedPlayer.id }, {
      onSuccess: async () => {
        if (isOfflineRef.current) {
          await logOfflineAttempt({ screen: "SessionDetailDrawer", action: "save_catchup_records" });
          showOfflineAlert();
          return;
        }
        if (records.length > 0) {
          saveCatchUpMutation.mutate(records);
        }
      },
    });
  };

  const getCalendarDays = () => {
    const year = customDate.getFullYear();
    const month = customDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];
    
    const startPadding = (firstDay.getDay() + 6) % 7;
    for (let i = 0; i < startPadding; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    
    return days;
  };

  const renderMainContent = () => (
    <>
      <View style={styles.sessionInfo}>
        <View style={styles.sessionHeader}>
          <View style={[styles.typeBadge, { backgroundColor: getTypeColor(session.sessionType) }]}>
            <Text style={styles.typeBadgeText}>{sessionType}</Text>
          </View>
          <Text style={styles.sessionTime}>
            {new Date(session.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
            {" - "}
            {new Date(session.endTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </Text>
        </View>
        
        <Text style={styles.sessionDate}>
          {sessionDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </Text>
        
        {court ? (
          <Pressable style={styles.courtRow} onPress={() => setShowCourtPicker(true)}>
            <Ionicons name="location-outline" size={16} color={Colors.dark.disabled} />
            <Text style={styles.courtName}>{court.name}</Text>
            <Ionicons name="pencil-outline" size={14} color={Colors.dark.disabled} style={{ marginLeft: 6 }} />
          </Pressable>
        ) : (
          <Pressable style={styles.courtRow} onPress={() => setShowCourtPicker(true)}>
            <Ionicons name="location-outline" size={16} color={Colors.dark.disabled} />
            <Text style={[styles.courtName, { color: Colors.dark.disabled }]}>No court assigned</Text>
            <Ionicons name="add-outline" size={14} color={Colors.dark.primary} style={{ marginLeft: 6 }} />
          </Pressable>
        )}

        {showCourtPicker && (
          <View style={styles.courtPickerContainer}>
            <Text style={styles.courtPickerTitle}>Change Court</Text>
            {courts.map((c) => (
              <Pressable
                key={c.id}
                style={[
                  styles.courtPickerItem,
                  c.id === session.courtId && styles.courtPickerItemActive,
                ]}
                onPress={() => {
                  if (c.id !== session.courtId) {
                    changeCourtMutation.mutate(c.id);
                  } else {
                    setShowCourtPicker(false);
                  }
                }}
                disabled={changeCourtMutation.isPending}
              >
                <Ionicons
                  name={c.id === session.courtId ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={c.id === session.courtId ? Colors.dark.primary : Colors.dark.disabled}
                />
                <Text style={[
                  styles.courtPickerItemText,
                  c.id === session.courtId && { color: Colors.dark.primary },
                ]}>{c.name}</Text>
              </Pressable>
            ))}
            {changeCourtMutation.isPending && (
              <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginTop: 8 }} />
            )}
          </View>
        )}
      </View>

      {session.status === "cancelled" && session.skipReason === "all_players_on_holiday" ? (
        <View style={{
          marginHorizontal: Spacing.lg,
          marginTop: Spacing.sm,
          marginBottom: Spacing.xs,
          backgroundColor: 'rgba(100, 90, 160, 0.18)',
          borderRadius: BorderRadius.md,
          borderWidth: 1,
          borderColor: 'rgba(160, 160, 200, 0.3)',
          padding: Spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        }}>
          <Ionicons name="airplane" size={20} color="#A0A0C8" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#A0A0C8', fontSize: 13, fontWeight: '600' }}>Automatisch geannuleerd</Text>
            <Text style={{ color: Colors.dark.textMuted, fontSize: 12, marginTop: 2 }}>Iedereen op vakantie</Text>
          </View>
        </View>
      ) : null}

      {showIntroCard ? (
        <View style={styles.introCard}>
          <View style={styles.introCardHeader}>
            <View style={styles.introCardIcon}>
              <Ionicons name="sparkles" size={18} color={Colors.dark.xpCyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.introCardTitle}>Session Command Center</Text>
              <Text style={styles.introCardText}>
                Manage your session here - track attendance, add players or guests, extend time, or end early.
              </Text>
            </View>
            <Pressable onPress={handleDismissIntro} style={styles.introCardClose}>
              <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
          <Pressable onPress={handleDismissIntro} style={styles.introCardDismiss}>
            <Text style={styles.introCardDismissText}>Don't show again</Text>
          </Pressable>
        </View>
      ) : null}

      {sessionBrief ? (
        <View style={styles.briefCard}>
          <Pressable
            style={styles.briefCardHeader}
            onPress={() => setBriefExpanded(!briefExpanded)}
          >
            <View style={styles.briefCardIconWrap}>
              <Ionicons name="sparkles" size={16} color="#A78BFA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.briefCardTitle}>AI Coaching Brief</Text>
              <Text style={styles.briefCardSubtitle} numberOfLines={briefExpanded ? undefined : 1}>
                {sessionBrief.briefText}
              </Text>
            </View>
            <Ionicons
              name={briefExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color="#A78BFA"
            />
          </Pressable>
          {briefExpanded ? (
            <View style={styles.briefCardBody}>
              {Array.isArray(sessionBrief.playerSummaries) && sessionBrief.playerSummaries.map((ps) => (
                <View key={ps.playerId} style={styles.briefPlayerBlock}>
                  <Text style={styles.briefPlayerName}>{ps.playerName}</Text>
                  {ps.bullets.map((bullet, idx) => (
                    <View key={idx} style={styles.briefBulletRow}>
                      <Text style={styles.briefBulletDot}>{"\u2022"}</Text>
                      <Text style={styles.briefBulletText}>{bullet}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {sessionRatingsData && sessionRatingsData.count > 0 ? (
        <View style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.sm, gap: Spacing.sm }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Lesson Ratings</Text>
            <View style={{
              backgroundColor: Colors.dark.gold + "22",
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 2,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}>
              <Ionicons name="star" size={12} color={Colors.dark.gold} />
              <Text style={{ color: Colors.dark.gold, fontSize: 12, fontWeight: "600" }}>
                {sessionRatingsData.average !== null ? sessionRatingsData.average.toFixed(1) : "–"} avg
              </Text>
            </View>
          </View>
          {sessionRatingsData.ratings.map((r) => (
            <View key={r.playerId} style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: Spacing.sm,
              paddingVertical: 6,
              borderBottomWidth: 1,
              borderBottomColor: Colors.dark.border + "44",
            }}>
              <Text style={{ color: Colors.dark.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{r.playerName}</Text>
              <View style={{ flexDirection: "row", gap: 2 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Ionicons key={s} name={s <= r.rating ? "star" : "star-outline"} size={13} color={Colors.dark.gold} />
                ))}
              </View>
              {r.comment ? (
                <Text style={{ color: Colors.dark.textMuted, fontSize: 11, flex: 2 }} numberOfLines={2}>{r.comment}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.playersSection}>
        {(() => {
          const allFiltered = liveSession?.players?.filter(p => !removedPlayerIds.has(p.id)) || [];
          const dropInPlayers = allFiltered.filter(p => p.joinType === "drop_in");
          const memberPlayers = allFiltered.filter(p => p.joinType !== "drop_in");
          const isPastSession = new Date(session.endTime) < new Date();

          const renderPlayerGrid = (playerList: typeof allFiltered) => {
            const rows: typeof allFiltered[] = [];
            for (let i = 0; i < playerList.length; i += 2) {
              rows.push(playerList.slice(i, i + 2));
            }
            return rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.playersGridRow}>
                {row.map(player => {
                  const isGuest = player.name.includes("(Guest)") || player.isGuest;
                  const isDropIn = player.joinType === "drop_in";
                  const levelColor = getPlayerLevelColor(player.ballLevel || player.level);
                  const levelTextColor = getPlayerLevelTextColor(player.ballLevel || player.level);
                  return (
                    <View
                      key={player.id}
                      style={[
                        styles.playerCard,
                        isGuest && styles.playerCardGuest,
                        isDropIn && { borderColor: "#F39C1240" },
                        player.status && { borderColor: getStatusColor(player.status) + "60" }
                      ]}
                    >
                      <Pressable
                        style={styles.playerCardRemove}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setShowRemovePlayer(player);
                          setRemoveReason("");
                          setRemoveFromDate("today");
                        }}
                      >
                        <Ionicons name="close" size={12} color={Colors.dark.error} />
                      </Pressable>
                      <Pressable
                        style={styles.playerCardContent}
                        onPress={() => {
                          if (isGuest && isPastSession) {
                            setShowGuestConvert({ id: player.id, name: player.name });
                            setGuestPhone("");
                            setGuestBallLevel("");
                          } else if (!isGuest) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedPlayerForHistory({
                              id: player.id,
                              name: player.name,
                              photoUrl: player.profilePhotoUrl,
                              level: player.level,
                              ballLevel: player.ballLevel,
                            });
                          }
                        }}
                        disabled={false}
                      >
                        <View style={[
                          styles.playerCardAvatar,
                          isGuest && styles.playerCardAvatarGuest,
                          isDropIn && { backgroundColor: "#F39C1230", borderColor: "#F39C12", borderWidth: 2 },
                          !isGuest && !isDropIn && { backgroundColor: levelColor + "30", borderColor: levelColor }
                        ]}>
                          <Text style={[styles.playerCardInitial, !isGuest && { color: isDropIn ? "#F39C12" : levelTextColor }]}>
                            {player.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.playerCardName} numberOfLines={1}>
                          {player.name.replace(" (Guest)", "")}
                        </Text>
                        {player.ballLevel ? (
                          <View style={[styles.playerCardLevel, { backgroundColor: isDropIn ? "#F39C1220" : levelColor + "20" }]}>
                            <View style={[styles.playerCardLevelDot, { backgroundColor: isDropIn ? "#F39C12" : levelColor }]} />
                            <Text style={[styles.playerCardLevelText, { color: isDropIn ? "#F39C12" : levelTextColor }]}>
                              {player.ballLevel.split("_")[0]}
                            </Text>
                          </View>
                        ) : isDropIn ? (
                          <View style={[styles.playerCardLevel, { backgroundColor: "#F39C1220" }]}>
                            <Text style={[styles.playerCardLevelText, { color: "#F39C12" }]}>Drop-in</Text>
                          </View>
                        ) : isGuest ? (
                          <View style={[styles.playerCardLevel, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                            <Text style={[styles.playerCardLevelText, { color: Colors.dark.xpCyan }]}>Guest</Text>
                          </View>
                        ) : null}
                        {player.status ? (
                          <View style={[styles.playerCardStatus, { backgroundColor: getStatusColor(player.status) }]} />
                        ) : null}
                      </Pressable>
                    </View>
                  );
                })}
                {row.length === 1 ? <View style={styles.playerCardSpacer} /> : null}
              </View>
            ));
          };

          if (allFiltered.length === 0) {
            return (
              <>
                <Text style={styles.sectionTitle}>Players (0)</Text>
                <View style={styles.noPlayersCard}>
                  <Ionicons name="people-outline" size={32} color={Colors.dark.disabled} />
                  <Text style={styles.noPlayersText}>No players assigned yet</Text>
                </View>
              </>
            );
          }

          if (dropInPlayers.length === 0) {
            return (
              <>
                <Text style={styles.sectionTitle}>Players ({memberPlayers.length})</Text>
                <View style={styles.playersGrid}>
                  {renderPlayerGrid(memberPlayers)}
                </View>
              </>
            );
          }

          return (
            <>
              <Text style={styles.sectionTitle}>Members ({memberPlayers.length})</Text>
              {memberPlayers.length > 0 ? (
                <View style={styles.playersGrid}>
                  {renderPlayerGrid(memberPlayers)}
                </View>
              ) : null}
              <View style={styles.dropInSubLabel}>
                <Ionicons name="flash" size={12} color="#F39C12" />
                <Text style={styles.dropInSubLabelText}>Drop-in Players ({dropInPlayers.length})</Text>
              </View>
              <View style={[styles.playersGrid, { marginTop: Spacing.xs }]}>
                {renderPlayerGrid(dropInPlayers)}
              </View>
            </>
          );
        })()}
      </View>

      {/* Remove Player Confirmation */}
      {showRemovePlayer ? (
        <View style={styles.removePlayerSection}>
          <View style={styles.removePlayerHeader}>
            <Text style={styles.removePlayerTitle}>Remove Player</Text>
            <Pressable onPress={() => setShowRemovePlayer(null)}>
              <Ionicons name="close" size={20} color={Colors.dark.tabIconDefault} />
            </Pressable>
          </View>
          <Text style={styles.removePlayerName}>{showRemovePlayer.name}</Text>
          
          <Text style={styles.removePlayerLabel}>Reason for removal</Text>
          <TextInput
            style={styles.removePlayerInput}
            placeholder="e.g., Moved to different group, Schedule conflict..."
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={removeReason}
            onChangeText={setRemoveReason}
            multiline
            numberOfLines={3}
          />
          
          <Text style={styles.removePlayerLabel}>Effective from</Text>
          <View style={styles.removeDateOptions}>
            <Pressable
              style={[
                styles.removeDateOption,
                removeFromDate === "today" && styles.removeDateOptionActive,
              ]}
              onPress={() => setRemoveFromDate("today")}
            >
              <Text style={[
                styles.removeDateOptionText,
                removeFromDate === "today" && styles.removeDateOptionTextActive,
              ]}>Today</Text>
            </Pressable>
            <Pressable
              style={[
                styles.removeDateOption,
                removeFromDate === "next_session" && styles.removeDateOptionActive,
              ]}
              onPress={() => setRemoveFromDate("next_session")}
            >
              <Text style={[
                styles.removeDateOptionText,
                removeFromDate === "next_session" && styles.removeDateOptionTextActive,
              ]}>Next Session</Text>
            </Pressable>
          </View>
          
          <Pressable
            style={[
              styles.removePlayerConfirmButton,
              (removePlayerMutation.isPending || isOffline) && styles.removePlayerConfirmButtonDisabled,
            ]}
            onPress={async () => {
              if (isOffline) {
                await logOfflineAttempt({ screen: "SessionDetailDrawer", action: "remove_player" });
                showOfflineAlert();
                return;
              }
              if (!removeReason.trim()) {
                Alert.alert("Required", "Please provide a reason for removal");
                return;
              }
              const effectiveDate = removeFromDate === "today" 
                ? new Date().toISOString() 
                : session?.startTime || new Date().toISOString();
              removePlayerMutation.mutate({
                playerId: showRemovePlayer.id,
                reason: removeReason.trim(),
                fromDate: effectiveDate,
              });
            }}
            disabled={removePlayerMutation.isPending || isOffline}
          >
            {removePlayerMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.text} />
            ) : (
              <Text style={styles.removePlayerConfirmText}>Remove from Session</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* Guest Conversion Form */}
      {showGuestConvert ? (
        <View style={styles.guestConvertSection}>
          <View style={styles.guestConvertHeader}>
            <Text style={styles.guestConvertTitle}>Convert Guest to Player</Text>
            <Pressable onPress={() => { setShowGuestConvert(null); setConversionErrors({}); }}>
              <Ionicons name="close" size={20} color={Colors.dark.tabIconDefault} />
            </Pressable>
          </View>
          <Text style={styles.guestConvertName}>{showGuestConvert.name.replace(" (Guest)", "")}</Text>
          
          <TextInput
            style={styles.guestConvertInput}
            placeholder="Phone number (optional)"
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={guestPhone}
            onChangeText={setGuestPhone}
            keyboardType="phone-pad"
          />
          
          <TextInput
            style={[styles.guestConvertInput, conversionErrors.email && styles.guestConvertInputError]}
            placeholder="Email (optional)"
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={guestEmail}
            onChangeText={(text) => { setGuestEmail(text); if (conversionErrors.email) setConversionErrors(prev => ({ ...prev, email: undefined })); }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {conversionErrors.email ? <Text style={styles.conversionErrorText}>{conversionErrors.email}</Text> : null}
          
          <TextInput
            style={[styles.guestConvertInput, conversionErrors.age && styles.guestConvertInputError]}
            placeholder="Age (optional)"
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={guestAge}
            onChangeText={(text) => { setGuestAge(text); if (conversionErrors.age) setConversionErrors(prev => ({ ...prev, age: undefined })); }}
            keyboardType="number-pad"
          />
          {conversionErrors.age ? <Text style={styles.conversionErrorText}>{conversionErrors.age}</Text> : null}
          
          <Text style={styles.guestConvertLabel}>Ball Level</Text>
          <View style={styles.ballLevelRow}>
            {["red", "orange", "green", "yellow"].map(level => (
              <Pressable
                key={level}
                style={[
                  styles.ballLevelOption,
                  guestBallLevel === level && styles.ballLevelSelected,
                ]}
                onPress={() => setGuestBallLevel(level)}
              >
                <Text style={[
                  styles.ballLevelText,
                  guestBallLevel === level && styles.ballLevelTextSelected,
                ]}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
          
          <Pressable
            style={[styles.convertBtn, convertGuestMutation.isPending && styles.convertBtnDisabled]}
            onPress={handleConvertGuest}
            disabled={convertGuestMutation.isPending}
          >
            {convertGuestMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <Text style={styles.convertBtnText}>Convert to Player</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {showGuestInput && (
        <View style={styles.guestPanel}>
          {showWeeksPicker ? (
            <View>
              <View style={styles.guestTabRow}>
                <Text style={{ color: Colors.dark.text, fontSize: 14, fontWeight: "600" as const, flex: 1 }}>
                  {pendingGuestName ? `Add "${pendingGuestName}"` : pendingAcademyPlayer ? `Add ${pendingAcademyPlayer.name}` : "Add guest"}
                </Text>
                <Pressable
                  onPress={() => { setShowWeeksPicker(false); setPendingGuestName(""); setPendingAcademyPlayer(null); setGuestWeeks(1); }}
                  style={styles.guestCancelBtn}
                >
                  <Ionicons name="arrow-back" size={18} color={Colors.dark.tabIconDefault} />
                </Pressable>
              </View>
              <Text style={{ color: Colors.dark.textMuted, fontSize: 12, marginBottom: 12 }}>
                How many weeks will they attend?
              </Text>
              <View style={styles.weeksPickerRow}>
                {[1, 2, 3, 4].map(w => (
                  <Pressable
                    key={w}
                    style={[styles.weekOption, guestWeeks === w && styles.weekOptionActive]}
                    onPress={() => setGuestWeeks(w)}
                  >
                    <Text style={[styles.weekOptionText, guestWeeks === w && styles.weekOptionTextActive]}>
                      {w === 1 ? "Just this one" : `${w} weeks`}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={[styles.guestConfirmBtn, (addGuestMutation.isPending || addExistingGuestMutation.isPending) && styles.guestAddBtnDisabled]}
                onPress={handleConfirmGuestWeeks}
                disabled={addGuestMutation.isPending || addExistingGuestMutation.isPending}
              >
                {(addGuestMutation.isPending || addExistingGuestMutation.isPending) ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <Text style={styles.guestConfirmBtnText}>
                    {guestWeeks === 1 ? "Add Guest" : `Add for ${guestWeeks} Weeks`}
                  </Text>
                )}
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.guestTabRow}>
                <Pressable
                  style={[styles.guestTab, guestMode === "new" && styles.guestTabActive]}
                  onPress={() => setGuestMode("new")}
                >
                  <Ionicons name="person-add-outline" size={14} color={guestMode === "new" ? Colors.dark.backgroundRoot : Colors.dark.textMuted} />
                  <Text style={[styles.guestTabText, guestMode === "new" && styles.guestTabTextActive]}>New Guest</Text>
                </Pressable>
                <Pressable
                  style={[styles.guestTab, guestMode === "academy" && styles.guestTabActive]}
                  onPress={() => setGuestMode("academy")}
                >
                  <Ionicons name="people-outline" size={14} color={guestMode === "academy" ? Colors.dark.backgroundRoot : Colors.dark.textMuted} />
                  <Text style={[styles.guestTabText, guestMode === "academy" && styles.guestTabTextActive]}>From Academy</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setShowGuestInput(false); setGuestName(""); setGuestSearch(""); setGuestMode("new"); setShowWeeksPicker(false); setPendingGuestName(""); setPendingAcademyPlayer(null); setGuestWeeks(1); }}
                  style={styles.guestCancelBtn}
                >
                  <Ionicons name="close" size={18} color={Colors.dark.tabIconDefault} />
                </Pressable>
              </View>

              {guestMode === "new" ? (
                <View style={styles.guestInputRow}>
                  <TextInput
                    style={styles.guestInput}
                    placeholder="Guest name..."
                    placeholderTextColor={Colors.dark.tabIconDefault}
                    value={guestName}
                    onChangeText={setGuestName}
                    onSubmitEditing={handleAddGuest}
                    returnKeyType="done"
                    autoFocus
                  />
                  <Pressable
                    onPress={handleAddGuest}
                    disabled={!guestName.trim()}
                    style={[
                      styles.guestAddBtn,
                      !guestName.trim() && styles.guestAddBtnDisabled,
                    ]}
                  >
                    <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
                  </Pressable>
                </View>
              ) : (
                <View>
                  <TextInput
                    style={styles.guestInput}
                    placeholder="Search player..."
                    placeholderTextColor={Colors.dark.tabIconDefault}
                    value={guestSearch}
                    onChangeText={setGuestSearch}
                    autoFocus
                  />
                  <ScrollView style={styles.guestPlayerList} showsVerticalScrollIndicator={false}>
                    {availablePlayers
                      .filter(p => !p.name.includes("(Guest)") && p.name.toLowerCase().includes(guestSearch.toLowerCase()))
                      .slice(0, 8)
                      .map(p => (
                        <Pressable
                          key={p.id}
                          style={styles.guestPlayerItem}
                          onPress={() => handleSelectAcademyGuest({ id: p.id, name: p.name, ballLevel: p.ballLevel })}
                        >
                          <View style={[styles.guestPlayerAvatar, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                            <Text style={styles.guestPlayerInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.guestPlayerName}>{p.name}</Text>
                            {p.ballLevel ? <Text style={styles.guestPlayerLevel}>{p.ballLevel}</Text> : null}
                          </View>
                          <Ionicons name="arrow-forward-circle-outline" size={22} color={Colors.dark.xpCyan} />
                        </Pressable>
                      ))}
                    {availablePlayers.filter(p => !p.name.includes("(Guest)") && p.name.toLowerCase().includes(guestSearch.toLowerCase())).length === 0 ? (
                      <Text style={styles.guestNoResults}>
                        {guestSearch ? `No players match "${guestSearch}"` : "All players are in this session"}
                      </Text>
                    ) : null}
                  </ScrollView>
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Quick Add Cards Row */}
      <View style={styles.quickAddRow}>
        <Pressable 
          style={[styles.quickAddCard, { borderColor: Colors.dark.primary + "40" }]} 
          onPress={() => setShowAddPlayer(true)}
        >
          <View style={[styles.quickAddIcon, { backgroundColor: Colors.dark.primary + "20" }]}>
            <Ionicons name="person-add" size={22} color={Colors.dark.primary} />
          </View>
          <Text style={styles.quickAddLabel}>Add Player</Text>
        </Pressable>

        <Pressable 
          style={[styles.quickAddCard, { borderColor: Colors.dark.xpCyan + "40" }]} 
          onPress={() => setShowGuestInput(true)}
        >
          <View style={[styles.quickAddIcon, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
            <Ionicons name="person-outline" size={22} color={Colors.dark.xpCyan} />
          </View>
          <Text style={styles.quickAddLabel}>Add Guest</Text>
        </Pressable>
      </View>

      {/* Attendance Action Card */}
      <Pressable style={styles.attendanceCard} onPress={onAttendance}>
        <View style={styles.attendanceCardLeft}>
          <View style={styles.attendanceIconContainer}>
            <Ionicons name="checkmark-done" size={24} color={Colors.dark.orange} />
          </View>
          <View>
            <Text style={styles.attendanceCardTitle}>Take Attendance</Text>
            <Text style={styles.attendanceCardSubtitle}>
              {liveSession?.players?.length || 0} players • Tap to mark present/absent
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.dark.orange} />
      </Pressable>

      {liveSession?.seriesId ? (
        <Pressable
          style={styles.attendanceCard}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowReminderModal(true);
          }}
        >
          <View style={styles.attendanceCardLeft}>
            <View style={styles.attendanceIconContainer}>
              <Ionicons name="notifications-outline" size={24} color={Colors.dark.accentCyan} />
            </View>
            <View>
              <Text style={styles.attendanceCardTitle}>
                {t("coach.reminder.actionLabel")}
              </Text>
              <Text style={styles.attendanceCardSubtitle}>
                {t("coach.reminder.subtitleCard")}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.dark.accentCyan} />
        </Pressable>
      ) : null}

      {/* Feedback Hub — all systems */}
      {liveSession?.players && liveSession.players.filter(p => !removedPlayerIds.has(p.id)).length > 0 && (() => {
        const activePlayers = liveSession.players!.filter(p => !removedPlayerIds.has(p.id));
        const nonGuestPlayers = activePlayers.filter(p => !p.isGuest && !p.name.includes("(Guest)"));

        const openForPlayer = (mode: "evidence" | "baseline" | "deep") => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (nonGuestPlayers.length === 1) {
            const p = nonGuestPlayers[0];
            if (mode === "evidence") {
              navigation.navigate("EvidenceCapture", { sessionId: session.id, playerId: p.id });
            } else if (mode === "baseline") {
              setBaselinePlayer(p);
            } else {
              setDeepAssessPlayer(p);
            }
          } else if (nonGuestPlayers.length > 1) {
            setFeedbackPickerMode(mode);
          }
        };

        const openAIChatForPlayer = () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (nonGuestPlayers.length === 1) {
            const p = nonGuestPlayers[0];
            openAIChat({
              sessionId: session.id,
              playerId: p.id,
              playerName: p.name,
              sessionType: session.sessionType,
              remainingPlayers: [],
            });
          } else if (nonGuestPlayers.length > 1) {
            setFeedbackPickerMode("ai");
          }
        };

        const TILES = [
          {
            key: "feedback",
            label: "Feedback",
            subtitle: "Praise, tips, notes",
            icon: "chatbubble-ellipses" as const,
            color: GlowColors.primary,
            xp: true,
            onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowQuickFeedback(true); },
          },
          {
            key: "stroke",
            label: "Stroke Analysis",
            subtitle: "Per-stroke breakdown",
            icon: "layers" as const,
            color: "#38BDF8",
            xp: false,
            onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowStrokeFeedback(true); },
          },
          {
            key: "evidence",
            label: "Skill Evidence",
            subtitle: "10-sec video clip",
            icon: "videocam" as const,
            color: "#F472B6",
            xp: true,
            onPress: () => openForPlayer("evidence"),
            disabled: nonGuestPlayers.length === 0,
          },
          {
            key: "baseline",
            label: "Quick Assessment",
            subtitle: "Skill baseline score",
            icon: "clipboard" as const,
            color: Colors.dark.gold,
            xp: false,
            onPress: () => openForPlayer("baseline"),
            disabled: nonGuestPlayers.length === 0,
          },
          {
            key: "deep",
            label: "Deep Assessment",
            subtitle: "Full skill rating",
            icon: "bar-chart" as const,
            color: "#A78BFA",
            xp: false,
            onPress: () => openForPlayer("deep"),
            disabled: nonGuestPlayers.length === 0,
          },
          {
            key: "ai-chat",
            label: "Coach with AI",
            subtitle: "AI-guided debrief",
            icon: "sparkles" as const,
            color: GlowColors.primary,
            xp: false,
            onPress: () => openAIChatForPlayer(),
            disabled: nonGuestPlayers.length === 0,
          },
        ];

        return (
          <View style={styles.feedbackHubContainer}>
            <Text style={styles.feedbackHubLabel}>FEEDBACK TOOLS</Text>
            <View style={styles.feedbackHubGrid}>
              {[TILES.slice(0, 2), TILES.slice(2, 4), TILES.slice(4, 6)].map((row, rowIndex) => (
                <View key={rowIndex} style={styles.feedbackHubGridRow}>
                  {row.map((tile) => (
                    <Pressable
                      key={tile.key}
                      style={[styles.feedbackHubTile, tile.disabled && { opacity: 0.4 }]}
                      onPress={tile.disabled ? () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        Alert.alert("Registered Players Required", "This tool requires at least one registered (non-guest) player in the session.");
                      } : tile.onPress}
                    >
                      <View style={[styles.feedbackHubIcon, { backgroundColor: tile.color + "25" }]}>
                        <Ionicons name={tile.icon} size={20} color={tile.color} />
                      </View>
                      <Text style={[styles.feedbackHubTileTitle, { color: tile.color }]} numberOfLines={1}>{tile.label}</Text>
                      <Text style={styles.feedbackHubTileSubtitle} numberOfLines={2}>{tile.subtitle}</Text>
                      {tile.xp ? (
                        <View style={styles.feedbackHubXp}>
                          <Text style={styles.feedbackHubXpText}>+XP</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          </View>
        );
      })()}

      {/* Plan with AI Card — group/semi-private sessions with 2+ players */}
      {(session?.sessionType === "group" || session?.sessionType === "semi_private") &&
       (liveSession?.players?.filter((p) => !p.isGuest).length ?? 0) >= 2 ? (
        <Pressable
          style={[styles.feedbackCard, { borderColor: GlowColors.primary + "30" }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowAISessionPlan(true);
          }}
        >
          <View style={styles.attendanceCardLeft}>
            <View style={[styles.attendanceIconContainer, { backgroundColor: GlowColors.primary + "20" }]}>
              <Ionicons name="sparkles" size={22} color={GlowColors.primary} />
            </View>
            <View>
              <Text style={[styles.attendanceCardTitle, { color: GlowColors.primary }]}>Plan with AI</Text>
              <Text style={styles.attendanceCardSubtitle}>AI session plan for your group</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={GlowColors.primary} />
        </Pressable>
      ) : null}

      {/* Feedback Card */}
      {onFeedback ? (
        <Pressable style={styles.feedbackCard} onPress={onFeedback}>
          <View style={styles.attendanceCardLeft}>
            <View style={[styles.attendanceIconContainer, { backgroundColor: Colors.dark.gold + "20" }]}>
              <Ionicons name="chatbubble-ellipses" size={22} color={Colors.dark.gold} />
            </View>
            <View>
              <Text style={[styles.attendanceCardTitle, { color: Colors.dark.gold }]}>Session Feedback</Text>
              <Text style={styles.attendanceCardSubtitle}>Add notes and player feedback</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.dark.gold} />
        </Pressable>
      ) : null}

      {/* Waitlist Section - Group/Semi-Private Sessions Only */}
      {isGroupSession && (
        <View style={styles.waitlistSection}>
          <Pressable
            style={styles.waitlistHeader}
            onPress={() => {
              setShowWaitlist(!showWaitlist);
              if (!showWaitlist) refetchWaitlist();
            }}
          >
            <View style={styles.waitlistHeaderLeft}>
              <Ionicons name="list-outline" size={18} color={Colors.dark.xpCyan} />
              <Text style={styles.waitlistHeaderTitle}>
                Waitlist {waitlistData && waitlistData.count > 0 ? `(${waitlistData.count})` : ""}
              </Text>
            </View>
            <Ionicons
              name={showWaitlist ? "chevron-up" : "chevron-down"}
              size={18}
              color={Colors.dark.textMuted}
            />
          </Pressable>

          {showWaitlist && (
            <View style={styles.waitlistContent}>
              {!waitlistData || waitlistData.waitlist.length === 0 ? (
                <Text style={styles.waitlistEmptyText}>No players on the waitlist</Text>
              ) : (
                waitlistData.waitlist.map((entry) => (
                  <View key={entry.id} style={styles.waitlistEntry}>
                    <View style={styles.waitlistEntryLeft}>
                      <View style={styles.waitlistPositionCircle}>
                        <Text style={styles.waitlistPositionNumber}>{entry.position}</Text>
                      </View>
                      <View style={styles.waitlistPlayerInfo}>
                        <Text style={styles.waitlistPlayerName}>{entry.player?.name || "Unknown Player"}</Text>
                        <Text style={styles.waitlistPlayerMeta}>
                          {entry.player?.ballLevel ? `${entry.player.ballLevel} level` : `Level ${entry.player?.level || "?"}`}
                          {" · "}{entry.player?.credits || 0} credits
                        </Text>
                      </View>
                    </View>
                    <View style={[
                      styles.waitlistStatusBadge,
                      entry.status === "offered" && styles.waitlistStatusOffered,
                    ]}>
                      <Text style={[
                        styles.waitlistStatusText,
                        entry.status === "offered" && styles.waitlistStatusTextOffered,
                      ]}>
                        {entry.status === "offered" ? "Offered" : "Waiting"}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      )}

      {/* Session Controls */}
      <View style={styles.sessionControlsSection}>
        <Text style={styles.controlsSectionTitle}>Session Controls</Text>
        <View style={styles.controlsRow}>
          <Pressable style={styles.controlButton} onPress={() => setShowExtendOptions(true)}>
            <Ionicons name="time-outline" size={18} color={Colors.dark.xpCyan} />
            <Text style={[styles.controlButtonText, { color: Colors.dark.xpCyan }]}>Extend</Text>
          </Pressable>
          <Pressable style={styles.controlButton} onPress={() => setShowEndConfirm(true)}>
            <Ionicons name="stop-circle-outline" size={18} color={Colors.dark.error} />
            <Text style={[styles.controlButtonText, { color: Colors.dark.error }]}>End Now</Text>
          </Pressable>
          <Pressable style={styles.controlButton} onPress={() => setShowCancelConfirm(true)}>
            <Ionicons name="close-circle-outline" size={18} color={Colors.dark.orange} />
            <Text style={[styles.controlButtonText, { color: Colors.dark.orange }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </>
  );

  const renderExtendOptions = () => (
    <>
      <View style={styles.stepHeader}>
        <Pressable onPress={() => setShowExtendOptions(false)}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.stepTitle}>Extend Session</Text>
        <View style={{ width: 24 }} />
      </View>
      <Text style={styles.stepLabel}>HOW LONG?</Text>
      <View style={styles.extendOptionsGrid}>
        {[15, 30, 45, 60].map((minutes) => (
          <Pressable
            key={minutes}
            style={[styles.extendOption, isOffline && { opacity: 0.5 }]}
            onPress={async () => {
              if (isOffline) {
                await logOfflineAttempt({ screen: "SessionDetailDrawer", action: "extend_session" });
                showOfflineAlert();
                return;
              }
              extendSessionMutation.mutate(minutes);
            }}
            disabled={extendSessionMutation.isPending || isOffline}
          >
            <Text style={styles.extendOptionTime}>+{minutes}</Text>
            <Text style={styles.extendOptionLabel}>min</Text>
          </Pressable>
        ))}
      </View>
      {extendSessionMutation.isPending && (
        <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginTop: Spacing.lg }} />
      )}
    </>
  );

  const renderEndConfirm = () => (
    <>
      <View style={styles.stepHeader}>
        <Pressable onPress={() => setShowEndConfirm(false)}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.stepTitle}>End Session</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.endConfirmContent}>
        <Ionicons name="warning-outline" size={48} color={Colors.dark.orange} />
        <Text style={styles.endConfirmText}>
          End this session now? The session will be marked as completed.
        </Text>
        <View style={styles.endConfirmButtons}>
          <Pressable
            style={styles.endCancelButton}
            onPress={() => setShowEndConfirm(false)}
          >
            <Text style={styles.endCancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.endConfirmButton, isOffline && { opacity: 0.5 }]}
            onPress={async () => {
              if (isOffline) {
                await logOfflineAttempt({ screen: "SessionDetailDrawer", action: "end_session" });
                showOfflineAlert();
                return;
              }
              endSessionMutation.mutate();
            }}
            disabled={endSessionMutation.isPending || isOffline}
          >
            {endSessionMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.text} />
            ) : (
              <Text style={styles.endConfirmButtonText}>End Session</Text>
            )}
          </Pressable>
        </View>
      </View>
    </>
  );

  const renderCancelConfirm = () => (
    <>
      <View style={styles.stepHeader}>
        <Pressable onPress={() => { setShowCancelConfirm(false); setCancelReason(""); setCancelResult(null); }}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.stepTitle}>Cancel Session</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.endConfirmContent}>
        {!cancelResult ? (
          <>
            <Ionicons name="close-circle-outline" size={48} color={Colors.dark.orange} />
            <Text style={styles.endConfirmText}>
              Are you sure you want to cancel this session?
            </Text>
            <Text style={styles.stepLabel}>REASON FOR CANCELLATION</Text>
            <View style={styles.pickerContainer}>
              <Pressable 
                style={styles.dropdownButton}
                onPress={() => setShowReasonDropdown(true)}
              >
                <Text style={[styles.dropdownButtonText, !cancelReason && styles.dropdownPlaceholder]}>
                  {cancelReason || "Select a reason..."}
                </Text>
                <Ionicons name="chevron-down" size={20} color={Colors.dark.orange} />
              </Pressable>
              
              {showReasonDropdown ? (
                <Modal
                  visible={showReasonDropdown}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setShowReasonDropdown(false)}
                >
                  <Pressable 
                    style={styles.dropdownOverlay}
                    onPress={() => setShowReasonDropdown(false)}
                  >
                    <View style={styles.dropdownMenu}>
                      <View style={styles.dropdownHeader}>
                        <Text style={styles.dropdownHeaderText}>Select Reason</Text>
                        <Pressable onPress={() => setShowReasonDropdown(false)}>
                          <Ionicons name="close" size={24} color={Colors.dark.text} />
                        </Pressable>
                      </View>
                      <ScrollView style={styles.dropdownScroll} bounces={false}>
                        {CANCELLATION_REASONS.filter(r => r.value !== "").map((reason) => (
                          <Pressable
                            key={reason.value}
                            style={[
                              styles.dropdownItem,
                              cancelReason === reason.value && styles.dropdownItemSelected
                            ]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setCancelReason(reason.value);
                              setShowReasonDropdown(false);
                            }}
                          >
                            <Text style={[
                              styles.dropdownItemText,
                              cancelReason === reason.value && styles.dropdownItemTextSelected
                            ]}>
                              {reason.label}
                            </Text>
                            {cancelReason === reason.value ? (
                              <Ionicons name="checkmark" size={20} color={Colors.dark.orange} />
                            ) : null}
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </Pressable>
                </Modal>
              ) : null}
            </View>
            <View style={styles.endConfirmButtons}>
              <Pressable
                style={styles.endCancelButton}
                onPress={() => { setShowCancelConfirm(false); setCancelReason(""); }}
              >
                <Text style={styles.endCancelButtonText}>Go Back</Text>
              </Pressable>
              <Pressable
                style={[styles.cancelConfirmButton, isOffline && { opacity: 0.5 }]}
                onPress={async () => {
                  if (isOffline) {
                    await logOfflineAttempt({ screen: "SessionDetailDrawer", action: "cancel_session" });
                    showOfflineAlert();
                    return;
                  }
                  cancelSessionMutation.mutate(cancelReason);
                }}
                disabled={cancelSessionMutation.isPending || isOffline}
              >
                {cancelSessionMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.text} />
                ) : (
                  <Text style={styles.cancelConfirmButtonText}>Confirm Cancel</Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Ionicons 
              name="checkmark-circle-outline" 
              size={48} 
              color={Colors.dark.primary} 
            />
            <Text style={styles.endConfirmText}>
              {cancelResult.message}
            </Text>
            <Pressable
              style={styles.cancelDoneButton}
              onPress={() => {
                setShowCancelConfirm(false);
                setCancelReason("");
                setCancelResult(null);
                onClose();
              }}
            >
              <Text style={styles.cancelDoneButtonText}>Done</Text>
            </Pressable>
          </>
        )}
      </View>
    </>
  );

  const renderAddPlayerContent = () => (
    <>
      <View style={styles.stepHeader}>
        <Pressable onPress={() => { setShowAddPlayer(false); setSelectedPlayer(null); setPlayerSearch(""); setBallLevelFilter(null); }}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.stepTitle}>Add Player</Text>
        <View style={{ width: 24 }} />
      </View>

      {!selectedPlayer ? (
        <>
          <Text style={styles.stepLabel}>SELECT PLAYER</Text>
          
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={Colors.dark.tabIconDefault} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search players..."
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={playerSearch}
              onChangeText={setPlayerSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {playerSearch.length > 0 && (
              <Pressable onPress={() => setPlayerSearch("")}>
                <Ionicons name="close-circle" size={18} color={Colors.dark.tabIconDefault} />
              </Pressable>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, gap: Spacing.xs }}
          >
            <Pressable
              style={[
                sessionBallChipStyles.chip,
                ballLevelFilter === null && sessionBallChipStyles.chipSelected,
              ]}
              onPress={() => setBallLevelFilter(null)}
            >
              <Text style={[sessionBallChipStyles.chipText, ballLevelFilter === null && sessionBallChipStyles.chipTextSelected]}>
                All
              </Text>
            </Pressable>
            {BALL_LEVELS.map((level) => {
              const color = getBallLevelColor(level);
              const isSelected = ballLevelFilter === level.toLowerCase();
              return (
                <Pressable
                  key={level}
                  style={[
                    sessionBallChipStyles.chip,
                    isSelected && { backgroundColor: color, borderColor: color },
                  ]}
                  onPress={() => setBallLevelFilter(isSelected ? null : level.toLowerCase())}
                >
                  <View style={[sessionBallChipStyles.chipDot, { backgroundColor: isSelected ? "#fff" : color }]} />
                  <Text style={[sessionBallChipStyles.chipText, isSelected && { color: "#fff" }]}>
                    {level}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView style={styles.playerSelectList}>
            {filteredPlayers.map(player => (
              <Pressable
                key={player.id}
                style={styles.playerSelectItem}
                onPress={() => setSelectedPlayer(player)}
              >
                <View style={[styles.playerAvatar, { backgroundColor: getPlayerLevelColor(player.ballLevel) }]}>
                  <Text style={styles.playerAvatarText}>{player.name.charAt(0)}</Text>
                </View>
                <View style={styles.playerSelectInfo}>
                  <Text style={styles.playerSelectName}>{player.name}</Text>
                  {player.ballLevel && (
                    <Text style={[styles.playerSelectLevel, { color: getPlayerLevelColor(player.ballLevel) }]}>{player.ballLevel} ball</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.disabled} />
              </Pressable>
            ))}
            {filteredPlayers.length === 0 && availablePlayers.length > 0 && (
              <Text style={styles.noPlayersText}>No players match "{playerSearch}"</Text>
            )}
            {availablePlayers.length === 0 && (
              <Text style={styles.noPlayersText}>All players are already in this session</Text>
            )}
          </ScrollView>
        </>
      ) : (
        <>
          <View style={styles.selectedPlayerCard}>
            <View style={[styles.playerAvatar, { backgroundColor: getPlayerLevelColor(selectedPlayer.ballLevel) }]}>
              <Text style={styles.playerAvatarText}>{selectedPlayer.name.charAt(0)}</Text>
            </View>
            <Text style={styles.selectedPlayerName}>{selectedPlayer.name}</Text>
          </View>

          <Text style={styles.stepLabel}>Start Date</Text>
          <View style={styles.dateOptions}>
            <Pressable
              style={[styles.dateOption, startDateOption === "today" && styles.dateOptionActive]}
              onPress={() => setStartDateOption("today")}
            >
              <View style={[styles.radioOuter, startDateOption === "today" && styles.radioOuterActive]}>
                {startDateOption === "today" && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.dateOptionText}>Today</Text>
            </Pressable>
            
            <Pressable
              style={[styles.dateOption, startDateOption === "previous" && styles.dateOptionActive]}
              onPress={() => setStartDateOption("previous")}
            >
              <View style={[styles.radioOuter, startDateOption === "previous" && styles.radioOuterActive]}>
                {startDateOption === "previous" && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.dateOptionText}>Previous Week</Text>
            </Pressable>
            
            <Pressable
              style={[styles.dateOption, startDateOption === "custom" && styles.dateOptionActive]}
              onPress={() => { setStartDateOption("custom"); setShowCalendar(true); }}
            >
              <View style={[styles.radioOuter, startDateOption === "custom" && styles.radioOuterActive]}>
                {startDateOption === "custom" && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.dateOptionText}>
                Custom: {customDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
              <Ionicons name="calendar-outline" size={16} color={Colors.dark.primary} />
            </Pressable>
          </View>

          {showCalendar && startDateOption === "custom" && (
            <View style={styles.calendarContainer}>
              <View style={styles.calendarHeader}>
                <Pressable onPress={() => setCustomDate(new Date(customDate.setMonth(customDate.getMonth() - 1)))}>
                  <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
                </Pressable>
                <Text style={styles.calendarMonth}>
                  {customDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </Text>
                <Pressable onPress={() => setCustomDate(new Date(customDate.setMonth(customDate.getMonth() + 1)))}>
                  <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
                </Pressable>
              </View>
              <View style={styles.calendarWeekDays}>
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <Text key={i} style={styles.calendarWeekDay}>{d}</Text>
                ))}
              </View>
              <View style={styles.calendarDays}>
                {getCalendarDays().map((day, i) => {
                  if (!day) return <View key={i} style={styles.calendarDayEmpty} />;
                  const isSelected = day.toDateString() === customDate.toDateString();
                  const isFuture = day > new Date();
                  return (
                    <Pressable
                      key={i}
                      style={[styles.calendarDay, isSelected && styles.calendarDaySelected, isFuture && styles.calendarDayDisabled]}
                      onPress={() => !isFuture && setCustomDate(day)}
                      disabled={isFuture}
                    >
                      <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, isFuture && styles.calendarDayTextDisabled]}>
                        {day.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <Pressable
            style={[styles.confirmButton, addPlayerMutation.isPending && styles.confirmButtonDisabled]}
            onPress={handleAddPlayer}
            disabled={addPlayerMutation.isPending}
          >
            <Text style={styles.confirmButtonText}>
              {addPlayerMutation.isPending ? "Adding..." : "Add to Session"}
            </Text>
          </Pressable>
        </>
      )}
    </>
  );

  const renderCatchUpContent = () => (
    <>
      <View style={styles.stepHeader}>
        <Pressable onPress={() => setShowCatchUp(false)}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.stepTitle}>Attendance Catch-Up</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.catchUpInfo}>
        <Text style={styles.catchUpPlayerName}>{selectedPlayer?.name}</Text>
        <Text style={styles.catchUpSubtitle}>
          Review {pastSessions.length} past session{pastSessions.length > 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.bulkActions}>
        <Pressable
          style={styles.bulkButton}
          onPress={() => {
            const updated = new Map(catchUpAttendance);
            pastSessions.forEach(s => updated.set(s.id, "present"));
            setCatchUpAttendance(updated);
          }}
        >
          <Text style={styles.bulkButtonText}>Mark All Present</Text>
        </Pressable>
        <Pressable
          style={[styles.bulkButton, styles.bulkButtonSecondary]}
          onPress={() => {
            const updated = new Map(catchUpAttendance);
            pastSessions.forEach(s => updated.set(s.id, "absent"));
            setCatchUpAttendance(updated);
          }}
        >
          <Text style={[styles.bulkButtonText, styles.bulkButtonTextSecondary]}>Mark All Absent</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.catchUpList}>
        {pastSessions.map(s => {
          const date = new Date(s.startTime);
          const status = catchUpAttendance.get(s.id) || "present";
          return (
            <View key={s.id} style={styles.catchUpRow}>
              <View style={styles.catchUpDate}>
                <Text style={styles.catchUpDateDay}>
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                </Text>
                <Text style={styles.catchUpDateNum}>
                  {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </View>
              <View style={styles.catchUpOptions}>
                {(["present", "absent", "holiday"] as const).map(opt => (
                  <Pressable
                    key={opt}
                    style={[styles.catchUpOption, status === opt && styles.catchUpOptionActive]}
                    onPress={() => {
                      const updated = new Map(catchUpAttendance);
                      updated.set(s.id, opt);
                      setCatchUpAttendance(updated);
                    }}
                  >
                    <View style={[styles.radioSmall, status === opt && styles.radioSmallActive]} />
                    <Text style={[styles.catchUpOptionText, status === opt && styles.catchUpOptionTextActive]}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Pressable
        style={[styles.confirmButton, saveCatchUpMutation.isPending && styles.confirmButtonDisabled]}
        onPress={handleSaveCatchUp}
        disabled={saveCatchUpMutation.isPending}
      >
        <Text style={styles.confirmButtonText}>
          {saveCatchUpMutation.isPending ? "Saving..." : "Save & Add Player"}
        </Text>
      </Pressable>
    </>
  );

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={[styles.container, { paddingBottom: insets.bottom + Spacing.md }]}>
          <LinearGradient
            colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
            style={StyleSheet.absoluteFill}
          />

          <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.headerTitle}>Session Details</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {showCatchUp ? renderCatchUpContent() : 
             showAddPlayer ? renderAddPlayerContent() :
             showExtendOptions ? renderExtendOptions() :
             showEndConfirm ? renderEndConfirm() :
             showCancelConfirm ? renderCancelConfirm() :
             renderMainContent()}
          </ScrollView>
        </View>

      {/* Past Sessions Confirmation Modal */}
      {showPastSessionsConfirm ? (
        <Modal visible={!!showPastSessionsConfirm} animationType="fade" transparent>
          <View style={styles.creditWarningOverlay}>
            <View style={styles.creditWarningContent}>
              <View style={[styles.creditWarningIcon, { backgroundColor: `${Colors.dark.orange}20` }]}>
                <Ionicons name="calendar-outline" size={48} color={Colors.dark.orange} />
              </View>
              <Text style={styles.creditWarningTitle}>Past Sessions Found</Text>
              <Text style={styles.creditWarningMessage}>
                This player has {showPastSessionsConfirm.weeksDiff} past session{showPastSessionsConfirm.weeksDiff > 1 ? 's' : ''} since {showPastSessionsConfirm.startDate.toLocaleDateString()}.
              </Text>
              <Text style={styles.creditWarningNote}>
                Do you want to review attendance for these sessions?
              </Text>
              
              <View style={styles.creditWarningButtons}>
                <Pressable 
                  onPress={handleSkipPastSessions} 
                  style={styles.creditWarningCancelBtn}
                >
                  <Text style={styles.creditWarningCancelText}>Skip</Text>
                </Pressable>
                <Pressable 
                  onPress={handleReviewAttendance} 
                  style={[styles.creditWarningAddBtn, { backgroundColor: Colors.dark.orange }]}
                >
                  <Text style={styles.creditWarningAddText}>Review Attendance</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
      
      {/* Credit Mismatch Warning Modal */}
      <Modal visible={!!creditMismatchWarning} animationType="fade" transparent>
      <View style={styles.creditWarningOverlay}>
        <View style={styles.creditWarningContent}>
          <View style={styles.creditWarningIcon}>
            <Ionicons name="warning" size={48} color="#FBBF24" />
          </View>
          <Text style={styles.creditWarningTitle}>No Matching Credits</Text>
          <Text style={styles.creditWarningMessage}>
            {creditMismatchWarning?.message}
          </Text>
          <Text style={styles.creditWarningNote}>
            This player needs {creditMismatchWarning?.requiredCreditType?.replace("_", "-")} credits to join this session.
          </Text>
          
          <View style={styles.creditWarningButtons}>
            <Pressable 
              onPress={() => setCreditMismatchWarning(null)} 
              style={styles.creditWarningCancelBtn}
            >
              <Text style={styles.creditWarningCancelText}>Cancel</Text>
            </Pressable>
            <Pressable 
              onPress={handleAddPlayerAnyway} 
              style={styles.creditWarningAddBtn}
            >
              <Text style={styles.creditWarningAddText}>Add Anyway</Text>
            </Pressable>
          </View>
          
          <Text style={styles.creditWarningFooter}>
            The player/parent will need to purchase credits before attending.
          </Text>
        </View>
      </View>
      </Modal>

      {/*
        Stacking convention (see replit.md → Conventions → Modal stacking):
        Every sub-drawer/modal opened from inside this session detail drawer is
        rendered BELOW as a child of the parent <Modal> that opens at line ~2368
        and closes at the bottom (line ~2602). Do NOT move them outside the parent
        Modal — RN sibling <Modal>s mount into separate native windows and would
        appear behind this drawer. Sub-drawers using presentationStyle="pageSheet"
        stack correctly above the parent pageSheet on iOS 13+; on Android they
        present as full-screen sheets which also stacks correctly.
      */}
      {/* In-Session Feedback Drawer */}
      <InSessionFeedbackDrawer
        visible={showQuickFeedback}
        sessionId={session.id}
        players={(liveSession?.players || []).filter(p => !removedPlayerIds.has(p.id))}
        onClose={() => {
          setShowQuickFeedback(false);
          setFeedbackInitialPlayerId(null);
        }}
        initialPlayerId={feedbackInitialPlayerId}
      />

      {/* Player Feedback History Sheet */}
      {selectedPlayerForHistory ? (
        <PlayerFeedbackHistorySheet
          visible={!!selectedPlayerForHistory}
          player={selectedPlayerForHistory}
          sessionId={session.id}
          onClose={() => setSelectedPlayerForHistory(null)}
          onGiveFeedback={(playerId) => {
            setSelectedPlayerForHistory(null);
            setFeedbackInitialPlayerId(playerId);
            setShowQuickFeedback(true);
          }}
        />
      ) : null}

      {/* Stroke Analysis Modal */}
      <StrokeFeedbackModal
        visible={showStrokeFeedback}
        session={liveSession ? {
          ...liveSession,
          players: (liveSession.players || []).filter(p => !removedPlayerIds.has(p.id)),
        } : null}
        onClose={() => setShowStrokeFeedback(false)}
        onComplete={() => setShowStrokeFeedback(false)}
      />

      {/* Quick Assessment Drawer */}
      <QuickBaselineDrawer
        visible={!!baselinePlayer}
        player={baselinePlayer}
        onClose={() => setBaselinePlayer(null)}
        onComplete={() => setBaselinePlayer(null)}
      />

      {/* Deep Assessment Drawer */}
      <DeepAssessmentDrawer
        visible={!!deepAssessPlayer}
        player={deepAssessPlayer}
        onClose={() => setDeepAssessPlayer(null)}
      />

      <AISessionPlanModal
        visible={showAISessionPlan}
        onClose={() => setShowAISessionPlan(false)}
        sessionId={session.id}
        sessionType={session.sessionType}
      />

      {feedbackPickerMode !== null && (() => {
        const modeConfig: Record<string, { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; color: string }> = {
          evidence: { label: "Skill Evidence", icon: "videocam", color: "#F472B6" },
          baseline: { label: "Quick Assessment", icon: "clipboard", color: Colors.dark.gold },
          deep: { label: "Deep Assessment", icon: "bar-chart", color: "#A78BFA" },
          ai: { label: "Coach with AI", icon: "sparkles", color: GlowColors.primary },
        };
        const cfg = modeConfig[feedbackPickerMode] ?? modeConfig.ai;
        const players = (liveSession?.players || []).filter(p => !removedPlayerIds.has(p.id) && !p.isGuest);
        return (
          <Modal
            visible={feedbackPickerMode !== null}
            transparent
            animationType="slide"
            onRequestClose={() => setFeedbackPickerMode(null)}
          >
            <Pressable style={styles.pickerOverlay} onPress={() => setFeedbackPickerMode(null)}>
              <View style={styles.pickerSheet}>
                <View style={styles.pickerHandle} />
                <View style={styles.pickerHeader}>
                  <View style={[styles.pickerModeIconWrap, { backgroundColor: cfg.color + "20", borderColor: cfg.color + "40" }]}>
                    <Ionicons name={cfg.icon} size={24} color={cfg.color} />
                  </View>
                  <Text style={styles.pickerTitle}>{cfg.label}</Text>
                  <Text style={styles.pickerSubtitle}>Select a player</Text>
                </View>
                <View style={styles.pickerPlayerList}>
                  {players.map((p, index) => (
                    <Pressable
                      key={p.id}
                      style={({ pressed }) => [
                        styles.pickerPlayerRow,
                        index === 0 && styles.pickerPlayerRowFirst,
                        pressed && styles.pickerPlayerRowPressed,
                      ]}
                      onPress={() => {
                        const mode = feedbackPickerMode;
                        setFeedbackPickerMode(null);
                        setTimeout(() => {
                          if (mode === "evidence") {
                            navigation.navigate("EvidenceCapture", { sessionId: session.id, playerId: p.id });
                          } else if (mode === "baseline") {
                            setBaselinePlayer(p);
                          } else if (mode === "ai") {
                            openAIChat({
                              sessionId: session.id,
                              playerId: p.id,
                              playerName: p.name,
                              sessionType: session.sessionType,
                              remainingPlayers: [],
                            });
                          } else {
                            setDeepAssessPlayer(p);
                          }
                        }, 300);
                      }}
                    >
                      <View style={[styles.pickerPlayerAvatar, { backgroundColor: cfg.color + "20", borderColor: cfg.color + "50" }]}>
                        <Text style={[styles.pickerPlayerInitial, { color: cfg.color }]}>{p.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.pickerPlayerName}>{p.name}</Text>
                      <View style={styles.pickerChevronWrap}>
                        <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            </Pressable>
          </Modal>
        );
      })()}
      </Modal>

      {liveSession?.seriesId ? (
        <SendGroupReminderModal
          visible={showReminderModal}
          onClose={() => setShowReminderModal(false)}
          seriesId={liveSession.seriesId}
          seriesName={reminderSeriesName}
          activePlayerCount={reminderActiveCount}
          lessonSessionId={liveSession.id}
        />
      ) : null}
    </>
  );
}

const getTypeColor = (type: string) => {
  switch (type) {
    case "private": return Colors.dark.primary;
    case "semi_private": return Colors.dark.xpCyan;
    case "group": return Colors.dark.orange;
    case "physical": return Colors.dark.gold;
    default: return Colors.dark.disabled;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "present": return Colors.dark.primary;
    case "late": return Colors.dark.gold;
    case "absent": return Colors.dark.error;
    default: return Colors.dark.disabled;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  sessionInfo: {
    marginBottom: Spacing.xl,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  typeBadgeText: {
    ...Typography.small,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  sessionTime: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  sessionDate: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  courtRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  courtName: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  courtPickerContainer: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  courtPickerTitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  courtPickerItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  courtPickerItemActive: {
    backgroundColor: "rgba(0, 255, 135, 0.1)",
  },
  courtPickerItemText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  playersSection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  dropInSubLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: "#F39C1215",
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
  },
  dropInSubLabelText: {
    ...Typography.caption,
    color: "#F39C12",
    fontWeight: "600",
    fontSize: 12,
  },
  playersList: {
    gap: Spacing.sm,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  playerAvatarText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  noPlayersText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  playerRowGuest: {
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
    borderStyle: "dashed",
  },
  playerAvatarGuest: {
    backgroundColor: Colors.dark.xpCyan,
  },
  playerNameContainer: {
    flex: 1,
  },
  playerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 2,
  },
  playerLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  levelDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  playerLevelText: {
    ...Typography.small,
    fontSize: 11,
    fontWeight: "500",
  },
  playerSkillText: {
    ...Typography.small,
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
  },
  convertHint: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontSize: 10,
  },
  playerRowContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  playerRemoveButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  removePlayerSection: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 77, 77, 0.3)",
  },
  removePlayerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  removePlayerTitle: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  removePlayerName: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  removePlayerLabel: {
    ...Typography.sectionTitle,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
  },
  removePlayerInput: {
    minHeight: 80,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
    ...Typography.body,
    textAlignVertical: "top",
  },
  removeDateOptions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  removeDateOption: {
    flex: 1,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  removeDateOptionActive: {
    borderColor: Colors.dark.error,
    backgroundColor: Colors.dark.error + "15",
  },
  removeDateOptionText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  removeDateOptionTextActive: {
    color: Colors.dark.error,
    fontWeight: "600",
  },
  removePlayerConfirmButton: {
    backgroundColor: Colors.dark.error,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  removePlayerConfirmButtonDisabled: {
    opacity: 0.6,
  },
  removePlayerConfirmText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  guestConvertSection: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  guestConvertHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  guestConvertTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  guestConvertName: {
    ...Typography.h3,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.md,
  },
  guestConvertInput: {
    height: 44,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    ...Typography.body,
    borderWidth: 1,
    borderColor: "transparent",
  },
  guestConvertInputError: {
    borderColor: Colors.dark.error,
    marginBottom: Spacing.xs,
  },
  conversionErrorText: {
    ...Typography.small,
    color: Colors.dark.error,
    marginBottom: Spacing.sm,
  },
  guestConvertLabel: {
    ...Typography.sectionTitle,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
  },
  ballLevelRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  ballLevelOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  ballLevelSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  ballLevelText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  ballLevelTextSelected: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  convertBtn: {
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  convertBtnDisabled: {
    opacity: 0.5,
  },
  convertBtnText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  guestPanel: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  guestTabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  guestTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.elevated,
  },
  guestTabActive: {
    backgroundColor: Colors.dark.xpCyan,
  },
  guestTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  guestTabTextActive: {
    color: Colors.dark.buttonText,
  },
  guestInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  guestInput: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
    marginBottom: Spacing.sm,
  },
  guestAddBtn: {
    width: 44,
    height: 44,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  guestAddBtnDisabled: {
    opacity: 0.5,
  },
  guestCancelBtn: {
    width: 36,
    height: 36,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  guestPlayerList: {
    maxHeight: 240,
  },
  guestPlayerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  guestPlayerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  guestPlayerInitial: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  guestPlayerName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  guestPlayerLevel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  guestNoResults: {
    textAlign: "center",
    color: Colors.dark.textMuted,
    fontSize: 13,
    paddingVertical: Spacing.lg,
  },
  weeksPickerRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  weekOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  weekOptionActive: {
    backgroundColor: Colors.dark.xpCyan,
  },
  weekOptionText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: Colors.dark.textMuted,
    textAlign: "center" as const,
  },
  weekOptionTextActive: {
    color: Colors.dark.buttonText,
  },
  guestConfirmBtn: {
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  guestConfirmBtnText: {
    color: Colors.dark.buttonText,
    fontSize: 14,
    fontWeight: "700" as const,
  },
  actionsSection: {
    gap: Spacing.md,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  actionButtonText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  dangerActionButton: {
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  warningActionButton: {
    borderWidth: 1,
    borderColor: Colors.dark.orange + "40",
  },
  introCard: {
    backgroundColor: Colors.dark.xpCyan + "10",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  introCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  introCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.xpCyan + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  introCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    marginBottom: 2,
  },
  introCardText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 16,
  },
  introCardClose: {
    padding: 4,
  },
  introCardDismiss: {
    alignSelf: "flex-end",
    marginTop: Spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  introCardDismissText: {
    fontSize: 11,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  briefCard: {
    backgroundColor: "rgba(167, 139, 250, 0.08)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.25)",
  },
  briefCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  briefCardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(167, 139, 250, 0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  briefCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#A78BFA",
    marginBottom: 2,
  },
  briefCardSubtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 17,
  },
  briefCardBody: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  briefPlayerBlock: {
    gap: 4,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(167, 139, 250, 0.15)",
  },
  briefPlayerName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#A78BFA",
    marginBottom: 2,
  },
  briefBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  briefBulletDot: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 18,
    marginTop: 0,
  },
  briefBulletText: {
    fontSize: 12,
    color: Colors.dark.text,
    lineHeight: 18,
    flex: 1,
  },
  playersGrid: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  playersGridRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  playerCardSpacer: {
    flex: 1,
  },
  playerCard: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    position: "relative",
  },
  playerCardGuest: {
    borderStyle: "dashed" as any,
    borderColor: Colors.dark.xpCyan + "40",
  },
  playerCardRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.error + "20",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  playerCardContent: {
    alignItems: "center",
    paddingTop: Spacing.xs,
  },
  playerCardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
    marginBottom: Spacing.xs,
  },
  playerCardAvatarGuest: {
    backgroundColor: Colors.dark.xpCyan + "20",
    borderColor: Colors.dark.xpCyan + "40",
    borderStyle: "dashed" as any,
  },
  playerCardInitial: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  playerCardName: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: 4,
  },
  playerCardLevel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  playerCardLevelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  playerCardLevelText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  playerCardStatus: {
    position: "absolute",
    top: Spacing.sm,
    left: Spacing.sm,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  noPlayersCard: {
    alignItems: "center",
    padding: Spacing.xl,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    gap: Spacing.sm,
  },
  quickAddRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  quickAddCard: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
  },
  quickAddIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  quickAddLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  attendanceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.orange + "15",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.orange + "30",
  },
  attendanceCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  attendanceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.orange + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  attendanceCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.orange,
    marginBottom: 2,
  },
  attendanceCardSubtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  feedbackCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.gold + "15",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
  },
  quickFeedbackCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GlowColors.primary + "15",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: GlowColors.primary + "30",
  },
  xpIndicator: {
    backgroundColor: GlowColors.primary + "30",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    borderRadius: BorderRadius.sm,
  },
  xpIndicatorText: {
    fontSize: 11,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  sessionControlsSection: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  controlsSectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  controlsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  controlButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
  },
  controlButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cancelConfirmButton: {
    flex: 1,
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelConfirmButtonText: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  reasonInputContainer: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  reasonInput: {
    ...Typography.body,
    color: Colors.dark.text,
    padding: Spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
  },
  pickerContainer: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.orange,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    overflow: "hidden",
  },
  picker: {
    color: Colors.dark.text,
    backgroundColor: "transparent",
  },
  pickerItem: {
    color: Colors.dark.text,
    fontSize: 16,
  },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  dropdownButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  dropdownPlaceholder: {
    color: Colors.dark.textMuted,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: Backgrounds.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  dropdownMenu: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    width: "100%",
    maxWidth: 400,
    maxHeight: 400,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  dropdownHeaderText: {
    ...Typography.body,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  dropdownScroll: {
    maxHeight: 300,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  dropdownItemSelected: {
    backgroundColor: Colors.dark.orange + "20",
  },
  dropdownItemText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  dropdownItemTextSelected: {
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  cancelDoneButton: {
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  cancelDoneButtonText: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  extendOptionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  extendOption: {
    flex: 1,
    minWidth: 80,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  extendOptionTime: {
    ...Typography.h2,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
  },
  extendOptionLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  endConfirmContent: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  endConfirmText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  endConfirmButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
    width: "100%",
  },
  endCancelButton: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  endCancelButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  endConfirmButton: {
    flex: 1,
    backgroundColor: Colors.dark.error,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
  },
  endConfirmButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  stepTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  stepLabel: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
    paddingVertical: Spacing.xs,
  },
  playerSelectList: {
    flex: 1,
  },
  playerSelectItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  playerSelectInfo: {
    flex: 1,
  },
  playerSelectName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  playerSelectLevel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  selectedPlayerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: GlowColors.primary,
    marginBottom: Spacing.xl,
  },
  selectedPlayerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  dateOptions: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  dateOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  dateOptionActive: {
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: GlowColors.primary,
  },
  dateOptionText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.dark.disabled,
    justifyContent: "center",
    alignItems: "center",
  },
  radioOuterActive: {
    borderColor: Colors.dark.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.primary,
  },
  calendarContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  calendarMonth: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  calendarWeekDays: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  calendarWeekDay: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    width: "14.28%",
    textAlign: "center",
  },
  calendarDays: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarDay: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: BorderRadius.full,
  },
  calendarDayEmpty: {
    width: "14.28%",
    aspectRatio: 1,
  },
  calendarDaySelected: {
    backgroundColor: GlowColors.primary,
  },
  calendarDayDisabled: {
    opacity: 0.3,
  },
  calendarDayText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  calendarDayTextSelected: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  calendarDayTextDisabled: {
    color: Colors.dark.textMuted,
  },
  confirmButton: {
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  catchUpInfo: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  catchUpPlayerName: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  catchUpSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  bulkActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  bulkButton: {
    flex: 1,
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  bulkButtonSecondary: {
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  bulkButtonText: {
    ...Typography.small,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  bulkButtonTextSecondary: {
    color: Colors.dark.text,
  },
  catchUpList: {
    flex: 1,
  },
  catchUpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  catchUpDate: {
    width: 60,
  },
  catchUpDateDay: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  catchUpDateNum: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  catchUpOptions: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
  },
  catchUpOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
  },
  catchUpOptionActive: {
    backgroundColor: Backgrounds.card,
  },
  radioSmall: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.dark.disabled,
  },
  radioSmallActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary,
  },
  catchUpOptionText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  catchUpOptionTextActive: {
    color: Colors.dark.text,
  },
  creditWarningOverlay: {
    flex: 1,
    backgroundColor: Backgrounds.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  creditWarningContent: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  creditWarningIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(251, 191, 36, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  creditWarningTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  creditWarningMessage: {
    ...Typography.body,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  creditWarningNote: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  creditWarningButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  creditWarningCancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  creditWarningCancelText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  creditWarningAddBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: GlowColors.primary,
    alignItems: "center",
  },
  creditWarningAddText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  creditWarningFooter: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    marginTop: Spacing.lg,
    fontStyle: "italic",
  },
  waitlistSection: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  waitlistHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  waitlistHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  waitlistHeaderTitle: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  waitlistContent: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    padding: Spacing.sm,
  },
  waitlistEmptyText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingVertical: Spacing.md,
  },
  waitlistEntry: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border + "50",
  },
  waitlistEntryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  waitlistPositionCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.xpCyan + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  waitlistPositionNumber: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
  },
  waitlistPlayerInfo: {
    flex: 1,
  },
  waitlistPlayerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    fontSize: 13,
  },
  waitlistPlayerMeta: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  waitlistStatusBadge: {
    backgroundColor: Colors.dark.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  waitlistStatusOffered: {
    backgroundColor: "#F59E0B30",
    borderWidth: 1,
    borderColor: "#F59E0B60",
  },
  waitlistStatusText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  waitlistStatusTextOffered: {
    color: "#F59E0B",
  },
  feedbackHubContainer: {
    marginBottom: Spacing.md,
  },
  feedbackHubLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    paddingHorizontal: 2,
  },
  feedbackHubGrid: {
    gap: Spacing.sm,
  },
  feedbackHubGridRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  feedbackHubTile: {
    flex: 1,
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minHeight: 88,
  },
  feedbackHubIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  feedbackHubTileTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  feedbackHubTileSubtitle: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    lineHeight: 14,
  },
  feedbackHubXp: {
    marginTop: 4,
    backgroundColor: GlowColors.primary + "25",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  feedbackHubXpText: {
    fontSize: 10,
    fontWeight: "800",
    color: GlowColors.primary,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderTopColor: "rgba(255, 255, 255, 0.22)",
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
  },
  pickerHandle: {
    width: 44,
    height: 5,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: Spacing.xl,
  },
  pickerHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  pickerModeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
    textAlign: "center",
  },
  pickerSubtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  pickerPlayerList: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  pickerPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  pickerPlayerRowFirst: {
    borderTopWidth: 0,
  },
  pickerPlayerRowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  pickerPlayerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerPlayerInitial: {
    fontSize: 16,
    fontWeight: "700",
  },
  pickerPlayerName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  pickerChevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
});

const sessionBallChipStyles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    gap: 5,
  },
  chipSelected: {
    backgroundColor: "rgba(0, 229, 255, 0.15)",
    borderColor: Colors.dark.successNeon,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "500",
  },
  chipTextSelected: {
    color: Colors.dark.successNeon,
    fontWeight: "600",
  },
});
