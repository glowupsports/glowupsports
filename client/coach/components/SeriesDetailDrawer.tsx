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
  Platform,
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
    p.name.toLowerCase().includes(playerSearch.toLowerCase())
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
      setIsGuestAdd(false);
      setGuestUntilDate(getDefaultGuestUntil());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // Mutation to update max players
  const updateMaxPlayersMutation = useMutation({
    mutationFn: async (payload: { maxPlayers: number; sessionType?: string }) => {
      return apiRequest("PATCH", `/api/coach/series/${seriesId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      setEditingMaxPlayers(false);
      setNewMaxPlayers("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleSaveMaxPlayers = () => {
    const value = parseInt(newMaxPlayers, 10);
    if (!isNaN(value) && value >= 1 && value <= 20) {
      const payload: { maxPlayers: number; sessionType?: string } = { maxPlayers: value };
      if (value >= 3 && series?.sessionType === "semi_private") {
        payload.sessionType = "group";
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
      if (Platform.OS === "web") {
        window.alert("Failed to create package. Please try again.");
      } else {
        Alert.alert("Error", "Failed to create package. Please try again.");
      }
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
    try {
      await apiRequest("DELETE", `/api/coach/sessions/${sessionId}`);
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
    } catch (error) {
      console.error("Error deleting session:", error);
      Alert.alert("Error", "Failed to delete session. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
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
      
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(`Added ${result.sessionsCreated} new sessions!`);
      } else {
        Alert.alert("Success", `Added ${result.sessionsCreated} new sessions!`);
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
    } catch (error: any) {
      console.error("Error extending series:", error);
      const msg = error?.message || "Failed to extend series";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
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
      
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert("Extra lesson added successfully!");
      } else {
        Alert.alert("Success", "Extra lesson added to the class!");
      }
    } catch (error: any) {
      console.error("Error adding extra lesson:", error);
      const msg = error?.message || "Failed to add extra lesson";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setAddingExtraLesson(false);
    }
  };
  
  const handleCompleteSeries = async () => {
    if (!seriesId) return;
    
    // Confirmation dialog
    const confirmComplete = Platform.OS === "web" && typeof window !== "undefined"
      ? window.confirm("Complete this class series? The class will be archived and no new sessions will be scheduled. You can still view the history.")
      : await new Promise<boolean>((resolve) => {
          const Alert = require("react-native").Alert;
          Alert.alert(
            "Complete Class Series",
            "The class will be archived and no new sessions will be scheduled. You can still view the history in the Ended filter.",
            [
              { text: "Cancel", onPress: () => resolve(false), style: "cancel" },
              { text: "Complete", onPress: () => resolve(true) },
            ]
          );
        });
    
    if (!confirmComplete) return;
    
    setCompletingSeries(true);
    try {
      await apiRequest("POST", `/api/coach/series/${seriesId}/end`);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/coach/calendar");
        }
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (error) {
      console.error("Error completing series:", error);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert("Failed to complete class series. Please try again.");
      } else {
        Alert.alert("Error", "Failed to complete class series. Please try again.");
      }
    } finally {
      setCompletingSeries(false);
    }
  };

  // Delete entire series
  const [deletingSeries, setDeletingSeries] = useState(false);
  
  const handleDeleteSeries = async () => {
    if (!seriesId) return;
    
    // Confirmation dialog (web-compatible)
    const confirmDelete = Platform.OS === "web" && typeof window !== "undefined"
      ? window.confirm("Delete this entire class series? This will cancel all upcoming sessions and remove all players. This action cannot be undone.")
      : await new Promise<boolean>((resolve) => {
          const Alert = require("react-native").Alert;
          Alert.alert(
            "Delete Class Series",
            "This will cancel all upcoming sessions and remove all players. This action cannot be undone.",
            [
              { text: "Cancel", onPress: () => resolve(false), style: "cancel" },
              { text: "Delete", onPress: () => resolve(true), style: "destructive" },
            ]
          );
        });
    
    if (!confirmDelete) return;
    
    setDeletingSeries(true);
    try {
      await apiRequest("DELETE", `/api/coach/series/${seriesId}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      await queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (error) {
      console.error("Error deleting series:", error);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert("Failed to delete class series. Please try again.");
      } else {
        Alert.alert("Error", "Failed to delete class series. Please try again.");
      }
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
      <View style={styles.tabContent}>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderColor: accentColor }]}>
            <Text style={[styles.statValue, { color: accentColor }]}>
              {series.stats.completedSessions}
            </Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={[styles.statCard, { borderColor: Colors.dark.successNeon }]}>
            <Text style={[styles.statValue, { color: Colors.dark.successNeon }]}>
              {series.stats.upcomingSessions}
            </Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>
          <View style={[styles.statCard, { borderColor: Colors.dark.accentWarning }]}>
            <Text style={[styles.statValue, { color: Colors.dark.accentWarning }]}>
              {series.stats.cancelledSessions}
            </Text>
            <Text style={styles.statLabel}>Cancelled</Text>
          </View>
          <View style={[styles.statCard, { borderColor: Colors.dark.textMuted }]}>
            <Text style={[styles.statValue, { color: Colors.dark.text }]}>
              {series.stats.totalSessions}
            </Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color={Colors.dark.textMuted} />
            <Text style={styles.infoText}>
              {series.dayOfWeek === -1 
                ? `Flexible at ${formatTime(series.startTime)}`
                : `${DAY_NAMES[series.dayOfWeek]}s at ${formatTime(series.startTime)}`}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={Colors.dark.textMuted} />
            <Text style={styles.infoText}>{series.duration} minutes</Text>
          </View>
          <Pressable style={styles.infoRow} onPress={() => setShowSeriesCourtPicker(!showSeriesCourtPicker)}>
            <Ionicons name="location-outline" size={16} color={Colors.dark.textMuted} />
            <Text style={styles.infoText}>
              {series.locationName ? series.locationName : ""}
              {series.courtName ? `${series.locationName ? " - " : ""}${series.courtName}` : "No court assigned"}
            </Text>
            <Ionicons name="pencil-outline" size={14} color={Colors.dark.disabled} style={{ marginLeft: 6 }} />
          </Pressable>
          {showSeriesCourtPicker && courtsData && courtsData.length > 0 ? (
            <View style={{ backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 12, marginTop: 4 }}>
              <Text style={{ ...Typography.caption, color: Colors.dark.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Change Court for All Sessions</Text>
              {courtsData.map((c) => (
                <Pressable
                  key={c.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6, ...(c.id === series.courtId ? { backgroundColor: "rgba(0, 255, 135, 0.1)" } : {}) }}
                  onPress={() => {
                    if (c.id !== series.courtId) {
                      changeSeriesCourtMutation.mutate(c.id);
                    } else {
                      setShowSeriesCourtPicker(false);
                    }
                  }}
                  disabled={changeSeriesCourtMutation.isPending}
                >
                  <Ionicons
                    name={c.id === series.courtId ? "radio-button-on" : "radio-button-off"}
                    size={18}
                    color={c.id === series.courtId ? Colors.dark.primary : Colors.dark.disabled}
                  />
                  <Text style={{ ...Typography.body, color: c.id === series.courtId ? Colors.dark.primary : Colors.dark.text }}>{c.name}</Text>
                </Pressable>
              ))}
              {changeSeriesCourtMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginTop: 8 }} />
              ) : null}
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <Ionicons name="trophy-outline" size={16} color={Colors.dark.textMuted} />
            <Text style={styles.infoText}>{series.xpPerSession} XP per session</Text>
          </View>
        </View>

        <View style={[styles.infoSection, { overflow: "visible" }]}>
          {playerActionMenuId ? (
            <Pressable 
              style={StyleSheet.absoluteFill}
              onPress={() => setPlayerActionMenuId(null)}
            />
          ) : null}
          {(() => {
            const activePlayers = series.players.filter(p => p.status === "active");
            const pausedPlayers = series.players.filter(p => p.status === "paused");
            const formerPlayers = series.players.filter(p => p.status === "left");
            const effectiveMaxPlayers = series.sessionType === "private" ? 1 : series.maxPlayers || (series.sessionType === "semi_private" ? 2 : 6);
            const canAddMore = activePlayers.length < effectiveMaxPlayers;
            
            return (
              <>
                <View style={styles.sectionHeaderRow}>
                  {editingMaxPlayers ? (
                    <View style={styles.editMaxPlayersRow}>
                      <Text style={styles.sectionTitle}>Active Players ({activePlayers.length}/</Text>
                      <TextInput
                        style={styles.maxPlayersInput}
                        value={newMaxPlayers}
                        onChangeText={setNewMaxPlayers}
                        keyboardType="number-pad"
                        placeholder={String(effectiveMaxPlayers)}
                        placeholderTextColor={Colors.dark.textMuted}
                        maxLength={2}
                        autoFocus
                      />
                      <Text style={styles.sectionTitle}>)</Text>
                      <Pressable onPress={handleSaveMaxPlayers} style={styles.saveMaxPlayersBtn}>
                        <Ionicons name="checkmark" size={18} color={Colors.dark.successNeon} />
                      </Pressable>
                      <Pressable onPress={() => { setEditingMaxPlayers(false); setNewMaxPlayers(""); }} style={styles.cancelMaxPlayersBtn}>
                        <Ionicons name="close" size={18} color={Colors.dark.error} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable 
                      onPress={() => { setEditingMaxPlayers(true); setNewMaxPlayers(String(effectiveMaxPlayers)); }}
                      style={styles.editableTitle}
                    >
                      <Text style={styles.sectionTitle}>
                        Active Players ({activePlayers.length}/{effectiveMaxPlayers})
                      </Text>
                      <Ionicons name="pencil" size={14} color={Colors.dark.textMuted} style={{ marginLeft: 6 }} />
                    </Pressable>
                  )}
                  {canAddMore && !editingMaxPlayers ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Pressable 
                        onPress={() => setShowSmartFill(true)}
                        style={[styles.addPlayerButton, { backgroundColor: Colors.dark.orange + "15", borderColor: Colors.dark.orange + "30" }]}
                      >
                        <Ionicons name="flash" size={16} color={Colors.dark.orange} />
                        <Text style={[styles.addPlayerButtonText, { color: Colors.dark.orange }]}>Smart Fill</Text>
                      </Pressable>
                      <Pressable 
                        onPress={handleAddPlayerPress}
                        style={styles.addPlayerButton}
                      >
                        <Ionicons name="add-circle" size={20} color={Colors.dark.successNeon} />
                        <Text style={styles.addPlayerButtonText}>Add</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                {activePlayers.length === 0 ? (
                  <Pressable onPress={handleAddPlayerPress} style={styles.emptyAddButton}>
                    <Ionicons name="person-add-outline" size={24} color={Colors.dark.successNeon} />
                    <Text style={styles.emptyAddText}>Tap to add a player</Text>
                  </Pressable>
                ) : (
                  activePlayers.map((player) => {
                    // Get relevant credit balance for this session type
                    const sessionType = series.sessionType;
                    const credits = player.credits;
                    let relevantCredits = 0;
                    let relevantDebt = 0;
                    let creditLabel = "";
                    if (credits) {
                      if (sessionType === "private") {
                        relevantCredits = credits.private;
                        relevantDebt = credits.privateDebt || 0;
                        creditLabel = "Private";
                      } else if (sessionType === "semi_private" || sessionType === "semi") {
                        relevantCredits = credits.semi_private;
                        relevantDebt = credits.semiPrivateDebt || 0;
                        creditLabel = "Semi";
                      } else {
                        relevantCredits = credits.group;
                        relevantDebt = credits.groupDebt || 0;
                        creditLabel = "Group";
                      }
                    }
                    const hasNoCredits = relevantCredits <= 0 && relevantDebt === 0;
                    const hasDebt = relevantDebt > 0;
                    const displayCredits = hasDebt && relevantCredits <= 0 ? -relevantDebt : relevantCredits;
                    
                    const isMenuOpen = playerActionMenuId === player.id;
                    const isPausing = pausingPlayerId === player.id;
                    const isRemoving = removingPlayerId === player.id;
                    
                    const ballColor = getBallLevelColor(player.ballLevel);
                    return (
                      <View key={player.id} style={[styles.playerRow, isMenuOpen && { zIndex: 999 }]}>
                        <Pressable
                          onPress={() => handlePlayerTap(player.id)}
                          style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                        >
                          <View style={[styles.playerAvatar, { backgroundColor: ballColor + "30", borderWidth: 2, borderColor: ballColor }]}>
                            <Text style={[styles.playerInitial, { color: ballColor }]}>
                              {player.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.playerInfo}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={styles.playerName}>{player.name}</Text>
                              {player.isGuest ? (
                                <View style={styles.guestBadge}>
                                  <Text style={styles.guestBadgeText}>GUEST</Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={styles.playerStats}>
                              {player.isGuest && player.guestUntil 
                                ? `Guest until ${formatDate(player.guestUntil)}`
                                : `${player.joinedAt ? `Since ${formatDate(player.joinedAt)}` : ""}${player.sessionsAttended ? ` - ${player.sessionsAttended} sessions` : ""}`
                              }
                            </Text>
                          </View>
                        </Pressable>
                        {credits ? (
                          <View style={[
                            styles.creditBadge, 
                            hasNoCredits && styles.creditBadgeWarning,
                            hasDebt && styles.creditBadgeDebt,
                          ]}>
                            <Text style={[
                              styles.creditBadgeText,
                              hasNoCredits && styles.creditBadgeTextWarning,
                              hasDebt && styles.creditBadgeTextDebt,
                            ]}>
                              {formatCredits(displayCredits)}
                            </Text>
                          </View>
                        ) : null}
                        <Pressable 
                          onPress={() => setPlayerActionMenuId(isMenuOpen ? null : player.id)}
                          style={styles.playerMenuButton}
                        >
                          <Ionicons name="ellipsis-vertical" size={18} color={Colors.dark.textMuted} />
                        </Pressable>
                        {isMenuOpen ? (
                          <View style={styles.playerActionMenu}>
                            <LinearGradient
                              colors={["rgba(30, 41, 59, 0.98)", "rgba(15, 23, 42, 0.98)"]}
                              style={styles.playerActionMenuGradient}
                            >
                              <View style={styles.playerActionMenuHeader}>
                                <Ionicons name="settings-outline" size={12} color={Colors.dark.textMuted} />
                                <Text style={styles.playerActionMenuTitle}>Player Actions</Text>
                              </View>
                              <View style={styles.playerActionDivider} />
                              <Pressable 
                                onPress={() => handleEditJoinDate(player)}
                                style={({ pressed }) => [
                                  styles.playerActionItem,
                                  pressed && styles.playerActionItemPressed,
                                ]}
                              >
                                <View style={[styles.playerActionIconWrapper, { backgroundColor: Colors.dark.accentCyan + "20" }]}>
                                  <Ionicons name="calendar" size={16} color={Colors.dark.accentCyan} />
                                </View>
                                <Text style={[styles.playerActionText, { color: Colors.dark.text }]}>Edit Join Date</Text>
                                <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
                              </Pressable>
                              <Pressable 
                                onPress={() => handlePausePlayer(player.id)}
                                style={({ pressed }) => [
                                  styles.playerActionItem,
                                  pressed && styles.playerActionItemPressed,
                                ]}
                                disabled={isPausing}
                              >
                                {isPausing ? (
                                  <ActivityIndicator size="small" color={Colors.dark.gold} />
                                ) : (
                                  <>
                                    <View style={[styles.playerActionIconWrapper, { backgroundColor: Colors.dark.gold + "20" }]}>
                                      <Ionicons name="pause" size={16} color={Colors.dark.gold} />
                                    </View>
                                    <Text style={[styles.playerActionText, { color: Colors.dark.text }]}>Pause Player</Text>
                                    <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
                                  </>
                                )}
                              </Pressable>
                              <View style={styles.playerActionDivider} />
                              <Pressable 
                                onPress={() => handleRemovePlayer(player.id)}
                                style={({ pressed }) => [
                                  styles.playerActionItem,
                                  styles.playerActionItemDanger,
                                  pressed && styles.playerActionItemPressed,
                                ]}
                                disabled={isRemoving}
                              >
                                {isRemoving ? (
                                  <ActivityIndicator size="small" color={Colors.dark.error} />
                                ) : (
                                  <>
                                    <View style={[styles.playerActionIconWrapper, { backgroundColor: Colors.dark.error + "20" }]}>
                                      <Ionicons name="person-remove" size={16} color={Colors.dark.error} />
                                    </View>
                                    <Text style={[styles.playerActionText, { color: Colors.dark.error }]}>Remove Player</Text>
                                  </>
                                )}
                              </Pressable>
                            </LinearGradient>
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                )}
                
                {pausedPlayers.length > 0 ? (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>
                      On Vacation ({pausedPlayers.length})
                    </Text>
                    {pausedPlayers.map((player) => {
                      const pausedBallColor = getBallLevelColor(player.ballLevel);
                      return (
                      <View key={player.id} style={[styles.playerRow, { opacity: 0.7 }]}>
                        <Pressable
                          onPress={() => handlePlayerTap(player.id)}
                          style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                        >
                          <View style={[styles.playerAvatar, { backgroundColor: pausedBallColor + "20", borderWidth: 2, borderColor: pausedBallColor }]}>
                            <Ionicons name="airplane-outline" size={16} color={pausedBallColor} />
                          </View>
                          <View style={styles.playerInfo}>
                            <Text style={styles.playerName}>{player.name}</Text>
                            <Text style={[styles.playerStats, { color: Colors.dark.gold }]}>
                              {player.pauseFrom && player.pauseUntil 
                                ? `${formatDate(player.pauseFrom)} - ${formatDate(player.pauseUntil)}`
                                : player.pauseReason || "On vacation"}
                            </Text>
                          </View>
                        </Pressable>
                        <Pressable 
                          onPress={() => handleReactivatePlayer(player.id)}
                          style={styles.reactivateButton}
                        >
                          <Ionicons name="play-circle-outline" size={18} color={Colors.dark.successNeon} />
                          <Text style={styles.reactivateButtonText}>Reactivate</Text>
                        </Pressable>
                      </View>
                    );})}
                  </>
                ) : null}
                
                {formerPlayers.length > 0 ? (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>
                      Former Players ({formerPlayers.length})
                    </Text>
                    {formerPlayers.map((player) => {
                      const formerBallColor = getBallLevelColor(player.ballLevel);
                      return (
                      <View key={player.id} style={[styles.playerRow, { opacity: 0.5 }]}>
                        <View style={[styles.playerAvatar, { backgroundColor: formerBallColor + "20", borderWidth: 2, borderColor: formerBallColor + "60" }]}>
                          <Text style={[styles.playerInitial, { color: formerBallColor + "80" }]}>
                            {player.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.playerInfo}>
                          <Text style={[styles.playerName, { color: Colors.dark.textMuted }]}>
                            {player.name}
                          </Text>
                          <Text style={styles.playerStats}>
                            {player.joinedAt && player.leftAt 
                              ? `${formatDate(player.joinedAt)} - ${formatDate(player.leftAt)}`
                              : player.sessionsAttended ? `${player.sessionsAttended} sessions attended` : ""}
                          </Text>
                        </View>
                      </View>
                    );})}
                  </>
                ) : null}
              </>
            );
          })()}
        </View>

        <View style={styles.deleteSeriesSection}>
          {/* Extend Series Button - add more weeks */}
          {series?.status === "active" && (
            <Pressable
              onPress={handleExtendSeries}
              style={[styles.extendSeriesButton, extendingSeries && styles.extendSeriesButtonDisabled]}
              disabled={extendingSeries}
            >
              {extendingSeries ? (
                <ActivityIndicator size="small" color={Colors.dark.accent} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.dark.accent} />
                  <Text style={styles.extendSeriesButtonText}>Extend Class (+weeks)</Text>
                </>
              )}
            </Pressable>
          )}
          
          {/* Add Extra Lesson Button - only show if series is active */}
          {series?.status === "active" && (
            <Pressable
              onPress={() => setShowExtraLessonModal(true)}
              style={[styles.extendSeriesButton, addingExtraLesson && styles.extendSeriesButtonDisabled]}
              disabled={addingExtraLesson}
            >
              {addingExtraLesson ? (
                <ActivityIndicator size="small" color={Colors.dark.warning} />
              ) : (
                <>
                  <Ionicons name="calendar-outline" size={18} color={Colors.dark.warning} />
                  <Text style={[styles.extendSeriesButtonText, { color: Colors.dark.warning }]}>Add Extra Lesson</Text>
                </>
              )}
            </Pressable>
          )}
          
          {/* Complete Series Button - only show if series is active */}
          {series?.status === "active" && (
            <Pressable
              onPress={handleCompleteSeries}
              style={[styles.completeSeriesButton, completingSeries && styles.completeSeriesButtonDisabled]}
              disabled={completingSeries}
            >
              {completingSeries ? (
                <ActivityIndicator size="small" color={Colors.dark.successNeon} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color={Colors.dark.successNeon} />
                  <Text style={styles.completeSeriesButtonText}>Complete Class</Text>
                </>
              )}
            </Pressable>
          )}
          
          {/* Show "Completed" badge if series is ended */}
          {series?.status === "ended" && (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.dark.successNeon} />
              <Text style={styles.completedBadgeText}>Class Completed</Text>
              {(series as any).endedAt && (
                <Text style={styles.completedDateText}>
                  {new Date((series as any).endedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz })}
                </Text>
              )}
            </View>
          )}
          
          <Pressable
            onPress={handleDeleteSeries}
            style={[styles.deleteSeriesButton, deletingSeries && styles.deleteSeriesButtonDisabled]}
            disabled={deletingSeries}
          >
            {deletingSeries ? (
              <ActivityIndicator size="small" color={Colors.dark.error} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                <Text style={styles.deleteSeriesButtonText}>Delete Entire Class</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
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
      <Modal
        visible={showSmartFill}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSmartFill(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowSmartFill(false)} />
          <View style={[styles.drawer, { paddingBottom: insets.bottom + Spacing.md }]}>
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
            <View style={styles.addPlayerHeader}>
              <View>
                <Text style={styles.addPlayerTitle}>Smart Fill</Text>
                <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginTop: 2 }}>
                  Players on holiday from other groups
                </Text>
              </View>
              <Pressable onPress={() => setShowSmartFill(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.addPlayerContent} contentContainerStyle={{ paddingBottom: 40 }}>
              {loadingSuggestions ? (
                <View style={{ alignItems: "center", padding: Spacing.xl }}>
                  <ActivityIndicator size="large" color={Colors.dark.orange} />
                  <Text style={{ color: Colors.dark.textMuted, marginTop: Spacing.md }}>Finding available players...</Text>
                </View>
              ) : !mergeSuggestions?.suggestions?.length ? (
                <View style={{ alignItems: "center", padding: Spacing.xl }}>
                  <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
                  <Text style={{ color: Colors.dark.textMuted, marginTop: Spacing.md, textAlign: "center" }}>
                    No players on holiday from other groups right now
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{ color: Colors.dark.orange, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, marginBottom: Spacing.md }}>
                    {mergeSuggestions.suggestions.length} available ({mergeSuggestions.openSlots} open slots)
                  </Text>
                  {mergeSuggestions.suggestions.map((suggestion) => {
                    const ballColor = getBallLevelColor(suggestion.ballLevel);
                    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                    return (
                      <View key={suggestion.playerId} style={styles.smartFillCard}>
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                          <View style={[styles.playerAvatar, { backgroundColor: ballColor + "30", borderWidth: 2, borderColor: ballColor, width: 36, height: 36 }]}>
                            <Text style={[styles.playerInitial, { color: ballColor, fontSize: 14 }]}>
                              {suggestion.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ marginLeft: Spacing.md, flex: 1 }}>
                            <Text style={styles.playerName}>{suggestion.name}</Text>
                            <Text style={{ fontSize: 11, color: Colors.dark.textMuted }}>
                              From: {suggestion.homeSeriesName}
                            </Text>
                            {suggestion.pauseFrom && suggestion.pauseUntil ? (
                              <Text style={{ fontSize: 11, color: Colors.dark.orange }}>
                                Holiday: {formatDate(suggestion.pauseFrom)} - {formatDate(suggestion.pauseUntil)}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <Pressable
                          style={styles.smartFillAddBtn}
                          onPress={() => {
                            const guestEnd = suggestion.pauseUntil ? new Date(suggestion.pauseUntil) : getDefaultGuestUntil();
                            setIsGuestAdd(true);
                            setGuestUntilDate(guestEnd);
                            setSelectedPlayerId(suggestion.playerId);
                            setJoinDate(new Date());
                            setShowSmartFill(false);
                            setShowAddPlayerModal(true);
                            setShowPackageSelection(true);
                          }}
                        >
                          <Ionicons name="add" size={16} color={Colors.dark.backgroundRoot} />
                          <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.dark.backgroundRoot }}>Add as Guest</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Player Modal */}
      <Modal
        visible={showAddPlayerModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddPlayerModal(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowAddPlayerModal(false)} />
          <View style={[styles.drawer, { paddingBottom: insets.bottom + Spacing.md }]}>
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
            
            <View style={styles.addPlayerHeader}>
              <Text style={styles.addPlayerTitle}>
                {showAttendanceBackfill ? "Mark Attendance" : showPackageSelection ? "Assign Package" : selectedPlayerId ? "Set Join Date" : "Add Player"}
              </Text>
              <Pressable onPress={() => {
                setShowAddPlayerModal(false);
                setShowPackageSelection(false);
                setShowAttendanceBackfill(false);
                setSelectedPlayerId(null);
                setSelectedPackageTemplateId(null);
                setPlayerSearch("");
              }}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            {showAttendanceBackfill ? (
              // Attendance backfill screen
              <ScrollView style={styles.addPlayerContent} contentContainerStyle={{ paddingBottom: 100 }}>
                <Text style={styles.backfillSubtitle}>
                  Mark which past sessions this player attended since {joinDate.toLocaleDateString()}
                </Text>
                {getPastSessionsSinceJoinDate().map((session, idx) => (
                  <Pressable
                    key={session.id}
                    style={[
                      styles.attendanceRow,
                      selectedAttendance[session.id] && styles.attendanceRowSelected,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedAttendance(prev => ({
                        ...prev,
                        [session.id]: !prev[session.id],
                      }));
                    }}
                  >
                    <View style={styles.attendanceCheck}>
                      {selectedAttendance[session.id] ? (
                        <Ionicons name="checkmark-circle" size={24} color={Colors.dark.successNeon} />
                      ) : (
                        <Ionicons name="ellipse-outline" size={24} color={Colors.dark.textMuted} />
                      )}
                    </View>
                    <View style={styles.attendanceInfo}>
                      <Text style={styles.attendanceDate}>{formatDate(session.startTime)}</Text>
                      <Text style={styles.attendanceWeek}>Week {session.weekNumber || idx + 1}</Text>
                    </View>
                  </Pressable>
                ))}
                
                <Pressable
                  style={[styles.saveButton, addPlayerMutation.isPending && styles.saveButtonDisabled]}
                  onPress={handleSavePlayer}
                  disabled={addPlayerMutation.isPending}
                >
                  {addPlayerMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      Save ({Object.values(selectedAttendance).filter(Boolean).length} sessions attended)
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            ) : showPackageSelection ? (
              // Package selection screen
              <KeyboardAwareScrollViewCompat style={styles.addPlayerContent} contentContainerStyle={{ paddingBottom: 100 }}>
                <Text style={styles.backfillSubtitle}>
                  Optionally assign a credit package to this player
                </Text>
                
                {showCreatePackageForm ? (
                  <View style={styles.createPackageForm}>
                    <Text style={styles.createPackageTitle}>Create New Package</Text>
                    
                    <View style={styles.formField}>
                      <Text style={styles.formLabel}>Package Name</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="e.g., 10 Lesson Pack"
                        placeholderTextColor={Colors.dark.textMuted}
                        value={newPackageName}
                        onChangeText={setNewPackageName}
                      />
                    </View>
                    
                    <View style={styles.formRow}>
                      <View style={[styles.formField, { flex: 1 }]}>
                        <Text style={styles.formLabel}>Credits</Text>
                        <TextInput
                          style={styles.formInput}
                          placeholder="10"
                          placeholderTextColor={Colors.dark.textMuted}
                          keyboardType="numeric"
                          value={newPackageCredits}
                          onChangeText={setNewPackageCredits}
                        />
                      </View>
                      
                      <View style={[styles.formField, { flex: 1, marginLeft: Spacing.sm }]}>
                        <Text style={styles.formLabel}>Price/Credit (AED)</Text>
                        <TextInput
                          style={styles.formInput}
                          placeholder="150"
                          placeholderTextColor={Colors.dark.textMuted}
                          keyboardType="decimal-pad"
                          value={newPackagePricePerCredit}
                          onChangeText={setNewPackagePricePerCredit}
                        />
                      </View>
                    </View>
                    
                    {newPackageCredits && newPackagePricePerCredit ? (
                      <Text style={styles.totalPricePreview}>
                        Total: AED {(parseInt(newPackageCredits, 10) * parseFloat(newPackagePricePerCredit) || 0).toFixed(0)}
                      </Text>
                    ) : null}
                    
                    <View style={styles.formActions}>
                      <Pressable
                        style={styles.formCancelButton}
                        onPress={() => {
                          setShowCreatePackageForm(false);
                          setNewPackageName("");
                          setNewPackageCredits("");
                          setNewPackagePricePerCredit("");
                        }}
                      >
                        <Text style={styles.formCancelButtonText}>Cancel</Text>
                      </Pressable>
                      
                      <Pressable
                        style={[
                          styles.formSaveButton,
                          (!newPackageName.trim() || !newPackageCredits || !newPackagePricePerCredit || createPackageMutation.isPending) && styles.formSaveButtonDisabled,
                        ]}
                        onPress={handleCreatePackage}
                        disabled={!newPackageName.trim() || !newPackageCredits || !newPackagePricePerCredit || createPackageMutation.isPending}
                      >
                        {createPackageMutation.isPending ? (
                          <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                        ) : (
                          <Text style={styles.formSaveButtonText}>Create Package</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.infoBox}>
                      <Ionicons name="information-circle-outline" size={16} color={Colors.dark.textMuted} />
                      <Text style={styles.infoBoxText}>
                        Credit packages are automatically priced based on your session pricing.
                      </Text>
                    </View>
                    
                    {Object.entries(creditPackagesByType).map(([creditType, packages]) => {
                      const config = CREDIT_TYPE_CONFIG[creditType] || { label: creditType, color: Colors.dark.textMuted, icon: "cube" };
                      const isExpanded = expandedCreditType === creditType;
                      const pricePerCredit = packages[0]?.pricePerCredit || "0";
                      const currency = packages[0]?.currency || "AED";
                      
                      return (
                        <View key={creditType} style={styles.creditAccordion}>
                          <Pressable
                            style={[styles.creditAccordionHeader, isExpanded && styles.creditAccordionHeaderExpanded]}
                            onPress={() => setExpandedCreditType(isExpanded ? null : creditType)}
                          >
                            <View style={styles.creditAccordionLeft}>
                              <View style={[styles.creditTypeIcon, { backgroundColor: config.color + "30" }]}>
                                <Ionicons name={config.icon as any} size={20} color={config.color} />
                              </View>
                              <View>
                                <Text style={styles.creditAccordionTitle}>{config.label}</Text>
                                <Text style={styles.creditAccordionSubtitle}>
                                  {currency} {parseFloat(pricePerCredit).toFixed(2)} per credit
                                </Text>
                              </View>
                            </View>
                            <Ionicons 
                              name={isExpanded ? "chevron-up" : "chevron-down"} 
                              size={20} 
                              color={Colors.dark.textMuted} 
                            />
                          </Pressable>
                          
                          {isExpanded ? (
                            <View style={styles.creditOptionsGrid}>
                              {packages.map((pkg) => {
                                const isSelected = selectedCreditPackage?.creditType === pkg.creditType && 
                                                   selectedCreditPackage?.credits === pkg.credits;
                                return (
                                  <Pressable
                                    key={`${pkg.creditType}-${pkg.credits}`}
                                    style={[
                                      styles.creditOption,
                                      isSelected && styles.creditOptionSelected,
                                    ]}
                                    onPress={() => {
                                      setSelectedPackageTemplateId(null);
                                      setSelectedCreditPackage({
                                        creditType: pkg.creditType,
                                        credits: pkg.credits,
                                        price: pkg.totalPrice,
                                      });
                                    }}
                                  >
                                    <Text style={[styles.creditOptionCredits, isSelected && styles.creditOptionTextSelected]}>
                                      {pkg.credits}
                                    </Text>
                                    <Text style={[styles.creditOptionLabel, isSelected && styles.creditOptionTextSelected]}>
                                      {pkg.credits === 1 ? "credit" : "credits"}
                                    </Text>
                                    <Text style={[styles.creditOptionPrice, isSelected && styles.creditOptionTextSelected]}>
                                      {pkg.currency} {parseFloat(pkg.totalPrice).toFixed(0)}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                    
                    {selectedCreditPackage ? (
                      <Pressable
                        style={[styles.assignPackageButton, addPlayerMutation.isPending && styles.assignPackageButtonDisabled]}
                        onPress={() => {
                          addPlayerMutation.mutate({
                            playerId: selectedPlayerId!,
                            joinDate: joinDate.toISOString().split("T")[0],
                            attendedSessionIds: Object.entries(selectedAttendance)
                              .filter(([_, attended]) => attended)
                              .map(([id]) => id),
                            packageTemplateId: null,
                            creditPackage: {
                              creditType: selectedCreditPackage.creditType,
                              credits: selectedCreditPackage.credits,
                            },
                            isGuest: isGuestAdd,
                            guestUntil: isGuestAdd ? guestUntilDate.toISOString().split("T")[0] : null,
                          });
                        }}
                        disabled={addPlayerMutation.isPending}
                      >
                        <Text style={styles.assignPackageButtonText}>
                          {addPlayerMutation.isPending ? "Adding..." : `Assign ${selectedCreditPackage.credits} ${selectedCreditPackage.creditType} Credits`}
                        </Text>
                      </Pressable>
                    ) : null}
                    
                    {packageTemplates.length > 0 ? (
                      <View style={styles.templateSection}>
                        <Text style={styles.templateSectionTitle}>Or select a saved package:</Text>
                        {packageTemplates.map((template) => (
                          <View key={template.id} style={styles.templateRow}>
                            <Pressable
                              style={[
                                styles.packageCard,
                                styles.packageCardFlex,
                                selectedPackageTemplateId === template.id && styles.packageCardSelected,
                              ]}
                              onPress={() => {
                                setSelectedCreditPackage(null);
                                handleSelectPackage(template.id);
                              }}
                            >
                              <View style={styles.packageInfo}>
                                <Text style={styles.packageName}>{template.name}</Text>
                                <Text style={styles.packageDetails}>
                                  {template.credits} credits - Valid {template.validityDays} days
                                </Text>
                              </View>
                              <Text style={styles.packagePrice}>
                                {template.currency} {parseFloat(template.price).toFixed(0)}
                              </Text>
                            </Pressable>
                            <Pressable
                              style={styles.templateDeleteButton}
                              onPress={() => deleteTemplateMutation.mutate(template.id)}
                              disabled={deleteTemplateMutation.isPending}
                            >
                              <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    
                    <Pressable
                      style={styles.createPackageButton}
                      onPress={() => setShowCreatePackageForm(true)}
                    >
                      <Ionicons name="add-circle-outline" size={20} color={Colors.dark.successNeon} />
                      <Text style={styles.createPackageButtonText}>Create Custom Package</Text>
                    </Pressable>
                  </>
                )}
                
                <Pressable
                  style={[styles.skipButton, addPlayerMutation.isPending && styles.skipButtonDisabled]}
                  onPress={handleSkipPackage}
                  disabled={addPlayerMutation.isPending}
                >
                  <Text style={styles.skipButtonText}>
                    {addPlayerMutation.isPending ? "Adding..." : "Skip - Add Without Package"}
                  </Text>
                </Pressable>
              </KeyboardAwareScrollViewCompat>
            ) : selectedPlayerId ? (
              // Join date picker screen
              <View style={styles.addPlayerContent}>
                <Text style={styles.selectedPlayerName}>
                  {allPlayers.find(p => p.id === selectedPlayerId)?.name}
                </Text>
                
                <Text style={styles.dateLabel}>When did they join this class?</Text>
                {Platform.OS === "web" ? (
                  <WebCalendarPicker
                    value={joinDate}
                    onChange={setJoinDate}
                    maximumDate={new Date()}
                  />
                ) : (
                  <>
                    <Pressable 
                      style={styles.datePickerButton}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={20} color={Colors.dark.successNeon} />
                      <Text style={styles.datePickerText}>{joinDate.toLocaleDateString()}</Text>
                    </Pressable>
                    
                    {showDatePicker ? (
                      <DateTimePicker
                        value={joinDate}
                        mode="date"
                        display="default"
                        onChange={(_, date) => {
                          setShowDatePicker(false);
                          if (date) setJoinDate(date);
                        }}
                        maximumDate={new Date()}
                      />
                    ) : null}
                  </>
                )}
                
                <View style={styles.guestToggleContainer}>
                  <View style={styles.guestToggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.guestToggleLabel}>Add as Guest</Text>
                      <Text style={styles.guestToggleSubtext}>Temporary membership with an end date</Text>
                    </View>
                    <Pressable
                      style={[styles.guestToggleSwitch, isGuestAdd && styles.guestToggleSwitchActive]}
                      onPress={() => setIsGuestAdd(!isGuestAdd)}
                    >
                      <View style={[styles.guestToggleKnob, isGuestAdd && styles.guestToggleKnobActive]} />
                    </Pressable>
                  </View>
                  
                  {isGuestAdd ? (
                    <View style={styles.guestDateSection}>
                      <Text style={styles.guestDateLabel}>Guest until</Text>
                      <View style={styles.guestQuickButtons}>
                        {[
                          { label: "1 week", days: 7 },
                          { label: "2 weeks", days: 14 },
                          { label: "1 month", days: 30 },
                        ].map(({ label, days }) => {
                          const target = new Date();
                          target.setDate(target.getDate() + days);
                          const isSelected = Math.abs(guestUntilDate.getTime() - target.getTime()) < 86400000;
                          return (
                            <Pressable
                              key={label}
                              style={[styles.guestQuickBtn, isSelected && styles.guestQuickBtnActive]}
                              onPress={() => {
                                const d = new Date();
                                d.setDate(d.getDate() + days);
                                setGuestUntilDate(d);
                              }}
                            >
                              <Text style={[styles.guestQuickBtnText, isSelected && styles.guestQuickBtnTextActive]}>{label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <Pressable 
                        style={styles.datePickerButton}
                        onPress={() => setShowGuestDatePicker(true)}
                      >
                        <Ionicons name="calendar-outline" size={18} color={Colors.dark.orange} />
                        <Text style={[styles.datePickerText, { color: Colors.dark.orange }]}>
                          Until {guestUntilDate.toLocaleDateString()}
                        </Text>
                      </Pressable>
                      {showGuestDatePicker ? (
                        <DateTimePicker
                          value={guestUntilDate}
                          mode="date"
                          display="default"
                          onChange={(_, date) => {
                            setShowGuestDatePicker(false);
                            if (date) setGuestUntilDate(date);
                          }}
                          minimumDate={new Date()}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
                
                <Pressable
                  style={[styles.saveButton, { marginTop: Spacing.xl }]}
                  onPress={handleContinueToPackage}
                >
                  <Text style={styles.saveButtonText}>Continue</Text>
                </Pressable>
              </View>
            ) : (
              // Player selection screen
              <View style={styles.addPlayerContent}>
                <View style={styles.searchContainer}>
                  <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search players..."
                    placeholderTextColor={Colors.dark.textMuted}
                    value={playerSearch}
                    onChangeText={setPlayerSearch}
                  />
                </View>
                
                <ScrollView style={styles.playerList}>
                  {filteredPlayers.length === 0 ? (
                    <Text style={styles.noPlayersText}>
                      {playerSearch ? "No matching players" : "No available players"}
                    </Text>
                  ) : (
                    filteredPlayers.map((player) => {
                      const playerBallColor = getBallLevelColor(player.ballLevel);
                      return (
                      <Pressable
                        key={player.id}
                        style={styles.selectablePlayerRow}
                        onPress={() => handlePlayerSelect(player.id)}
                      >
                        <View style={[styles.playerAvatar, { backgroundColor: playerBallColor + "30", borderWidth: 2, borderColor: playerBallColor }]}>
                          <Text style={[styles.playerInitial, { color: playerBallColor }]}>
                            {player.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.playerInfo}>
                          <Text style={styles.playerName}>{player.name}</Text>
                          {player.ballLevel ? (
                            <Text style={styles.playerStats}>{player.ballLevel.toUpperCase()}</Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
                      </Pressable>
                    );})
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Attendance Modal (also contains Transfer view) */}
      <Modal
        visible={showAttendanceModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowAttendanceModal(false);
          setAttendanceModalView("attendance");
          setSelectedTargetCoachId(null);
        }}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => {
            setShowAttendanceModal(false);
            setAttendanceModalView("attendance");
            setSelectedTargetCoachId(null);
          }} />
          <View style={[styles.drawer, { paddingTop: Spacing.xl, paddingHorizontal: Spacing.lg }]}>
            {/* Dynamic Header based on view */}
            <View style={styles.attendanceModalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                {attendanceModalView === "transfer" && (
                  <Pressable 
                    onPress={() => {
                      setAttendanceModalView("attendance");
                      setSelectedTargetCoachId(null);
                    }}
                    style={{ marginRight: Spacing.xs }}
                  >
                    <Ionicons name="arrow-back" size={24} color={Colors.dark.accentCyan} />
                  </Pressable>
                )}
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                    {attendanceModalView === "transfer" && (
                      <Ionicons name="swap-horizontal" size={20} color={Colors.dark.accentCyan} />
                    )}
                    <Text style={styles.attendanceModalTitle}>
                      {attendanceModalView === "transfer" ? "Transfer Session" : "Mark Attendance"}
                    </Text>
                    {loadingAttendance && attendanceModalView === "attendance" ? (
                      <ActivityIndicator size="small" color={Colors.dark.accentNeon} />
                    ) : null}
                  </View>
                  {selectedSession ? (
                    <Text style={styles.attendanceModalDate}>
                      {formatDate(selectedSession.startTime)} - Week {selectedSession.weekNumber || ([...(series?.sessions || [])].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).findIndex(s => s.id === selectedSession.id) + 1)}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Pressable onPress={() => {
                setShowAttendanceModal(false);
                setAttendanceModalView("attendance");
                setSelectedTargetCoachId(null);
              }}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            {/* Attendance View */}
            {attendanceModalView === "attendance" ? (
            <ScrollView style={{ flex: 1 }}>
              {(() => {
                const sessionDate = selectedSession ? new Date(selectedSession.startTime) : new Date();
                // Filter players who were active at the session date (including former players who were active then)
                const activePlayers = (series?.players || []).filter(p => isPlayerActiveForSession(p, sessionDate));
                const presentCount = Object.values(sessionAttendance).filter(s => s === "present").length;
                const sessionType = series?.sessionType || "group";
                
                let creditTypeHint = "";
                let isPrivateCharge = false;
                if (sessionType === "semi_private" || sessionType === "semi") {
                  if (activePlayers.length === 1) {
                    creditTypeHint = "Only 1 player in group - charged as private lesson";
                    isPrivateCharge = true;
                  } else if (presentCount === 1) {
                    creditTypeHint = "Only 1 player present - charged as private lesson";
                    isPrivateCharge = true;
                  } else if (presentCount >= 2) {
                    creditTypeHint = "Semi-private credits will be charged";
                    isPrivateCharge = false;
                  }
                }

                return (
                  <>
                    {activePlayers.map((player) => {
                      const status = sessionAttendance[player.id] || "present";
                      return (
                        <View key={player.id} style={styles.attendancePlayerRow}>
                          <View style={styles.attendancePlayerInfo}>
                            <View style={styles.attendancePlayerAvatar}>
                              <Text style={styles.attendancePlayerInitial}>
                                {player.name.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <Text style={styles.attendancePlayerName}>{player.name}</Text>
                          </View>
                          <View style={styles.attendanceToggle}>
                            <Pressable
                              style={[
                                styles.attendanceToggleOption,
                                status === "present" && styles.attendanceToggleActive,
                              ]}
                              onPress={() => handleSetAttendance(player.id, "present")}
                            >
                              <Text
                                style={[
                                  styles.attendanceToggleText,
                                  status === "present" && styles.attendanceToggleTextActive,
                                ]}
                              >
                                Present
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.attendanceToggleOption,
                                status === "absent" && styles.attendanceToggleAbsent,
                              ]}
                              onPress={() => handleSetAttendance(player.id, "absent")}
                            >
                              <Text
                                style={[
                                  styles.attendanceToggleText,
                                  status === "absent" && styles.attendanceToggleTextActive,
                                ]}
                              >
                                Absent
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.attendanceToggleOption,
                                status === "vacation" && styles.attendanceToggleVacation,
                              ]}
                              onPress={() => handleSetAttendance(player.id, "vacation")}
                            >
                              <Text
                                style={[
                                  styles.attendanceToggleText,
                                  status === "vacation" && styles.attendanceToggleTextActive,
                                ]}
                              >
                                Vacation
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                    
                    {creditTypeHint ? (
                      <View style={[
                        styles.creditHintBox,
                        isPrivateCharge ? styles.creditHintBoxPrivate : styles.creditHintBoxSemi
                      ]}>
                        <Ionicons 
                          name={isPrivateCharge ? "person" : "people"} 
                          size={16} 
                          color={isPrivateCharge ? Colors.dark.sessionPrivate : Colors.dark.sessionSemiPrivate} 
                        />
                        <Text style={[
                          styles.creditHint, 
                          isPrivateCharge ? styles.creditHintPrivate : styles.creditHintSemi
                        ]}>
                          {creditTypeHint}
                        </Text>
                      </View>
                    ) : null}
                  </>
                );
              })()}

              <View style={styles.attendanceActions}>
                <Pressable
                  style={[styles.saveButton, (savingAttendance || cancellingSession) && styles.saveButtonDisabled]}
                  onPress={handleSaveAttendance}
                  disabled={savingAttendance || cancellingSession}
                >
                  <Text style={styles.saveButtonText}>
                    {savingAttendance ? "Saving..." : "Save Attendance"}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.cancelSessionButton, (savingAttendance || cancellingSession) && styles.saveButtonDisabled]}
                  onPress={handleCancelSession}
                  disabled={savingAttendance || cancellingSession}
                >
                  <Text style={styles.cancelSessionButtonText}>
                    {cancellingSession ? "Cancelling..." : "Cancel Session (Holiday/No Class)"}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.transferButton, (savingAttendance || cancellingSession) && styles.saveButtonDisabled]}
                  onPress={() => {
                    setAttendanceModalView("transfer");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  disabled={savingAttendance || cancellingSession}
                >
                  <Ionicons name="swap-horizontal" size={18} color={Colors.dark.text} />
                  <Text style={styles.transferButtonText}>Transfer to Another Coach</Text>
                </Pressable>

                <Pressable
                  style={[styles.deleteSessionButton, (savingAttendance || cancellingSession || deletingSession) && styles.saveButtonDisabled]}
                  onPress={() => {
                    Alert.alert(
                      "Delete Session",
                      "Are you sure you want to permanently delete this session? This will remove it from the calendar and refund any credits used. This cannot be undone.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { 
                          text: "Delete", 
                          style: "destructive",
                          onPress: handleDeleteSession
                        }
                      ]
                    );
                  }}
                  disabled={savingAttendance || cancellingSession || deletingSession}
                >
                  <Ionicons name="trash-outline" size={18} color="#FF4444" />
                  <Text style={styles.deleteSessionButtonText}>
                    {deletingSession ? "Deleting..." : "Delete Session Permanently"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
            ) : (
            /* Transfer View */
            <View style={{ flex: 1 }}>
              <View style={styles.transferInfoCard}>
                <Ionicons name="information-circle" size={18} color={Colors.dark.accentCyan} />
                <Text style={styles.transferInfoText}>
                  The session will be removed from your calendar and added to the selected coach's calendar.
                </Text>
              </View>

              <Text style={styles.transferSectionLabel}>Select Coach</Text>
              
              <ScrollView 
                style={styles.transferCoachList}
                showsVerticalScrollIndicator={false}
              >
                {coaches.filter(c => c.id !== currentCoach?.id).length === 0 ? (
                  <View style={styles.noCoachesContainer}>
                    <Ionicons name="people-outline" size={40} color={Colors.dark.textMuted} />
                    <Text style={styles.noCoachesText}>No other coaches available</Text>
                  </View>
                ) : (
                  coaches.filter(c => c.id !== currentCoach?.id).map((coach) => (
                    <Pressable
                      key={coach.id}
                      style={[
                        styles.transferCoachCard,
                        selectedTargetCoachId === coach.id && styles.transferCoachCardActive,
                      ]}
                      onPress={() => {
                        setSelectedTargetCoachId(coach.id);
                        Haptics.selectionAsync();
                      }}
                    >
                      <LinearGradient
                        colors={selectedTargetCoachId === coach.id 
                          ? [Colors.dark.accentCyan + "25", Colors.dark.accentCyan + "10"]
                          : ["transparent", "transparent"]
                        }
                        style={StyleSheet.absoluteFillObject}
                      />
                      <View style={[
                        styles.transferCoachAvatar,
                        selectedTargetCoachId === coach.id && styles.transferCoachAvatarActive,
                      ]}>
                        <Text style={[
                          styles.transferCoachAvatarText,
                          selectedTargetCoachId === coach.id && styles.transferCoachAvatarTextActive,
                        ]}>
                          {coach.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.transferCoachInfo}>
                        <Text style={styles.transferCoachName}>{coach.name}</Text>
                        <Text style={styles.transferCoachRole}>Coach</Text>
                      </View>
                      {selectedTargetCoachId === coach.id ? (
                        <View style={styles.transferCheckmark}>
                          <Ionicons name="checkmark" size={16} color={"rgba(255, 255, 255, 0.06)"} />
                        </View>
                      ) : (
                        <View style={styles.transferRadio} />
                      )}
                    </Pressable>
                  ))
                )}
              </ScrollView>

              <View style={styles.transferActions}>
                <Pressable
                  style={[
                    styles.transferConfirmButton,
                    (!selectedTargetCoachId || transferringSession) && styles.transferConfirmButtonDisabled,
                  ]}
                  onPress={() => {
                    if (selectedSession && selectedTargetCoachId) {
                      setTransferringSession(true);
                      transferSessionMutation.mutate({
                        sessionId: selectedSession.id,
                        targetCoachId: selectedTargetCoachId,
                      });
                    }
                  }}
                  disabled={!selectedTargetCoachId || transferringSession}
                >
                  <LinearGradient
                    colors={!selectedTargetCoachId || transferringSession
                      ? ["rgba(255, 255, 255, 0.04)", "rgba(255, 255, 255, 0.04)"]
                      : [GlowColors.primary, GlowColors.soft]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.transferConfirmGradient}
                  >
                    <Ionicons 
                      name={transferringSession ? "hourglass" : "swap-horizontal"} 
                      size={20} 
                      color={!selectedTargetCoachId || transferringSession ? Colors.dark.textMuted : "rgba(255, 255, 255, 0.06)"} 
                    />
                    <Text style={[
                      styles.transferConfirmText,
                      (!selectedTargetCoachId || transferringSession) && styles.transferConfirmTextDisabled,
                    ]}>
                      {transferringSession ? "Transferring..." : "Confirm Transfer"}
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
            )}
          </View>
        </View>
      </Modal>

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
      <Modal
        visible={showExtraLessonModal}
        animationType="fade"
        transparent={true}
        onRequestClose={resetExtraLessonModal}
      >
        <View style={styles.extendModalOverlay}>
          <View style={styles.extendModalBackdrop}>
            <Pressable 
              style={StyleSheet.absoluteFill} 
              onPress={resetExtraLessonModal} 
            />
          </View>
          <View style={styles.extendModalContent}>
            {/* Step Indicator */}
            <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: Spacing.md, gap: Spacing.xs }}>
              {[1, 2, 3].map((step) => (
                <View 
                  key={step} 
                  style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: 4, 
                    backgroundColor: extraLessonStep >= step ? Colors.dark.warning : Colors.dark.border 
                  }} 
                />
              ))}
            </View>
            
            {/* Step 1: Court Selection */}
            {extraLessonStep === 1 && (
              <>
                <View style={styles.extendModalHeader}>
                  <Ionicons name="tennisball-outline" size={32} color={Colors.dark.warning} />
                  <Text style={styles.extendModalTitle}>Select Court</Text>
                  <Text style={styles.extendModalSubtitle}>
                    Choose a court for the extra lesson
                  </Text>
                </View>
                
                <View style={{ marginBottom: Spacing.md }}>
                  {courtsData && courtsData.length > 0 ? (
                    courtsData.map((court, index) => (
                      <Pressable
                        key={court.id}
                        style={[
                          {
                            flexDirection: "row",
                            alignItems: "center",
                            padding: Spacing.md,
                            borderRadius: BorderRadius.md,
                            backgroundColor: selectedCourtId === court.id ? Colors.dark.warning + "20" : Colors.dark.backgroundSecondary,
                            borderWidth: 2,
                            borderColor: selectedCourtId === court.id ? Colors.dark.warning : Colors.dark.border,
                            marginBottom: index < courtsData.length - 1 ? Spacing.sm : 0,
                          },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedCourtId(court.id);
                        }}
                      >
                        <View style={{ 
                          width: 16, 
                          height: 16, 
                          borderRadius: 8, 
                          backgroundColor: court.color || Colors.dark.accent,
                          marginRight: Spacing.md,
                        }} />
                        <Text style={{
                          color: selectedCourtId === court.id ? Colors.dark.warning : Colors.dark.text,
                          fontSize: 16,
                          fontWeight: selectedCourtId === court.id ? "600" : "400",
                          flex: 1,
                        }}>
                          {court.name}
                        </Text>
                        {selectedCourtId === court.id && (
                          <Ionicons name="checkmark-circle" size={22} color={Colors.dark.warning} />
                        )}
                      </Pressable>
                    ))
                  ) : (
                    <View style={{ padding: Spacing.lg, alignItems: "center" }}>
                      <Ionicons name="tennisball-outline" size={40} color={Colors.dark.textMuted} />
                      <Text style={{ color: Colors.dark.textSecondary, textAlign: "center", marginTop: Spacing.sm }}>
                        No courts available
                      </Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.extendModalFooter}>
                  <Pressable style={styles.extendCancelButton} onPress={resetExtraLessonModal}>
                    <Text style={styles.extendCancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.extendConfirmButton, !selectedCourtId && { opacity: 0.5 }]}
                    onPress={() => selectedCourtId && setExtraLessonStep(2)}
                    disabled={!selectedCourtId}
                  >
                    <LinearGradient
                      colors={[Colors.dark.warning, Colors.dark.warning]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.extendConfirmGradient}
                    >
                      <Text style={styles.extendConfirmButtonText}>Next</Text>
                      <Ionicons name="arrow-forward" size={18} color={Colors.dark.backgroundRoot} />
                    </LinearGradient>
                  </Pressable>
                </View>
              </>
            )}
            
            {/* Step 2: Date Selection */}
            {extraLessonStep === 2 && (
              <>
                <View style={styles.extendModalHeader}>
                  <Ionicons name="calendar-outline" size={32} color={Colors.dark.warning} />
                  <Text style={styles.extendModalTitle}>Select Date</Text>
                  <Text style={styles.extendModalSubtitle}>
                    Pick a date for the extra lesson
                  </Text>
                </View>
                
                {Platform.OS === "web" ? (
                  <WebCalendarPicker
                    value={extraLessonDate}
                    onChange={(date) => setExtraLessonDate(date)}
                  />
                ) : (
                  <>
                    <Pressable
                      style={styles.datePickerButton}
                      onPress={() => setShowExtraLessonDatePicker(true)}
                    >
                      <Ionicons name="calendar" size={20} color={Colors.dark.accent} />
                      <Text style={styles.datePickerText}>
                        {extraLessonDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                      </Text>
                    </Pressable>
                    {showExtraLessonDatePicker && (
                      <DateTimePicker
                        value={extraLessonDate}
                        mode="date"
                        display="default"
                        onChange={(event, selectedDate) => {
                          setShowExtraLessonDatePicker(false);
                          if (selectedDate) setExtraLessonDate(selectedDate);
                        }}
                      />
                    )}
                  </>
                )}
                
                <View style={[styles.extendModalFooter, { marginTop: Spacing.lg }]}>
                  <Pressable style={styles.extendCancelButton} onPress={() => setExtraLessonStep(1)}>
                    <Ionicons name="arrow-back" size={16} color={Colors.dark.textSecondary} />
                    <Text style={styles.extendCancelButtonText}>Back</Text>
                  </Pressable>
                  <Pressable
                    style={styles.extendConfirmButton}
                    onPress={() => setExtraLessonStep(3)}
                  >
                    <LinearGradient
                      colors={[Colors.dark.warning, Colors.dark.warning]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.extendConfirmGradient}
                    >
                      <Text style={styles.extendConfirmButtonText}>Next</Text>
                      <Ionicons name="arrow-forward" size={18} color={Colors.dark.backgroundRoot} />
                    </LinearGradient>
                  </Pressable>
                </View>
              </>
            )}
            
            {/* Step 3: Time Selection */}
            {extraLessonStep === 3 && (
              <>
                <View style={styles.extendModalHeader}>
                  <Ionicons name="time-outline" size={32} color={Colors.dark.warning} />
                  <Text style={styles.extendModalTitle}>Available Times</Text>
                  <Text style={styles.extendModalSubtitle}>
                    {courtsData?.find(c => c.id === selectedCourtId)?.name || "Court"} - {extraLessonDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </Text>
                  <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginTop: 4 }}>
                    Tap a start time, then tap an end time to set duration
                  </Text>
                </View>
                
                <View style={{ 
                  flexDirection: "row", 
                  flexWrap: "wrap", 
                  justifyContent: "space-between",
                  marginBottom: Spacing.md,
                }}>
                  {timeSlots.map((slot) => {
                    const isStart = selectedTimeSlot === slot.time;
                    const isEnd = selectedEndTimeSlot === slot.time;
                    const inRange = isInRange(slot.time);
                    const isHighlighted = isStart || isEnd || inRange;
                    const busyLabel = slot.coachBusy ? "You're busy" : slot.courtBusy ? "Court busy" : !slot.available ? "Booked" : "";
                    return (
                      <Pressable
                        key={slot.time}
                        style={{
                          width: "23%",
                          paddingVertical: Spacing.xs,
                          paddingHorizontal: Spacing.xs,
                          marginBottom: Spacing.xs,
                          borderRadius: BorderRadius.md,
                          borderWidth: 2,
                          borderColor: isHighlighted ? Colors.dark.successNeon : slot.coachBusy ? "#FF6B6B60" : Colors.dark.border,
                          backgroundColor: isHighlighted
                            ? Colors.dark.successNeon + "30"
                            : slot.coachBusy
                              ? "#FF6B6B15"
                              : slot.available
                                ? Colors.dark.backgroundSecondary
                                : Colors.dark.backgroundRoot,
                          opacity: slot.available ? 1 : 0.5,
                          alignItems: "center",
                        }}
                        onPress={() => {
                          if (!slot.available) return;
                          Haptics.selectionAsync();
                          const slotMins = (() => { const [h, m] = slot.time.split(":").map(Number); return h * 60 + m; })();

                          if (!selectedTimeSlot) {
                            // No start yet — set start
                            setSelectedTimeSlot(slot.time);
                            setSelectedEndTimeSlot(null);
                            const [hours, minutes] = slot.time.split(":");
                            const newTime = new Date();
                            newTime.setHours(parseInt(hours), parseInt(minutes || "0"), 0, 0);
                            setExtraLessonTime(newTime);
                          } else {
                            const startMins = (() => { const [h, m] = selectedTimeSlot.split(":").map(Number); return h * 60 + m; })();
                            if (slot.time === selectedTimeSlot) {
                              // Tap start again — deselect all
                              setSelectedTimeSlot(null);
                              setSelectedEndTimeSlot(null);
                            } else if (slotMins > startMins && isRangeClear(selectedTimeSlot, slot.time)) {
                              // Valid end time — set range
                              setSelectedEndTimeSlot(slot.time);
                            } else {
                              // Reset: treat tapped slot as new start
                              setSelectedTimeSlot(slot.time);
                              setSelectedEndTimeSlot(null);
                              const [hours, minutes] = slot.time.split(":");
                              const newTime = new Date();
                              newTime.setHours(parseInt(hours), parseInt(minutes || "0"), 0, 0);
                              setExtraLessonTime(newTime);
                            }
                          }
                        }}
                      >
                        <Text style={{
                          color: isHighlighted
                            ? Colors.dark.successNeon
                            : slot.available
                              ? Colors.dark.text
                              : Colors.dark.textMuted,
                          fontSize: 13,
                          fontWeight: isHighlighted ? "700" : "500",
                        }}>
                          {slot.time}
                        </Text>
                        {busyLabel ? (
                          <Text style={{ color: slot.coachBusy ? "#FF6B6B" : Colors.dark.textMuted, fontSize: 8, marginTop: 1 }}>
                            {busyLabel}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
                
                {selectedTimeSlot && (
                  <View style={{ 
                    padding: Spacing.md, 
                    backgroundColor: Colors.dark.successNeon + "15", 
                    borderRadius: BorderRadius.md,
                    borderWidth: 1,
                    borderColor: Colors.dark.successNeon + "40",
                    marginBottom: Spacing.md,
                  }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                      <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
                      {selectedEndTimeSlot ? (
                        <Text style={{ color: Colors.dark.successNeon, fontWeight: "600", fontSize: 14 }}>
                          {selectedTimeSlot} → {selectedEndTimeSlot} ({calcDurationMins(selectedTimeSlot, selectedEndTimeSlot)} min)
                        </Text>
                      ) : (
                        <Text style={{ color: Colors.dark.successNeon, fontWeight: "600", fontSize: 14 }}>
                          Start: {selectedTimeSlot} — tap an end time
                        </Text>
                      )}
                    </View>
                  </View>
                )}
                
                <View style={[styles.extendModalFooter, { marginTop: Spacing.sm }]}>
                  <Pressable style={styles.extendCancelButton} onPress={() => setExtraLessonStep(2)}>
                    <Ionicons name="arrow-back" size={16} color={Colors.dark.textSecondary} />
                    <Text style={styles.extendCancelButtonText}>Back</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.extendConfirmButton, !selectedTimeSlot && { opacity: 0.5 }]}
                    onPress={confirmAddExtraLesson}
                    disabled={!selectedTimeSlot}
                  >
                    <LinearGradient
                      colors={[Colors.dark.successNeon, Colors.dark.accentGreen]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.extendConfirmGradient}
                    >
                      <Ionicons name="checkmark-circle" size={20} color={Colors.dark.backgroundRoot} />
                      <Text style={styles.extendConfirmButtonText}>Add Lesson</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </>
            )}
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

