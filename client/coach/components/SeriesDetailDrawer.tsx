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
import { SeriesSmartFillModal } from "./series-detail/SeriesSmartFillModal";
import { SeriesAddPlayerModal } from "./series-detail/SeriesAddPlayerModal";
import { SeriesAttendanceModal } from "./series-detail/SeriesAttendanceModal";
import { SeriesExtraLessonModal } from "./series-detail/SeriesExtraLessonModal";
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
        savingAttendance={saveAttendanceMutation.isPending}
        cancellingSession={cancelSessionMutation.isPending}
        deletingSession={deleteSessionMutation.isPending}
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

