import logger from "@/lib/logger";
import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { convertUTCTimeToLocal, formatCredits } from "@/lib/dateUtils";
import { useCoach } from "@/coach/context/CoachContext";
import { WebCalendarPicker } from "@/components/WebCalendarPicker";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import InSessionFeedbackDrawer from "./InSessionFeedbackDrawer";
import { DeepAssessmentDrawer } from "./DeepAssessmentDrawer";
import { useTabNavigation } from "@/components/TabNavigationContext";

import { styles } from "./series-detail/seriesDetailStyles";
import type { PlayerCredits, Player, FeedbackData, ProgressData, SessionInstance, SeriesDetail, SeriesDetailDrawerProps, TabId } from "./series-detail/types";
import { TABS, DAY_NAMES, SESSION_TYPE_COLORS, BALL_LEVEL_COLORS, getSessionTypeColor, getBallLevelColor, isPlayerActiveForSession } from "./series-detail/utils";
import { SeriesTimelineTab } from "./series-detail/SeriesTimelineTab";
import { SeriesFeedbackTab } from "./series-detail/SeriesFeedbackTab";
import { SeriesProgressTab } from "./series-detail/SeriesProgressTab";
import { SeriesPlanTab } from "./series-detail/SeriesPlanTab";
import { SeriesRestoreSessionModal } from "./series-detail/SeriesRestoreSessionModal";
import { SeriesRescheduleSessionModal } from "./series-detail/SeriesRescheduleSessionModal";
import { SeriesPausePlayerModal } from "./series-detail/SeriesPausePlayerModal";
import { SeriesRemovePlayerModal } from "./series-detail/SeriesRemovePlayerModal";
import { SeriesEditJoinDateModal } from "./series-detail/SeriesEditJoinDateModal";
import { SeriesExtendClassModal } from "./series-detail/SeriesExtendClassModal";
import { SeriesSmartFillModal } from "./series-detail/SeriesSmartFillModal";
import { SeriesAddPlayerModal } from "./series-detail/SeriesAddPlayerModal";
import { SeriesAttendanceModal } from "./series-detail/SeriesAttendanceModal";
import { SeriesExtraLessonModal } from "./series-detail/SeriesExtraLessonModal";
import { SeriesOverviewTab } from "./series-detail/SeriesOverviewTab";
export default function SeriesDetailDrawer({
  visible,
  seriesId,
  onClose,
}: SeriesDetailDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { academy, coach: currentCoach } = useCoach();
  const { navigateToTab } = useTabNavigation();

  const handlePlayerTap = (playerId: string) => {
    onClose();
    setTimeout(() => {
      navigateToTab("Players", { screen: "PlayerProfile", params: { playerId } });
    }, 300);
  };
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [joinDate, setJoinDate] = useState<Date>(new Date());
  const [playerSearch, setPlayerSearch] = useState("");
  const [ballLevelFilter, setBallLevelFilter] = useState<string | null>(null);
  const [showPackageSelection, setShowPackageSelection] = useState(false);
  const [selectedPackageTemplateId, setSelectedPackageTemplateId] = useState<string | null>(null);
  const [isGuestAdd, setIsGuestAdd] = useState(false);
  const getDefaultGuestUntil = () => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d;
  };
  const [guestUntilDate, setGuestUntilDate] = useState<Date>(getDefaultGuestUntil());
  const [showGuestDatePicker, setShowGuestDatePicker] = useState(false);
  const [showSmartFill, setShowSmartFill] = useState(false);
  const [showAttendanceBackfill, setShowAttendanceBackfill] = useState(false);
  const [selectedAttendance, setSelectedAttendance] = useState<Record<string, boolean>>({});
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoringSession, setRestoringSession] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionInstance | null>(null);
  const [sessionAttendance, setSessionAttendance] = useState<Record<string, "present" | "absent" | "vacation">>({});
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [cancellingSession, setCancellingSession] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFeedbackDrawer, setShowFeedbackDrawer] = useState(false);
  const [feedbackSessionId, setFeedbackSessionId] = useState<string | null>(null);
  const [feedbackPlayers, setFeedbackPlayers] = useState<Array<{id: string; name: string}>>([]);
  const [showDeepAssessment, setShowDeepAssessment] = useState(false);
  const [assessmentPlayer, setAssessmentPlayer] = useState<{id: string; name: string; ballLevel?: string | null} | null>(null);
  const [editingMaxPlayers, setEditingMaxPlayers] = useState(false);
  const [newMaxPlayers, setNewMaxPlayers] = useState("");
  const [playerActionMenuId, setPlayerActionMenuId] = useState<string | null>(null);
  const [pausingPlayerId, setPausingPlayerId] = useState<string | null>(null);
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);
  
  // Pause modal state
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pausePlayerId, setPausePlayerId] = useState<string | null>(null);
  const [pauseFromDate, setPauseFromDate] = useState<Date>(new Date());
  const [pauseUntilDate, setPauseUntilDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  });
  const [pauseReason, setPauseReason] = useState("");
  const [showPauseFromPicker, setShowPauseFromPicker] = useState(false);
  const [showPauseUntilPicker, setShowPauseUntilPicker] = useState(false);
  
  // Restore identity modal state
  const [showRestoreIdentityModal, setShowRestoreIdentityModal] = useState(false);
  const [restoreIdentityPlayerId, setRestoreIdentityPlayerId] = useState<string | null>(null);
  const [restoreIdentityName, setRestoreIdentityName] = useState("");
  const [restoreIdentityEmail, setRestoreIdentityEmail] = useState("");
  const [restoreIdentityPhone, setRestoreIdentityPhone] = useState("");

  // Complete / Delete series confirm modal state
  const [showSeriesCompleteConfirm, setShowSeriesCompleteConfirm] = useState(false);
  const [showSeriesDeleteConfirm, setShowSeriesDeleteConfirm] = useState(false);

  // Remove modal state
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removePlayerId, setRemovePlayerId] = useState<string | null>(null);
  const [removeDate, setRemoveDate] = useState<Date>(new Date());
  const [showRemoveDatePicker, setShowRemoveDatePicker] = useState(false);
  
  // Edit join date modal state
  const [showEditJoinDateModal, setShowEditJoinDateModal] = useState(false);
  const [editJoinDatePlayerId, setEditJoinDatePlayerId] = useState<string | null>(null);
  const [editJoinDate, setEditJoinDate] = useState<Date>(new Date());
  const [showEditJoinDatePicker, setShowEditJoinDatePicker] = useState(false);
  const [savingJoinDate, setSavingJoinDate] = useState(false);
  
  // Timeline scroll ref
  const timelineScrollRef = useRef<ScrollView>(null);
  const TIMELINE_ITEM_HEIGHT = 72; // Approximate height of each timeline item
  
  // Create package inline form state
  const [showCreatePackageForm, setShowCreatePackageForm] = useState(false);
  const [newPackageName, setNewPackageName] = useState("");
  const [newPackageCredits, setNewPackageCredits] = useState("");
  
  // Credit packages accordion state
  const [expandedCreditType, setExpandedCreditType] = useState<string | null>(null);
  const [selectedCreditPackage, setSelectedCreditPackage] = useState<{ creditType: string; credits: number; price: string } | null>(null);
  const [newPackagePricePerCredit, setNewPackagePricePerCredit] = useState("");
  
  // Transfer session state - now inline within attendance modal
  const [attendanceModalView, setAttendanceModalView] = useState<"attendance" | "transfer">("attendance");
  const [transferringSession, setTransferringSession] = useState(false);
  const [selectedTargetCoachId, setSelectedTargetCoachId] = useState<string | null>(null);
  
  // Reschedule session state
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleTime, setRescheduleTime] = useState<Date>(new Date());
  const [rescheduleDate, setRescheduleDate] = useState<Date>(new Date());
  const [showRescheduleTimePicker, setShowRescheduleTimePicker] = useState(false);
  const [showRescheduleDatePicker, setShowRescheduleDatePicker] = useState(false);
  const [reschedulingSession, setReschedulingSession] = useState(false);

  const { data: series, isLoading } = useQuery<SeriesDetail>({
    queryKey: [`/api/coach/series/${seriesId}`],
    enabled: !!seriesId && visible,
  });

  // Auto-scroll to current/next lesson when timeline tab becomes active
  useEffect(() => {
    if (activeTab === "timeline" && series?.sessions?.length) {
      const now = new Date();
      const sortedSessions = [...(series.sessions || [])].sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
      
      // Find the session closest to today:
      // 1. Today's session (highest priority)
      // 2. Next upcoming session (closest future date)
      // 3. Most recent past session that needs attention
      let targetIndex = -1;
      let closestUpcomingIndex = -1;
      let mostRecentPastIndex = -1;
      
      for (let i = 0; i < sortedSessions.length; i++) {
        const sessionDate = new Date(sortedSessions[i].startTime);
        const isToday = sessionDate.toDateString() === now.toDateString();
        const isFuture = sessionDate > now;
        const isPast = sessionDate < now;
        const isCancelled = sortedSessions[i].status === "cancelled" || sortedSessions[i].status === "skipped";
        
        if (isToday && !isCancelled) {
          targetIndex = i;
          break;
        }
        
        // Track closest upcoming (last in descending sort = closest to now)
        if (isFuture && !isCancelled) {
          closestUpcomingIndex = i;
        }
        
        // Track most recent past session (first past session in descending sort)
        if (isPast && mostRecentPastIndex === -1) {
          mostRecentPastIndex = i;
        }
      }
      
      // If no today session, use closest upcoming, then most recent past
      if (targetIndex === -1) {
        targetIndex = closestUpcomingIndex !== -1 ? closestUpcomingIndex : mostRecentPastIndex;
      }
      
      if (targetIndex >= 0) {
        setTimeout(() => {
          timelineScrollRef.current?.scrollTo({
            y: targetIndex * TIMELINE_ITEM_HEIGHT,
            animated: true,
          });
        }, 150);
      }
    }
  }, [activeTab, series?.sessions]);

  // Build display title - startTime is stored as UTC (HH:MM), convert to local academy time
  const displayTitle = useMemo(() => {
    if (!series) return "";
    const timezone = academy?.timezone || "Asia/Dubai";
    const localStartTime = convertUTCTimeToLocal(series.startTime, timezone);
    
    const sessionTypeLabels: Record<string, string> = {
      private: "Private Lesson",
      semi_private: "Semi-Private",
      semi: "Semi-Private",
      group: "Group Session",
      physical: "Physical Training",
      activity: "Activity",
      squad: "Squad Training",
      clinic: "Clinic",
      camp: "Camp",
    };
    const typeLabel = sessionTypeLabels[series.sessionType] || series.sessionType || "Training";
    
    if (series.dayOfWeek === -1) {
      return series.title || `${typeLabel} - Flexible`;
    }
    
    const dayName = DAY_NAMES[series.dayOfWeek];
    return `${typeLabel} - ${dayName} ${localStartTime}`;
  }, [series, academy?.timezone]);

  const { data: feedbackData, isLoading: feedbackLoading } = useQuery<FeedbackData>({
    queryKey: [`/api/coach/series/${seriesId}/feedback`],
    enabled: !!seriesId && visible && activeTab === "feedback",
  });

  const { data: progressData, isLoading: progressLoading } = useQuery<ProgressData>({
    queryKey: [`/api/coach/series/${seriesId}/progress`],
    enabled: !!seriesId && visible && activeTab === "progress",
  });

  // Query all players for the add player modal
  interface AvailablePlayer {
    id: string;
    name: string;
    ballLevel?: string | null;
    profilePhotoUrl?: string | null;
  }
  const { data: allPlayers = [] } = useQuery<AvailablePlayer[]>({
    queryKey: ["/api/players"],
    enabled: showAddPlayerModal,
  });

  // Query package templates for package assignment
  interface PackageTemplate {
    id: string;
    name: string;
    credits: number;
    price: string;
    currency: string;
    validityDays: number;
  }
  const { data: packageTemplates = [] } = useQuery<PackageTemplate[]>({
    queryKey: ["/api/billing/package-templates"],
    enabled: showPackageSelection,
  });

  // Query credit packages (auto-priced based on session pricing)
  interface CreditPackage {
    creditType: string;
    credits: number;
    pricePerCredit: string;
    totalPrice: string;
    currency: string;
  }
  const { data: creditPackages = [] } = useQuery<CreditPackage[]>({
    queryKey: ["/api/billing/credit-packages"],
    enabled: showPackageSelection,
  });

  // Group credit packages by type
  const creditPackagesByType = creditPackages.reduce((acc, pkg) => {
    if (!acc[pkg.creditType]) acc[pkg.creditType] = [];
    acc[pkg.creditType].push(pkg);
    return acc;
  }, {} as Record<string, CreditPackage[]>);

  const CREDIT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    private: { label: "Private Credits", color: Colors.dark.sessionPrivate, icon: "person" },
    semi: { label: "Semi-Private Credits", color: Colors.dark.sessionSemiPrivate, icon: "people" },
    group: { label: "Group Credits", color: Colors.dark.sessionGroup, icon: "people-circle" },
  };

  // Query coaches for transfer view (inside attendance modal)
  interface Coach {
    id: string;
    name: string;
    profilePhotoUrl?: string | null;
  }
  const { data: coaches = [] } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
    enabled: attendanceModalView === "transfer" && showAttendanceModal,
  });

  const { data: mergeSuggestions, isLoading: loadingSuggestions } = useQuery<{
    suggestions: Array<{
      playerId: string;
      name: string;
      ballLevel: string | null;
      homeSeriesId: string;
      homeSeriesName: string;
      homeSeriesDay: number;
      pauseFrom: string | null;
      pauseUntil: string | null;
      pauseReason: string | null;
    }>;
    openSlots: number;
  }>({
    queryKey: [`/api/coach/series/${seriesId}/merge-suggestions`],
    enabled: showSmartFill,
  });

  // Transfer session mutation
  const transferSessionMutation = useMutation({
    mutationFn: async ({ sessionId, targetCoachId }: { sessionId: string; targetCoachId: string }) => {
      const response = await apiRequest("POST", `/api/coach/sessions/${sessionId}/transfer`, {
        targetCoachId,
      });
      return response.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      setAttendanceModalView("attendance");
      setShowAttendanceModal(false);
      setSelectedTargetCoachId(null);
      setTransferringSession(false);
    },
    onError: (error: Error) => {
      setTransferringSession(false);
      alert(error.message || "Failed to transfer session");
    },
  });

  // Filter players not already in the series
  const existingPlayerIds = new Set(series?.players?.filter(p => p.status !== "left").map(p => p.id) || []);
  const filteredPlayers = allPlayers.filter(p => 
    !existingPlayerIds.has(p.id) && 
    p.name.toLowerCase().includes(playerSearch.toLowerCase()) &&
    (!ballLevelFilter || (p.ballLevel && p.ballLevel.toLowerCase() === ballLevelFilter))
  );

  // Mutation to add player to series (with optional package assignment)
  const addPlayerMutation = useMutation({
    mutationFn: async (data: { 
      playerId: string; 
      joinDate: string; 
      attendedSessionIds: string[];
      packageTemplateId?: string | null;
      creditPackage?: { creditType: string; credits: number } | null;
      isGuest?: boolean;
      guestUntil?: string | null;
    }) => {
      return apiRequest("POST", `/api/coach/series/${seriesId}/players`, {
        playerId: data.playerId,
        joinDate: data.joinDate,
        attendedSessionIds: data.attendedSessionIds,
        packageTemplateId: data.packageTemplateId,
        creditPackage: data.creditPackage,
        isGuest: data.isGuest || false,
        guestUntil: data.guestUntil || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/package-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      setShowAddPlayerModal(false);
      setShowPackageSelection(false);
      setShowAttendanceBackfill(false);
      setSelectedPlayerId(null);
      setSelectedPackageTemplateId(null);
      setSelectedCreditPackage(null);
      setExpandedCreditType(null);
      setJoinDate(new Date());
      setSelectedAttendance({});
      setPlayerSearch("");
      setBallLevelFilter(null);
      setIsGuestAdd(false);
      setGuestUntilDate(getDefaultGuestUntil());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // Mutation to update max players (and optionally session type)
  const updateMaxPlayersMutation = useMutation({
    mutationFn: async (payload: { maxPlayers?: number; sessionType?: string; confirmTypeChange?: boolean }) => {
      return apiRequest("PATCH", `/api/coach/series/${seriesId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      setEditingMaxPlayers(false);
      setNewMaxPlayers("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any, variables) => {
      // Handle server guard: coach tried to change away from group without explicit confirmation.
      // apiRequest throws Error with message "409: {json-body}".
      // TanStack Query provides `variables` (the original payload) as the second argument.
      const msg: string = err?.message || "";
      if (msg.startsWith("409:")) {
        try {
          const body = JSON.parse(msg.slice(4).trim());
          if (body?.code === "CONFIRM_GROUP_TYPE_CHANGE" && body?.requiresConfirmation) {
            const activePlayerCount: number = body.activePlayerCount ?? 0;
            Alert.alert(
              "Change Session Type?",
              `This is a Group session with ${activePlayerCount} active player(s). Changing the type is permanent and affects all future sessions. Continue?`,
              [
                { text: "Keep as Group", style: "cancel" },
                {
                  text: "Yes, Change Type",
                  style: "destructive",
                  onPress: () => {
                    updateMaxPlayersMutation.mutate({
                      ...variables,
                      confirmTypeChange: true,
                    });
                  },
                },
              ]
            );
          }
        } catch (_e) {
          // non-JSON 409 — ignore, generic error handling covers it
        }
      }
    },
  });

  const handleSaveMaxPlayers = () => {
    const value = parseInt(newMaxPlayers, 10);
    if (!isNaN(value) && value >= 1 && value <= 20) {
      const payload: { maxPlayers: number; sessionType?: string; confirmTypeChange?: boolean } = { maxPlayers: value };

      if (value >= 3 && series?.sessionType === "semi_private") {
        // Auto-upgrade to group when max players >= 3
        payload.sessionType = "group";
        updateMaxPlayersMutation.mutate(payload);
        return;
      }

      if (value < 3 && series?.sessionType === "group") {
        // Downgrading from group requires coach confirmation
        Alert.alert(
          "Change to Semi-Private?",
          `Setting max players to ${value} will change this Group session to Semi-Private. This affects all future sessions. Are you sure?`,
          [
            { text: "Keep as Group", style: "cancel" },
            {
              text: "Change to Semi-Private",
              style: "destructive",
              onPress: () => {
                updateMaxPlayersMutation.mutate({
                  maxPlayers: value,
                  sessionType: "semi_private",
                  confirmTypeChange: true,
                });
              },
            },
          ]
        );
        return;
      }

      updateMaxPlayersMutation.mutate(payload);
    }
  };

  // Mutation to pause a player
  const pausePlayerMutation = useMutation({
    mutationFn: async ({ playerId, pauseFrom, pauseUntil, reason }: { 
      playerId: string; 
      pauseFrom: Date; 
      pauseUntil: Date; 
      reason?: string;
    }) => {
      return apiRequest("POST", `/api/coach/series/${seriesId}/players/${playerId}/pause`, {
        pauseFrom: pauseFrom.toISOString(),
        pauseUntil: pauseUntil.toISOString(),
        reason: reason || "vacation",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      setPausingPlayerId(null);
      setPlayerActionMenuId(null);
      setShowPauseModal(false);
      setPausePlayerId(null);
      setPauseReason("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      setPausingPlayerId(null);
    },
  });

  // Mutation to unpause/reactivate a player
  const unpausePlayerMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest("POST", `/api/coach/series/${seriesId}/players/${playerId}/unpause`, {});
    },
    onMutate: async (playerId: string) => {
      await queryClient.cancelQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      const previous = queryClient.getQueryData([`/api/coach/series/${seriesId}`]);
      queryClient.setQueryData([`/api/coach/series/${seriesId}`], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          players: (old.players || []).map((p: any) =>
            p.id === playerId || p.playerId === playerId
              ? { ...p, status: "active", pauseFrom: null, pauseUntil: null, pauseReason: null }
              : p
          ),
        };
      });
      return { previous };
    },
    onError: (_err: any, _playerId: string, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData([`/api/coach/series/${seriesId}`], context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // Mutation to delete a package template
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return apiRequest("DELETE", `/api/billing/package-templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/package-templates"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // Mutation to remove a player (mark as left)
  const removePlayerMutation = useMutation({
    mutationFn: async ({ playerId, leftAt }: { playerId: string; leftAt: Date }) => {
      return apiRequest("POST", `/api/coach/series/${seriesId}/players/${playerId}/leave`, {
        leftAt: leftAt.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      setRemovingPlayerId(null);
      setPlayerActionMenuId(null);
      setShowRemoveModal(false);

      // Low-count warning: if this is a group series and only 1 active player remains,
      // offer the coach a choice: keep as group or downgrade to semi-private.
      if (series?.sessionType === 'group') {
        const removedId = removePlayerId;
        const remainingActive = (series?.players || []).filter(
          p => p.status === 'active' && p.id !== removedId
        ).length;
        if (remainingActive === 1) {
          setTimeout(() => {
            Alert.alert(
              "1 Player Remaining",
              "This group session now has only 1 active player. Would you like to keep it as a Group lesson, or change it to Semi-Private?",
              [
                { text: "Keep as Group", style: "cancel" },
                {
                  text: "Change to Semi-Private",
                  style: "destructive",
                  onPress: () => {
                    updateMaxPlayersMutation.mutate({
                      sessionType: "semi_private",
                      maxPlayers: 2,
                      confirmTypeChange: true,
                    });
                  },
                },
              ]
            );
          }, 400);
        }
      }

      setRemovePlayerId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      setRemovingPlayerId(null);
    },
  });

  // Mutation to create a new package template
  const createPackageMutation = useMutation({
    mutationFn: async (data: { name: string; credits: number; pricePerCredit: number }) => {
      const result = await apiRequest("POST", "/api/billing/package-templates", {
        name: data.name,
        credits: data.credits,
        pricePerCredit: data.pricePerCredit,
        validityDays: 90,
        currency: "AED",
      });
      return result as unknown as { id: string; name: string; credits: number; price: string };
    },
    onSuccess: async (newTemplate) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/package-templates"] });
      // Auto-select the newly created package
      if (newTemplate?.id) {
        setSelectedPackageTemplateId(newTemplate.id);
      }
      // Reset form and hide it
      setNewPackageName("");
      setNewPackageCredits("");
      setNewPackagePricePerCredit("");
      setShowCreatePackageForm(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Failed to create package. Please try again.");
    },
  });

  const handleCreatePackage = () => {
    const credits = parseInt(newPackageCredits, 10);
    const pricePerCredit = parseFloat(newPackagePricePerCredit);
    
    if (!newPackageName.trim() || isNaN(credits) || credits <= 0 || isNaN(pricePerCredit) || pricePerCredit <= 0) {
      return;
    }
    
    createPackageMutation.mutate({
      name: newPackageName.trim(),
      credits,
      pricePerCredit,
    });
  };

  const handlePausePlayer = (playerId: string) => {
    setPausePlayerId(playerId);
    setPauseFromDate(new Date());
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    setPauseUntilDate(nextWeek);
    setPauseReason("");
    setPlayerActionMenuId(null);
    setShowPauseModal(true);
  };

  const handleConfirmPause = () => {
    if (!pausePlayerId) return;
    setPausingPlayerId(pausePlayerId);
    pausePlayerMutation.mutate({
      playerId: pausePlayerId,
      pauseFrom: pauseFromDate,
      pauseUntil: pauseUntilDate,
      reason: pauseReason || "vacation",
    });
  };

  const handleRemovePlayer = (playerId: string) => {
    setRemovePlayerId(playerId);
    setRemoveDate(new Date());
    setPlayerActionMenuId(null);
    setShowRemoveModal(true);
  };

  const handleConfirmRemove = () => {
    if (!removePlayerId) return;
    setRemovingPlayerId(removePlayerId);
    removePlayerMutation.mutate({
      playerId: removePlayerId,
      leftAt: removeDate,
    });
  };

  const handleReactivatePlayer = (playerId: string) => {
    unpausePlayerMutation.mutate(playerId);
  };

  const restoreIdentityMutation = useMutation({
    mutationFn: async ({ playerId, name, email, phone }: { playerId: string; name: string; email?: string; phone?: string }) => {
      return apiRequest("PATCH", `/api/players/${playerId}`, {
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setShowRestoreIdentityModal(false);
      setRestoreIdentityPlayerId(null);
      setRestoreIdentityName("");
      setRestoreIdentityEmail("");
      setRestoreIdentityPhone("");
      setPlayerActionMenuId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Failed to restore player identity. Please try again.");
    },
  });

  const handleRestoreIdentity = (player: Player) => {
    setRestoreIdentityPlayerId(player.id);
    setRestoreIdentityName("");
    setRestoreIdentityEmail("");
    setRestoreIdentityPhone("");
    setPlayerActionMenuId(null);
    setShowRestoreIdentityModal(true);
  };

  const handleConfirmRestoreIdentity = () => {
    if (!restoreIdentityPlayerId || !restoreIdentityName.trim()) return;
    restoreIdentityMutation.mutate({
      playerId: restoreIdentityPlayerId,
      name: restoreIdentityName.trim(),
      email: restoreIdentityEmail.trim() || undefined,
      phone: restoreIdentityPhone.trim() || undefined,
    });
  };

  const handleEditJoinDate = (player: Player) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditJoinDatePlayerId(player.id);
    setEditJoinDate(player.joinedAt ? new Date(player.joinedAt) : new Date());
    setPlayerActionMenuId(null);
    setShowEditJoinDateModal(true);
  };

  const handleSaveJoinDate = async () => {
    if (!editJoinDatePlayerId || !seriesId) return;
    setSavingJoinDate(true);
    try {
      const formatLocalDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      await apiRequest("PATCH", `/api/coach/series/${seriesId}/players/${editJoinDatePlayerId}/join-date`, {
        joinDate: formatLocalDate(editJoinDate),
      });
      
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      setShowEditJoinDateModal(false);
      setEditJoinDatePlayerId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error updating join date:", error);
    } finally {
      setSavingJoinDate(false);
    }
  };

  // Get past sessions for attendance backfill
  const getPastSessionsSinceJoinDate = () => {
    if (!series) return [];
    
    const toDateOnly = (d: Date) => {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    const joinDateOnly = toDateOnly(joinDate);
    const now = new Date();
    
    return (series?.sessions || []).filter(s => {
      const sessionDate = new Date(s.startTime);
      const sessionDateOnly = toDateOnly(sessionDate);
      return sessionDateOnly >= joinDateOnly && sessionDate < now && s.status === "completed";
    });
  };

  const handleAddPlayerPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAddPlayerModal(true);
  };

  const handlePlayerSelect = (playerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlayerId(playerId);
  };

  const handleContinueToPackage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPackageSelection(true);
  };

  const handleContinueToBackfill = () => {
    const pastSessions = getPastSessionsSinceJoinDate();
    if (pastSessions.length > 0) {
      setShowAttendanceBackfill(true);
    } else {
      handleSavePlayer();
    }
  };

  const handleSkipPackage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPackageTemplateId(null);
    handleContinueToBackfill();
  };

  const handleSelectPackage = (templateId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPackageTemplateId(templateId);
    handleContinueToBackfill();
  };

  const handleSavePlayer = () => {
    if (!selectedPlayerId) return;
    const attendedSessionIds = Object.entries(selectedAttendance)
      .filter(([_, attended]) => attended)
      .map(([sessionId]) => sessionId);
    
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    addPlayerMutation.mutate({
      playerId: selectedPlayerId,
      joinDate: formatLocalDate(joinDate),
      attendedSessionIds,
      packageTemplateId: selectedPackageTemplateId,
      creditPackage: selectedCreditPackage ? {
        creditType: selectedCreditPackage.creditType,
        credits: selectedCreditPackage.credits,
      } : null,
      isGuest: isGuestAdd,
      guestUntil: isGuestAdd ? formatLocalDate(guestUntilDate) : null,
    });
  };

  const handleTabPress = (tabId: TabId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tabId);
  };

  const handleSessionPress = (session: SessionInstance) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSession(session);
    
    // If cancelled, show restore modal instead
    if (session.status === "cancelled" || session.status === "skipped") {
      setShowRestoreModal(true);
      return;
    }
    
    const sessionDate = new Date(session.startTime);
    const now = new Date();
    const isPast = sessionDate.getTime() < now.getTime();
    const isToday = sessionDate.toDateString() === now.toDateString();
    
    // For future sessions (not today), show reschedule modal
    if (!isPast && !isToday) {
      setRescheduleDate(sessionDate);
      setRescheduleTime(sessionDate);
      setShowRescheduleModal(true);
      return;
    }
    
    // For past/today sessions, show attendance modal
    const activePlayers = (series?.players || []).filter(p => isPlayerActiveForSession(p, sessionDate));
    
    // Immediately set all players to "present" as optimistic default
    const initialAttendance: Record<string, "present" | "absent" | "vacation"> = {};
    activePlayers.forEach(p => {
      initialAttendance[p.id] = "present";
    });
    
    setSessionAttendance(initialAttendance);
    setShowAttendanceModal(true);
    
    // Fetch existing attendance in background and update when ready
    setLoadingAttendance(true);
    apiRequest("GET", `/api/coach/sessions/${session.id}/players?t=${Date.now()}`)
      .then(response => response.json())
      .then((sessionPlayers: Array<{ playerId: string; attendanceStatus: string }>) => {
        if (Array.isArray(sessionPlayers)) {
          const updatedAttendance: Record<string, "present" | "absent" | "vacation"> = {};
          activePlayers.forEach(p => {
            const saved = sessionPlayers.find(sp => sp.playerId === p.id);
            const status = saved?.attendanceStatus;
            if (status === "present" || status === "absent" || status === "vacation") {
              updatedAttendance[p.id] = status;
            } else {
              updatedAttendance[p.id] = "present";
            }
          });
          setSessionAttendance(updatedAttendance);
        }
      })
      .catch(error => {
        console.error("Error loading attendance:", error);
      })
      .finally(() => {
        setLoadingAttendance(false);
      });
  };
  
  const handleRescheduleSession = async () => {
    if (!selectedSession) return;
    setReschedulingSession(true);
    
    try {
      // Build new start/end times using the selected date AND time
      const newStartTime = new Date(rescheduleDate);
      newStartTime.setHours(rescheduleTime.getHours(), rescheduleTime.getMinutes(), 0, 0);
      
      const duration = series?.duration || 60;
      const newEndTime = new Date(newStartTime.getTime() + duration * 60 * 1000);
      
      await apiRequest("PATCH", `/api/coach/sessions/${selectedSession.id}`, {
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
      });
      
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRescheduleModal(false);
      setSelectedSession(null);
    } catch (error) {
      console.error("Error rescheduling session:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setReschedulingSession(false);
    }
  };

  const handleSetAttendance = (playerId: string, status: "present" | "absent" | "vacation") => {
    logger.log("[Attendance] Setting status:", { playerId, status });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSessionAttendance(prev => {
      const newState = {
        ...prev,
        [playerId]: status,
      };
      logger.log("[Attendance] New state:", newState);
      return newState;
    });
  };

  const handleSaveAttendance = async () => {
    if (!selectedSession) return;
    const sessionId = selectedSession.id;
    const attendance = Object.entries(sessionAttendance).map(([playerId, status]) => ({
      playerId,
      status,
    }));
    
    // Get present players for feedback
    const presentPlayerIds = Object.entries(sessionAttendance)
      .filter(([_, status]) => status === "present")
      .map(([playerId]) => playerId);
    
    // Get player names from series data
    const playersForFeedback = (series?.players || [])
      .filter((p: Player) => presentPlayerIds.includes(p.id))
      .map((p: Player) => ({ id: p.id, name: p.name }));
    
    // Close attendance modal
    setShowAttendanceModal(false);
    setSelectedSession(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // API call runs in background
    setSavingAttendance(true);
    try {
      await apiRequest("POST", `/api/coach/sessions/${sessionId}/attendance`, {
        attendance,
        markCompleted: true,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/earnings"] });
      
      // Show feedback drawer if there are present players
      if (playersForFeedback.length > 0) {
        setFeedbackSessionId(sessionId);
        setFeedbackPlayers(playersForFeedback);
        // Small delay to ensure modal closes smoothly
        setTimeout(() => {
          setShowFeedbackDrawer(true);
        }, 300);
      }
    } catch (error) {
      console.error("Error saving attendance:", error);
      Alert.alert("Error", "Failed to save attendance. Please try again.");
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleCancelSession = async () => {
    if (!selectedSession) return;
    const sessionId = selectedSession.id;
    
    // Instant UI feedback - close modal and show success immediately
    setShowAttendanceModal(false);
    setSelectedSession(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // API call runs in background
    setCancellingSession(true);
    try {
      await apiRequest("PATCH", `/api/coach/sessions/${sessionId}/cancel`, {
        reason: "Holiday / No Class",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
    } catch (error) {
      console.error("Error cancelling session:", error);
      Alert.alert("Error", "Failed to cancel session. Please try again.");
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
    } finally {
      setCancellingSession(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!selectedSession) return;
    const sessionId = selectedSession.id;
    
    // Instant UI feedback - close modals immediately
    setShowDeleteConfirm(false);
    setShowAttendanceModal(false);
    setSelectedSession(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // API call runs in background
    setDeletingSession(true);
    try {
      await apiRequest("DELETE", `/api/coach/sessions/${sessionId}`);
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
    } catch (error) {
      console.error("Error deleting session:", error);
      Alert.alert("Error", "Failed to delete session. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
    } finally {
      setDeletingSession(false);
    }
  };

  const handleRestoreSession = async () => {
    if (!selectedSession) return;
    setRestoringSession(true);
    try {
      await apiRequest("PATCH", `/api/coach/sessions/${selectedSession.id}/restore`);
      
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      setShowRestoreModal(false);
      setSelectedSession(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error restoring session:", error);
    } finally {
      setRestoringSession(false);
    }
  };

  // Complete entire series (archive it)
  const [completingSeries, setCompletingSeries] = useState(false);
  const [extendingSeries, setExtendingSeries] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [weeksToExtend, setWeeksToExtend] = useState(4);
  
  // Court change
  const [showSeriesCourtPicker, setShowSeriesCourtPicker] = useState(false);

  const changeSeriesCourtMutation = useMutation({
    mutationFn: async (newCourtId: string) => {
      return apiRequest("PATCH", `/api/coach/series/${seriesId}`, { courtId: newCourtId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      setShowSeriesCourtPicker(false);
      Alert.alert("Court Updated", "All sessions in this class have been moved to the new court.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to change court");
    },
  });

  // Extra lesson modal - 3-step wizard
  const [showExtraLessonModal, setShowExtraLessonModal] = useState(false);
  const [extraLessonStep, setExtraLessonStep] = useState(1); // 1=Court, 2=Date, 3=Time
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [extraLessonDate, setExtraLessonDate] = useState<Date>(new Date());
  const [extraLessonTime, setExtraLessonTime] = useState<Date>(new Date());
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [selectedEndTimeSlot, setSelectedEndTimeSlot] = useState<string | null>(null);
  const [showExtraLessonDatePicker, setShowExtraLessonDatePicker] = useState(false);
  const [showExtraLessonTimePicker, setShowExtraLessonTimePicker] = useState(false);
  const [addingExtraLesson, setAddingExtraLesson] = useState(false);
  
  // Fetch courts for the academy
  const { data: courtsData } = useQuery<{ id: string; name: string; color: string }[]>({
    queryKey: ["/api/courts"],
    enabled: visible,
  });
  
  // Fetch sessions for selected court and date to show busy slots
  // Use local date components to avoid UTC date shift (e.g. user picks Jan 2 in Dubai but toISOString gives Jan 1 UTC)
  const dateStr = `${extraLessonDate.getFullYear()}-${String(extraLessonDate.getMonth() + 1).padStart(2, '0')}-${String(extraLessonDate.getDate()).padStart(2, '0')}`;
  const { data: courtAvailabilityData, isLoading: loadingAvailability } = useQuery<{
    courts: any[];
    slots: Array<{ courtId: string; courtName: string; time: string; available: boolean }>;
  }>({
    queryKey: [`/api/courts/availability?date=${dateStr}`],
    enabled: showExtraLessonModal && extraLessonStep === 3 && !!selectedCourtId,
  });
  
  // Generate time slots from 6:00 to 22:00 (30-minute intervals)
  const timeSlots = React.useMemo(() => {
    const slots: { time: string; available: boolean; courtBusy: boolean; coachBusy: boolean }[] = [];
    const courtSlots = courtAvailabilityData?.slots?.filter(s => s.courtId === selectedCourtId) || [];
    
    for (let hour = 6; hour <= 22; hour++) {
      for (let min = 0; min < 60; min += 30) {
        if (hour === 22 && min === 30) break;
        const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        const matchingSlot = courtSlots.find(s => s.time === timeStr);
        const courtBusy = matchingSlot ? !matchingSlot.available : false;
        const coachBusy = matchingSlot ? !!(matchingSlot as any).coachBusy : false;
        const isAvailable = !courtBusy && !coachBusy;
        slots.push({ time: timeStr, available: isAvailable, courtBusy, coachBusy });
      }
    }
    return slots;
  }, [courtAvailabilityData, selectedCourtId]);
  
  const resetExtraLessonModal = () => {
    setExtraLessonStep(1);
    setSelectedCourtId(null);
    setExtraLessonDate(new Date());
    setExtraLessonTime(new Date());
    setSelectedTimeSlot(null);
    setSelectedEndTimeSlot(null);
    setShowExtraLessonModal(false);
  };

  // Calculate duration in minutes between two "HH:MM" strings
  const calcDurationMins = (start: string, end: string): number => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  };

  // Check if all slots from start to end are available
  const isRangeClear = (start: string, end: string): boolean => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    return timeSlots
      .filter(s => {
        const [h, m] = s.time.split(":").map(Number);
        const t = h * 60 + m;
        return t >= startMins && t < endMins;
      })
      .every(s => s.available);
  };

  // Is a slot inside the selected range (start → end)?
  const isInRange = (slotTime: string): boolean => {
    if (!selectedTimeSlot || !selectedEndTimeSlot) return false;
    const [sh, sm] = selectedTimeSlot.split(":").map(Number);
    const [eh, em] = selectedEndTimeSlot.split(":").map(Number);
    const [h, m] = slotTime.split(":").map(Number);
    const t = h * 60 + m;
    return t >= sh * 60 + sm && t <= eh * 60 + em;
  };
  
  const weekOptions = [2, 4, 6, 8, 10, 12, 16, 20, 24];
  
  const handleExtendSeries = () => {
    if (!seriesId) return;
    setShowExtendModal(true);
  };
  
  const confirmExtendSeries = async () => {
    if (!seriesId) return;
    
    setExtendingSeries(true);
    setShowExtendModal(false);
    
    try {
      const response = await fetch(`${getApiUrl()}/api/coach/series/${seriesId}/extend`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
        body: JSON.stringify({ weeks: weeksToExtend }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to extend series");
      }
      
      const result = await response.json();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      Alert.alert("Success", `Added ${result.sessionsCreated} new sessions!`);
      
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
    } catch (error: any) {
      console.error("Error extending series:", error);
      const msg = error?.message || "Failed to extend series";
      Alert.alert("Error", msg);
    } finally {
      setExtendingSeries(false);
    }
  };
  
  const confirmAddExtraLesson = async () => {
    if (!seriesId || !series || !selectedCourtId) return;
    
    setAddingExtraLesson(true);
    resetExtraLessonModal();
    
    try {
      // Combine date and time
      const lessonDateTime = new Date(extraLessonDate);
      lessonDateTime.setHours(extraLessonTime.getHours(), extraLessonTime.getMinutes(), 0, 0);
      
      const response = await fetch(`${getApiUrl()}/api/coach/series/${seriesId}/extra-lesson`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          startTime: lessonDateTime.toISOString(),
          duration: selectedEndTimeSlot ? calcDurationMins(selectedTimeSlot!, selectedEndTimeSlot) : (series.duration || 60),
          courtId: selectedCourtId,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add extra lesson");
      }
      
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      
      Alert.alert("Success", "Extra lesson added to the class!");
    } catch (error: any) {
      console.error("Error adding extra lesson:", error);
      const msg = error?.message || "Failed to add extra lesson";
      Alert.alert("Error", msg);
    } finally {
      setAddingExtraLesson(false);
    }
  };
  
  const handleCompleteSeries = () => {
    if (!seriesId) return;
    setShowSeriesCompleteConfirm(true);
  };

  const doCompleteSeries = async () => {
    if (!seriesId) return;
    setShowSeriesCompleteConfirm(false);
    setCompletingSeries(true);
    try {
      await apiRequest("POST", `/api/coach/series/${seriesId}/end`);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/coach/calendar");
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (error) {
      console.error("Error completing series:", error);
      Alert.alert("Error", "Failed to complete class series. Please try again.");
    } finally {
      setCompletingSeries(false);
    }
  };

  // Delete entire series
  const [deletingSeries, setDeletingSeries] = useState(false);
  
  const handleDeleteSeries = () => {
    if (!seriesId) return;
    setShowSeriesDeleteConfirm(true);
  };

  const doDeleteSeries = async () => {
    if (!seriesId) return;
    setShowSeriesDeleteConfirm(false);
    setDeletingSeries(true);
    try {
      await apiRequest("DELETE", `/api/coach/series/${seriesId}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      await queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).includes("/api/coach/calendar"),
        refetchType: "all",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (error) {
      console.error("Error deleting series:", error);
      Alert.alert("Error", "Failed to delete class series. Please try again.");
    } finally {
      setDeletingSeries(false);
    }
  };

  const tz = academy?.timezone || "Asia/Dubai";

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: tz,
    });
  };

  const formatTime = (timeStr: string) => {
    // timeStr is stored as UTC (HH:MM), convert to local academy time for display
    const timezone = academy?.timezone || "Asia/Dubai";
    return convertUTCTimeToLocal(timeStr, timezone);
  };

  const accentColor = series ? getSessionTypeColor(series.sessionType) : Colors.dark.successNeon;

  const renderOverviewTab = () => {
    if (!series) return null;

    return (
      <SeriesOverviewTab
        series={series}
        accentColor={accentColor}
        tz={tz}
        formatDate={formatDate}
        formatTime={formatTime}
        courtsData={courtsData}
        showSeriesCourtPicker={showSeriesCourtPicker}
        setShowSeriesCourtPicker={setShowSeriesCourtPicker}
        changeSeriesCourtMutation={changeSeriesCourtMutation}
        playerActionMenuId={playerActionMenuId}
        setPlayerActionMenuId={setPlayerActionMenuId}
        editingMaxPlayers={editingMaxPlayers}
        setEditingMaxPlayers={setEditingMaxPlayers}
        newMaxPlayers={newMaxPlayers}
        setNewMaxPlayers={setNewMaxPlayers}
        handleSaveMaxPlayers={handleSaveMaxPlayers}
        handleAddPlayerPress={handleAddPlayerPress}
        handlePlayerTap={handlePlayerTap}
        pausingPlayerId={pausingPlayerId}
        removingPlayerId={removingPlayerId}
        handleEditJoinDate={handleEditJoinDate}
        handleRestoreIdentity={handleRestoreIdentity}
        handlePausePlayer={handlePausePlayer}
        handleRemovePlayer={handleRemovePlayer}
        handleReactivatePlayer={handleReactivatePlayer}
        setShowSmartFill={setShowSmartFill}
        extendingSeries={extendingSeries}
        handleExtendSeries={handleExtendSeries}
        addingExtraLesson={addingExtraLesson}
        setShowExtraLessonModal={setShowExtraLessonModal}
        completingSeries={completingSeries}
        handleCompleteSeries={handleCompleteSeries}
        deletingSeries={deletingSeries}
        handleDeleteSeries={handleDeleteSeries}
      />
    );
  };

  const renderTimelineTab = () => {
    if (!series) return null;
    return (
      <SeriesTimelineTab
        series={series}
        accentColor={accentColor}
        formatDate={formatDate}
        onSessionPress={handleSessionPress}
      />
    );
  };

  const renderFeedbackTab = () => (
    <SeriesFeedbackTab
      feedbackLoading={feedbackLoading}
      feedbackData={feedbackData}
      series={series}
      formatDate={formatDate}
    />
  );

  const renderProgressTab = () => (
    <SeriesProgressTab
      progressLoading={progressLoading}
      progressData={progressData}
      onAssessPlayer={(player) => {
        setAssessmentPlayer(player);
        setShowDeepAssessment(true);
      }}
    />
  );

  const renderPlanTab = () => (
    <SeriesPlanTab series={series} />
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return renderOverviewTab();
      case "timeline":
        return renderTimelineTab();
      case "feedback":
        return renderFeedbackTab();
      case "progress":
        return renderProgressTab();
      case "plan":
        return renderPlanTab();
      default:
        return null;
    }
  };

  return (
    <>
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.drawer, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {isLoading || !series ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.dark.successNeon} />
            </View>
          ) : (
            <>
              <View style={styles.header}>
                <LinearGradient
                  colors={[accentColor + "30", "transparent"]}
                  style={styles.headerGradient}
                />
                <View style={styles.headerContent}>
                  <View style={styles.headerTop}>
                    <View style={[styles.statusBadge, { backgroundColor: accentColor + "30" }]}>
                      <Text style={[styles.statusText, { color: accentColor }]}>
                        {series.status.toUpperCase()}
                      </Text>
                    </View>
                    <Pressable onPress={onClose} style={styles.closeButton}>
                      <Ionicons name="close" size={24} color={Colors.dark.text} />
                    </Pressable>
                  </View>
                  <Text style={styles.title}>{displayTitle}</Text>
                  <Text style={styles.subtitle}>
                    {series.dayOfWeek === -1 
                      ? `Flexible at ${formatTime(series.startTime)}`
                      : `${DAY_NAMES[series.dayOfWeek]}s at ${formatTime(series.startTime)}`} - {series.sessionType.replace("_", " ")}
                  </Text>
                </View>
              </View>

              {(series.status === "ended" || series.status === "deleted" || series.status === "completed") && (
                <View style={styles.endedSeriesBanner}>
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.dark.warning} />
                  <Text style={styles.endedSeriesBannerText}>
                    {series.status === "completed"
                      ? "This series is complete."
                      : `This series ended${series.endedAt ? ` on ${new Date(series.endedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}.`}{" "}
                    {(series.status === "ended" || series.status === "deleted") && "Create a new series to continue booking sessions."}
                  </Text>
                </View>
              )}

              <View style={styles.tabBar}>
                {TABS.map((tab) => (
                  <Pressable
                    key={tab.id}
                    style={[
                      styles.tab,
                      activeTab === tab.id && styles.tabActive,
                    ]}
                    onPress={() => handleTabPress(tab.id)}
                  >
                    <Ionicons
                      name={tab.icon as any}
                      size={18}
                      color={
                        activeTab === tab.id
                          ? accentColor
                          : Colors.dark.textMuted
                      }
                    />
                    <Text
                      style={[
                        styles.tabLabel,
                        activeTab === tab.id && { color: accentColor },
                      ]}
                    >
                      {tab.label}
                    </Text>
                    {activeTab === tab.id ? (
                      <View style={[styles.tabIndicator, { backgroundColor: accentColor }]} />
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <ScrollView
                ref={timelineScrollRef}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {renderTabContent()}
              </ScrollView>
            </>
          )}
        </View>
      </View>

      {/* Smart Fill Modal */}
      <SeriesSmartFillModal
        visible={showSmartFill}
        onClose={() => setShowSmartFill(false)}
        loadingSuggestions={loadingSuggestions}
        mergeSuggestions={mergeSuggestions}
        getBallLevelColor={getBallLevelColor}
        formatDate={formatDate}
        getDefaultGuestUntil={getDefaultGuestUntil}
        onSelectSuggestion={(playerId, guestEnd) => {
          setIsGuestAdd(true);
          setGuestUntilDate(guestEnd);
          setSelectedPlayerId(playerId);
          setJoinDate(new Date());
          setShowSmartFill(false);
          setShowAddPlayerModal(true);
          setShowPackageSelection(true);
        }}
        bottomInset={insets.bottom}
      />

      {/* Add Player Modal */}
      <SeriesAddPlayerModal
        visible={showAddPlayerModal}
        onClose={() => {
          setShowAddPlayerModal(false);
          setTimeout(() => {
            setSelectedPlayerId(null);
            setPlayerSearch('');
            setBallLevelFilter(null);
            setJoinDate(new Date());
            setIsGuestAdd(false);
            setGuestUntilDate(getDefaultGuestUntil());
            setShowDatePicker(false);
            setShowGuestDatePicker(false);
            setShowAttendanceBackfill(false);
            setShowPackageSelection(false);
            setSelectedAttendance({});
            setSelectedCreditPackage(null);
            setSelectedPackageTemplateId(null);
            setExpandedCreditType(null);
            setShowCreatePackageForm(false);
            setNewPackageName('');
            setNewPackageCredits('');
            setNewPackagePricePerCredit('');
          }, 350);
        }}
        bottomInset={insets.bottom}
        showAttendanceBackfill={showAttendanceBackfill}
        showPackageSelection={showPackageSelection}
        selectedPlayerId={selectedPlayerId}
        joinDate={joinDate}
        setJoinDate={setJoinDate}
        isGuestAdd={isGuestAdd}
        setIsGuestAdd={setIsGuestAdd}
        guestUntilDate={guestUntilDate}
        setGuestUntilDate={setGuestUntilDate}
        showDatePicker={showDatePicker}
        setShowDatePicker={setShowDatePicker}
        showGuestDatePicker={showGuestDatePicker}
        setShowGuestDatePicker={setShowGuestDatePicker}
        selectedAttendance={selectedAttendance}
        setSelectedAttendance={setSelectedAttendance}
        pastSessions={getPastSessionsSinceJoinDate()}
        addPlayerIsPending={addPlayerMutation.isPending}
        handleSavePlayer={handleSavePlayer}
        showCreatePackageForm={showCreatePackageForm}
        setShowCreatePackageForm={setShowCreatePackageForm}
        newPackageName={newPackageName}
        setNewPackageName={setNewPackageName}
        newPackageCredits={newPackageCredits}
        setNewPackageCredits={setNewPackageCredits}
        newPackagePricePerCredit={newPackagePricePerCredit}
        setNewPackagePricePerCredit={setNewPackagePricePerCredit}
        createPackageIsPending={createPackageMutation.isPending}
        handleCreatePackage={handleCreatePackage}
        creditPackagesByType={creditPackagesByType}
        expandedCreditType={expandedCreditType}
        setExpandedCreditType={setExpandedCreditType}
        selectedCreditPackage={selectedCreditPackage}
        setSelectedCreditPackage={setSelectedCreditPackage}
        selectedPackageTemplateId={selectedPackageTemplateId}
        setSelectedPackageTemplateId={setSelectedPackageTemplateId}
        packageTemplates={packageTemplates}
        deleteTemplateIsPending={deleteTemplateMutation.isPending}
        onDeleteTemplate={(id) => deleteTemplateMutation.mutate(id)}
        handleSelectPackage={handleSelectPackage}
        handleSkipPackage={handleSkipPackage}
        onAssignCreditPackage={handleSavePlayer}
        allPlayers={allPlayers}
        filteredPlayers={filteredPlayers}
        playerSearch={playerSearch}
        setPlayerSearch={setPlayerSearch}
        ballLevelFilter={ballLevelFilter}
        setBallLevelFilter={setBallLevelFilter}
        handlePlayerSelect={handlePlayerSelect}
        handleContinueToPackage={handleContinueToPackage}
        getBallLevelColor={getBallLevelColor}
        formatDate={formatDate}
      />

      {/* Attendance Modal (also contains Transfer view) */}
      <SeriesAttendanceModal
        visible={showAttendanceModal}
        onClose={() => {
          setShowAttendanceModal(false);
          setTimeout(() => {
            setSelectedSession(null);
            setSessionAttendance({});
          }, 350);
        }}
        attendanceModalView={attendanceModalView}
        setAttendanceModalView={setAttendanceModalView}
        selectedTargetCoachId={selectedTargetCoachId}
        setSelectedTargetCoachId={setSelectedTargetCoachId}
        loadingAttendance={loadingAttendance}
        selectedSession={selectedSession}
        series={series}
        sessionAttendance={sessionAttendance}
        isPlayerActiveForSession={isPlayerActiveForSession}
        coaches={coaches}
        currentCoachId={currentCoach?.id}
        handleSetAttendance={handleSetAttendance}
        handleSaveAttendance={handleSaveAttendance}
        handleCancelSession={handleCancelSession}
        handleDeleteSession={handleDeleteSession}
        onTransfer={(sessionId, targetCoachId) => transferSessionMutation.mutate({ sessionId, targetCoachId })}
        savingAttendance={savingAttendance}
        cancellingSession={cancellingSession}
        deletingSession={deletingSession}
        transferringSession={transferringSession}
        setTransferringSession={setTransferringSession}
        formatDate={formatDate}
      />

      <SeriesRestoreSessionModal
        visible={showRestoreModal}
        onClose={() => setShowRestoreModal(false)}
        selectedSession={selectedSession}
        series={series}
        onRestore={handleRestoreSession}
        restoringSession={restoringSession}
        bottomInset={insets.bottom}
      />

      <SeriesRescheduleSessionModal
        visible={showRescheduleModal}
        onClose={() => setShowRescheduleModal(false)}
        selectedSession={selectedSession}
        rescheduleDate={rescheduleDate}
        setRescheduleDate={setRescheduleDate}
        rescheduleTime={rescheduleTime}
        setRescheduleTime={setRescheduleTime}
        showRescheduleDatePicker={showRescheduleDatePicker}
        setShowRescheduleDatePicker={setShowRescheduleDatePicker}
        showRescheduleTimePicker={showRescheduleTimePicker}
        setShowRescheduleTimePicker={setShowRescheduleTimePicker}
        onReschedule={handleRescheduleSession}
        reschedulingSession={reschedulingSession}
        onCancelSession={async () => {
          if (!selectedSession) return;
          setCancellingSession(true);
          try {
            await apiRequest("POST", `/api/coach/sessions/${selectedSession.id}/cancel`);
            queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setShowRescheduleModal(false);
            setSelectedSession(null);
          } catch (error) {
            console.error("Error cancelling session:", error);
          } finally {
            setCancellingSession(false);
          }
        }}
        cancellingSession={cancellingSession}
        bottomInset={insets.bottom}
      />

      <SeriesPausePlayerModal
        visible={showPauseModal}
        onClose={() => setShowPauseModal(false)}
        pauseFromDate={pauseFromDate}
        setPauseFromDate={setPauseFromDate}
        pauseUntilDate={pauseUntilDate}
        setPauseUntilDate={setPauseUntilDate}
        showPauseFromPicker={showPauseFromPicker}
        setShowPauseFromPicker={setShowPauseFromPicker}
        showPauseUntilPicker={showPauseUntilPicker}
        setShowPauseUntilPicker={setShowPauseUntilPicker}
        pauseReason={pauseReason}
        setPauseReason={setPauseReason}
        onConfirm={handleConfirmPause}
        isPending={pausePlayerMutation.isPending}
        bottomInset={insets.bottom}
      />

      <SeriesRemovePlayerModal
        visible={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        removeDate={removeDate}
        setRemoveDate={setRemoveDate}
        showRemoveDatePicker={showRemoveDatePicker}
        setShowRemoveDatePicker={setShowRemoveDatePicker}
        onConfirm={handleConfirmRemove}
        isPending={removePlayerMutation.isPending}
        bottomInset={insets.bottom}
      />

      <SeriesEditJoinDateModal
        visible={showEditJoinDateModal}
        onClose={() => setShowEditJoinDateModal(false)}
        editJoinDate={editJoinDate}
        setEditJoinDate={setEditJoinDate}
        showEditJoinDatePicker={showEditJoinDatePicker}
        setShowEditJoinDatePicker={setShowEditJoinDatePicker}
        onConfirm={handleSaveJoinDate}
        savingJoinDate={savingJoinDate}
        bottomInset={insets.bottom}
      />

      <SeriesExtendClassModal
        visible={showExtendModal}
        onClose={() => setShowExtendModal(false)}
        weeksToExtend={weeksToExtend}
        setWeeksToExtend={setWeeksToExtend}
        weekOptions={weekOptions}
        onConfirm={confirmExtendSeries}
      />
      
      {/* Extra Lesson Modal - 3 Step Wizard */}
      <SeriesExtraLessonModal
        visible={showExtraLessonModal}
        onReset={() => {
          setShowExtraLessonModal(false);
          setTimeout(() => {
            setExtraLessonStep(1);
            setSelectedCourtId(null);
            setSelectedTimeSlot(null);
            setSelectedEndTimeSlot(null);
          }, 350);
        }}
        extraLessonStep={extraLessonStep}
        setExtraLessonStep={setExtraLessonStep}
        extraLessonDate={extraLessonDate}
        setExtraLessonDate={setExtraLessonDate}
        showExtraLessonDatePicker={showExtraLessonDatePicker}
        setShowExtraLessonDatePicker={setShowExtraLessonDatePicker}
        selectedCourtId={selectedCourtId}
        setSelectedCourtId={setSelectedCourtId}
        courtsData={courtsData}
        timeSlots={timeSlots}
        selectedTimeSlot={selectedTimeSlot}
        setSelectedTimeSlot={setSelectedTimeSlot}
        selectedEndTimeSlot={selectedEndTimeSlot}
        setSelectedEndTimeSlot={setSelectedEndTimeSlot}
        setExtraLessonTime={setExtraLessonTime}
        isInRange={isInRange}
        isRangeClear={isRangeClear}
        calcDurationMins={calcDurationMins}
        confirmAddExtraLesson={confirmAddExtraLesson}
      />

      {/* Restore Identity Modal */}
      <Modal
        visible={showRestoreIdentityModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRestoreIdentityModal(false)}
      >
        <View style={confirmStyles.overlay}>
          <View style={confirmStyles.card}>
            <Text style={confirmStyles.title}>Restore Player Identity</Text>
            <Text style={confirmStyles.body}>
              Enter the player's real name and optional contact details to restore their profile.
            </Text>
            <View style={{ gap: 12, marginBottom: 24 }}>
              <View>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
                  Name (required)
                </Text>
                <TextInput
                  style={{
                    backgroundColor: "rgba(255,255,255,0.07)",
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: restoreIdentityName.trim() ? Colors.dark.primary : "rgba(255,255,255,0.12)",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: Colors.dark.text,
                    fontSize: 15,
                  }}
                  placeholder="Full name"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={restoreIdentityName}
                  onChangeText={setRestoreIdentityName}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
              <View>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
                  Email (optional)
                </Text>
                <TextInput
                  style={{
                    backgroundColor: "rgba(255,255,255,0.07)",
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: Colors.dark.text,
                    fontSize: 15,
                  }}
                  placeholder="Email address"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={restoreIdentityEmail}
                  onChangeText={setRestoreIdentityEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
                  Phone Number (optional)
                </Text>
                <TextInput
                  style={{
                    backgroundColor: "rgba(255,255,255,0.07)",
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: Colors.dark.text,
                    fontSize: 15,
                  }}
                  placeholder="Phone number"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={restoreIdentityPhone}
                  onChangeText={setRestoreIdentityPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
            <View style={confirmStyles.buttonRow}>
              <Pressable
                style={[confirmStyles.btn, confirmStyles.cancelBtn]}
                onPress={() => setShowRestoreIdentityModal(false)}
              >
                <Text style={confirmStyles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[confirmStyles.btn, confirmStyles.confirmBtn, !restoreIdentityName.trim() && { opacity: 0.4 }]}
                onPress={handleConfirmRestoreIdentity}
                disabled={!restoreIdentityName.trim() || restoreIdentityMutation.isPending}
              >
                {restoreIdentityMutation.isPending ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={confirmStyles.confirmText}>Restore</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Class confirm modal */}
      <Modal
        visible={showSeriesCompleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSeriesCompleteConfirm(false)}
      >
        <View style={confirmStyles.overlay}>
          <View style={confirmStyles.card}>
            <Text style={confirmStyles.title}>Complete Class Series</Text>
            <Text style={confirmStyles.body}>
              The class will be archived and no new sessions will be scheduled. You can still view the history.
            </Text>
            <View style={confirmStyles.buttonRow}>
              <Pressable
                style={[confirmStyles.btn, confirmStyles.cancelBtn]}
                onPress={() => setShowSeriesCompleteConfirm(false)}
              >
                <Text style={confirmStyles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[confirmStyles.btn, confirmStyles.confirmBtn]}
                onPress={doCompleteSeries}
              >
                <Text style={confirmStyles.confirmText}>Complete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Class confirm modal */}
      <Modal
        visible={showSeriesDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSeriesDeleteConfirm(false)}
      >
        <View style={confirmStyles.overlay}>
          <View style={confirmStyles.card}>
            <Text style={confirmStyles.title}>Delete Entire Class</Text>
            <Text style={confirmStyles.body}>
              This will cancel all upcoming sessions and remove all players. This action cannot be undone.
            </Text>
            <View style={confirmStyles.buttonRow}>
              <Pressable
                style={[confirmStyles.btn, confirmStyles.cancelBtn]}
                onPress={() => setShowSeriesDeleteConfirm(false)}
              >
                <Text style={confirmStyles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[confirmStyles.btn, confirmStyles.deleteBtn]}
                onPress={doDeleteSeries}
              >
                <Text style={confirmStyles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>

    {/* Feedback Drawer - appears after saving attendance */}
    {feedbackSessionId && (
      <InSessionFeedbackDrawer
        visible={showFeedbackDrawer}
        sessionId={feedbackSessionId}
        players={feedbackPlayers}
        onClose={() => {
          setShowFeedbackDrawer(false);
          setFeedbackSessionId(null);
          setFeedbackPlayers([]);
        }}
      />
    )}

    {/* Deep Assessment Drawer - for skill assessment */}
    <DeepAssessmentDrawer
      visible={showDeepAssessment}
      player={assessmentPlayer}
      onClose={() => {
        setShowDeepAssessment(false);
        setAssessmentPlayer(null);
      }}
    />
  </>
  );
}

const confirmStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#1A2332",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  body: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  cancelText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 15,
    fontWeight: "600",
  },
  confirmBtn: {
    backgroundColor: Colors.dark.successNeon,
  },
  confirmText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "700",
  },
  deleteBtn: {
    backgroundColor: Colors.dark.error,
  },
  deleteText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  endedSeriesBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: Colors.dark.warning + "18",
    borderWidth: 1,
    borderColor: Colors.dark.warning + "40",
  },
  endedSeriesBannerText: {
    flex: 1,
    color: Colors.dark.warning,
    fontSize: 12,
    lineHeight: 17,
  },
});
