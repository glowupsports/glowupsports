import React, { useState, useMemo } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { convertUTCTimeToLocal } from "@/lib/dateUtils";
import { useCoach } from "@/coach/context/CoachContext";
import { WebCalendarPicker } from "@/components/WebCalendarPicker";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface PlayerCredits {
  group: number;
  semi_private: number;
  private: number;
  totalDebt: number;
  hasDebt: boolean;
}

interface Player {
  id: string;
  name: string;
  ballLevel?: string | null;
  status?: string; // active | paused | left
  sessionsAttended?: number;
  totalXpEarned?: number;
  joinedAt?: string;
  leftAt?: string | null;
  pauseFrom?: string | null;
  pauseUntil?: string | null;
  pauseReason?: string | null;
  linkedPackageId?: string | null;
  credits?: PlayerCredits;
}

interface FeedbackData {
  feedback: {
    id: string;
    sessionId: string;
    intensity: string | null;
    mood: string | null;
    coachNotes: string | null;
    sessionDate?: string;
  }[];
  playerFeedback: {
    id: string;
    playerId: string;
    sessionId: string;
    progressTrend: string | null;
    effortLevel: string | null;
    note: string | null;
  }[];
  summary: {
    total: number;
    withFeedback: number;
    intensity: Record<string, number>;
  };
}

interface ProgressData {
  players: {
    id: string;
    name: string;
    xpEarned: number;
    sessionsAttended: number;
  }[];
  totalXp: number;
  sessionsCompleted: number;
  totalSessions: number;
}

interface SessionInstance {
  id: string;
  startTime: string;
  endTime: string;
  status: string | null;
  weekNumber?: number;
}

interface SeriesDetail {
  id: string;
  title: string;
  dayOfWeek: number;
  startTime: string;
  duration: number;
  sessionType: string;
  status: string;
  weekCount: number | null;
  seriesStartDate: string;
  seriesEndDate: string | null;
  maxPlayers: number;
  xpPerSession: number;
  locationName?: string;
  courtName?: string;
  players: Player[];
  sessions: SessionInstance[];
  stats: {
    totalSessions: number;
    completedSessions: number;
    upcomingSessions: number;
    cancelledSessions: number;
  };
}

interface SeriesDetailDrawerProps {
  visible: boolean;
  seriesId: string | null;
  onClose: () => void;
}

type TabId = "overview" | "timeline" | "feedback" | "progress";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "information-circle-outline" },
  { id: "timeline", label: "Timeline", icon: "calendar-outline" },
  { id: "feedback", label: "Feedback", icon: "chatbubble-outline" },
  { id: "progress", label: "Progress", icon: "trending-up-outline" },
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SESSION_TYPE_COLORS: Record<string, string> = {
  private: Colors.dark.sessionPrivate,
  semi_private: Colors.dark.sessionSemiPrivate,
  group: Colors.dark.sessionGroup,
  camp: Colors.dark.sessionPhysical,
  team_training: Colors.dark.sessionPhysical,
  clinic: Colors.dark.sessionActivity,
};

function getSessionTypeColor(type: string): string {
  return SESSION_TYPE_COLORS[type] || Colors.dark.textMuted;
}

export default function SeriesDetailDrawer({
  visible,
  seriesId,
  onClose,
}: SeriesDetailDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { academy } = useCoach();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [joinDate, setJoinDate] = useState<Date>(new Date());
  const [playerSearch, setPlayerSearch] = useState("");
  const [showPackageSelection, setShowPackageSelection] = useState(false);
  const [selectedPackageTemplateId, setSelectedPackageTemplateId] = useState<string | null>(null);
  const [showAttendanceBackfill, setShowAttendanceBackfill] = useState(false);
  const [selectedAttendance, setSelectedAttendance] = useState<Record<string, boolean>>({});
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionInstance | null>(null);
  const [sessionAttendance, setSessionAttendance] = useState<Record<string, "present" | "absent" | "vacation">>({});
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [cancellingSession, setCancellingSession] = useState(false);
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
  
  // Create package inline form state
  const [showCreatePackageForm, setShowCreatePackageForm] = useState(false);
  const [newPackageName, setNewPackageName] = useState("");
  const [newPackageCredits, setNewPackageCredits] = useState("");
  const [newPackagePricePerCredit, setNewPackagePricePerCredit] = useState("");

  const { data: series, isLoading } = useQuery<SeriesDetail>({
    queryKey: [`/api/coach/series/${seriesId}`],
    enabled: !!seriesId && visible,
  });

  // Build display title with local time (not UTC time from DB)
  const displayTitle = useMemo(() => {
    if (!series) return "";
    const timezone = academy?.timezone || "Asia/Dubai";
    const localStartTime = convertUTCTimeToLocal(series.startTime, timezone);
    
    // Format to 12-hour with AM/PM (matching subtitle format)
    const [hours, minutes] = localStartTime.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const formattedTime = `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
    
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
    const dayName = DAY_NAMES[series.dayOfWeek];
    return `${typeLabel} - ${dayName} ${formattedTime}`;
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

  // Filter players not already in the series
  const existingPlayerIds = new Set(series?.players?.map(p => p.id) || []);
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
    }) => {
      // Add player to class - backend handles package creation if templateId provided
      return apiRequest("POST", `/api/coach/series/${seriesId}/players`, {
        playerId: data.playerId,
        joinDate: data.joinDate,
        attendedSessionIds: data.attendedSessionIds,
        packageTemplateId: data.packageTemplateId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/package-templates"] });
      setShowAddPlayerModal(false);
      setShowPackageSelection(false);
      setShowAttendanceBackfill(false);
      setSelectedPlayerId(null);
      setSelectedPackageTemplateId(null);
      setJoinDate(new Date());
      setSelectedAttendance({});
      setPlayerSearch("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // Mutation to update max players
  const updateMaxPlayersMutation = useMutation({
    mutationFn: async (maxPlayers: number) => {
      return apiRequest("PATCH", `/api/coach/series/${seriesId}`, { maxPlayers });
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
      updateMaxPlayersMutation.mutate(value);
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
      return result as { id: string; name: string; credits: number; price: string };
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

  // Get past sessions for attendance backfill
  const getPastSessionsSinceJoinDate = () => {
    if (!series) return [];
    
    const toDateOnly = (d: Date) => {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    const joinDateOnly = toDateOnly(joinDate);
    const now = new Date();
    
    return series.sessions.filter(s => {
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
    });
  };

  const handleTabPress = (tabId: TabId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tabId);
  };

  const handleSessionPress = async (session: SessionInstance) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSession(session);
    
    const initialAttendance: Record<string, "present" | "absent" | "vacation"> = {};
    const sessionDate = new Date(session.startTime);
    
    // Filter players who had joined by the session date
    const activePlayers = (series?.players?.filter(p => p.status === "active") || []).filter(p => {
      if (!p.joinedAt) return true; // No join date = show player
      const joinDate = new Date(p.joinedAt);
      return joinDate <= sessionDate;
    });
    
    // First, fetch existing attendance records from the API (source of truth)
    // Add timestamp to prevent 304 caching and get fresh data
    let savedStatuses: Record<string, "present" | "absent" | "vacation"> = {};
    try {
      const response = await apiRequest("GET", `/api/coach/sessions/${session.id}/players?t=${Date.now()}`);
      const sessionPlayers = await response.json() as Array<{ playerId: string; attendanceStatus: string }>;
      
      console.log("[AttendanceLoad] Raw API response:", JSON.stringify(sessionPlayers));
      
      // Build a map of saved statuses from the API
      if (Array.isArray(sessionPlayers)) {
        sessionPlayers.forEach(sp => {
          if (sp.playerId && sp.attendanceStatus) {
            const status = sp.attendanceStatus;
            if (status === "present" || status === "absent" || status === "vacation") {
              savedStatuses[sp.playerId] = status;
              console.log("[AttendanceLoad] Mapped", sp.playerId, "->", status);
            }
          }
        });
      }
      console.log("[AttendanceLoad] Saved statuses map:", savedStatuses);
    } catch (error) {
      console.error("Error loading attendance:", error);
    }
    
    // Now build initialAttendance: use saved status if exists, otherwise default to present
    activePlayers.forEach(p => {
      const lookupStatus = savedStatuses[p.id];
      console.log("[AttendanceLoad] Player", p.name, "lookup:", lookupStatus, "-> final:", lookupStatus || "present");
      initialAttendance[p.id] = lookupStatus || "present";
    });
    
    setSessionAttendance(initialAttendance);
    setShowAttendanceModal(true);
  };

  const handleSetAttendance = (playerId: string, status: "present" | "absent" | "vacation") => {
    console.log("[Attendance] Setting status:", { playerId, status });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSessionAttendance(prev => {
      const newState = {
        ...prev,
        [playerId]: status,
      };
      console.log("[Attendance] New state:", newState);
      return newState;
    });
  };

  const handleSaveAttendance = async () => {
    if (!selectedSession) return;
    setSavingAttendance(true);
    try {
      const attendance = Object.entries(sessionAttendance).map(([playerId, status]) => ({
        playerId,
        status,
      }));
      
      await apiRequest("POST", `/api/coach/sessions/${selectedSession.id}/attendance`, {
        attendance,
        markCompleted: true,
      });
      
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      setShowAttendanceModal(false);
      setSelectedSession(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error saving attendance:", error);
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleCancelSession = async () => {
    if (!selectedSession) return;
    setCancellingSession(true);
    try {
      await apiRequest("PATCH", `/api/coach/sessions/${selectedSession.id}/cancel`, {
        reason: "Holiday / No Class",
      });
      
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      setShowAttendanceModal(false);
      setSelectedSession(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error cancelling session:", error);
    } finally {
      setCancellingSession(false);
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
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (error) {
      console.error("Error deleting series:", error);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert("Failed to delete class series. Please try again.");
      }
    } finally {
      setDeletingSeries(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr: string) => {
    // First convert UTC time to local academy time
    const timezone = academy?.timezone || "Asia/Dubai";
    const localTime = convertUTCTimeToLocal(timeStr, timezone);
    
    const [hours, minutes] = localTime.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
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
              {DAY_NAMES[series.dayOfWeek]}s at {formatTime(series.startTime)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={Colors.dark.textMuted} />
            <Text style={styles.infoText}>{series.duration} minutes</Text>
          </View>
          {series.locationName ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={styles.infoText}>
                {series.locationName}
                {series.courtName ? ` - ${series.courtName}` : ""}
              </Text>
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
            const canAddMore = activePlayers.length < series.maxPlayers;
            
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
                        placeholder={String(series.maxPlayers)}
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
                      onPress={() => { setEditingMaxPlayers(true); setNewMaxPlayers(String(series.maxPlayers)); }}
                      style={styles.editableTitle}
                    >
                      <Text style={styles.sectionTitle}>
                        Active Players ({activePlayers.length}/{series.maxPlayers})
                      </Text>
                      <Ionicons name="pencil" size={14} color={Colors.dark.textMuted} style={{ marginLeft: 6 }} />
                    </Pressable>
                  )}
                  {canAddMore && !editingMaxPlayers ? (
                    <Pressable 
                      onPress={handleAddPlayerPress}
                      style={styles.addPlayerButton}
                    >
                      <Ionicons name="add-circle" size={20} color={Colors.dark.successNeon} />
                      <Text style={styles.addPlayerButtonText}>Add</Text>
                    </Pressable>
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
                    let creditLabel = "";
                    if (credits) {
                      if (sessionType === "private") {
                        relevantCredits = credits.private;
                        creditLabel = "Private";
                      } else if (sessionType === "semi_private" || sessionType === "semi") {
                        relevantCredits = credits.semi_private;
                        creditLabel = "Semi";
                      } else {
                        relevantCredits = credits.group;
                        creditLabel = "Group";
                      }
                    }
                    const hasNoCredits = relevantCredits <= 0;
                    const hasDebt = credits?.hasDebt || false;
                    
                    const isMenuOpen = playerActionMenuId === player.id;
                    const isPausing = pausingPlayerId === player.id;
                    const isRemoving = removingPlayerId === player.id;
                    
                    return (
                      <View key={player.id} style={[styles.playerRow, isMenuOpen && { zIndex: 999 }]}>
                        <View style={[styles.playerAvatar, { backgroundColor: Colors.dark.successNeon + "30" }]}>
                          <Text style={[styles.playerInitial, { color: Colors.dark.successNeon }]}>
                            {player.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.playerInfo}>
                          <Text style={styles.playerName}>{player.name}</Text>
                          <Text style={styles.playerStats}>
                            {player.joinedAt ? `Since ${formatDate(player.joinedAt)}` : ""} 
                            {player.sessionsAttended ? ` - ${player.sessionsAttended} sessions` : ""}
                          </Text>
                        </View>
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
                              {hasDebt ? `${relevantCredits}` : relevantCredits}
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
                            <Pressable 
                              onPress={() => handlePausePlayer(player.id)}
                              style={styles.playerActionItem}
                              disabled={isPausing}
                            >
                              {isPausing ? (
                                <ActivityIndicator size="small" color={Colors.dark.gold} />
                              ) : (
                                <>
                                  <Ionicons name="pause-circle-outline" size={18} color={Colors.dark.gold} />
                                  <Text style={[styles.playerActionText, { color: Colors.dark.gold }]}>Pause</Text>
                                </>
                              )}
                            </Pressable>
                            <Pressable 
                              onPress={() => handleRemovePlayer(player.id)}
                              style={styles.playerActionItem}
                              disabled={isRemoving}
                            >
                              {isRemoving ? (
                                <ActivityIndicator size="small" color={Colors.dark.error} />
                              ) : (
                                <>
                                  <Ionicons name="person-remove-outline" size={18} color={Colors.dark.error} />
                                  <Text style={[styles.playerActionText, { color: Colors.dark.error }]}>Remove</Text>
                                </>
                              )}
                            </Pressable>
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
                    {pausedPlayers.map((player) => (
                      <View key={player.id} style={[styles.playerRow, { opacity: 0.7 }]}>
                        <View style={[styles.playerAvatar, { backgroundColor: Colors.dark.gold + "30" }]}>
                          <Ionicons name="airplane-outline" size={16} color={Colors.dark.gold} />
                        </View>
                        <View style={styles.playerInfo}>
                          <Text style={styles.playerName}>{player.name}</Text>
                          <Text style={[styles.playerStats, { color: Colors.dark.gold }]}>
                            {player.pauseFrom && player.pauseUntil 
                              ? `${formatDate(player.pauseFrom)} - ${formatDate(player.pauseUntil)}`
                              : player.pauseReason || "On vacation"}
                          </Text>
                        </View>
                        <Pressable 
                          onPress={() => handleReactivatePlayer(player.id)}
                          style={styles.reactivateButton}
                        >
                          <Ionicons name="play-circle-outline" size={18} color={Colors.dark.successNeon} />
                          <Text style={styles.reactivateButtonText}>Reactivate</Text>
                        </Pressable>
                      </View>
                    ))}
                  </>
                ) : null}
                
                {formerPlayers.length > 0 ? (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>
                      Former Players ({formerPlayers.length})
                    </Text>
                    {formerPlayers.map((player) => (
                      <View key={player.id} style={[styles.playerRow, { opacity: 0.5 }]}>
                        <View style={[styles.playerAvatar, { backgroundColor: Colors.dark.backgroundTertiary }]}>
                          <Text style={[styles.playerInitial, { color: Colors.dark.textMuted }]}>
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
                    ))}
                  </>
                ) : null}
              </>
            );
          })()}
        </View>

        <View style={styles.deleteSeriesSection}>
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

    const sortedSessions = [...series.sessions].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return (
      <View style={styles.tabContent}>
        {sortedSessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No sessions scheduled yet</Text>
          </View>
        ) : (
          sortedSessions.map((session, index) => {
            const isCompleted = session.status === "completed";
            const isCancelled = session.status === "cancelled";
            const isSkipped = session.status === "skipped";
            const isPast = new Date(session.startTime) < new Date();
            const isToday = new Date(session.startTime).toDateString() === new Date().toDateString();
            const needsAttendance = isPast && !isCompleted && !isCancelled && !isSkipped;
            const canEditAttendance = isPast && !isCancelled && !isSkipped;

            const timelineContent = (
              <>
                <View style={styles.timelineConnector}>
                  <View
                    style={[
                      styles.timelineDot,
                      isCompleted && { backgroundColor: Colors.dark.successNeon },
                      (isCancelled || isSkipped) && { backgroundColor: Colors.dark.error },
                      isToday && !isCompleted && !isCancelled && { backgroundColor: accentColor },
                      !isPast && !isToday && { backgroundColor: Colors.dark.textMuted },
                      needsAttendance && { backgroundColor: Colors.dark.accentWarning },
                    ]}
                  />
                  {index < sortedSessions.length - 1 ? (
                    <View style={styles.timelineLine} />
                  ) : null}
                </View>
                <View style={[styles.timelineContent, canEditAttendance && styles.timelineContentClickable]}>
                  <View style={styles.timelineHeader}>
                    <Text
                      style={[
                        styles.timelineDate,
                        isToday && { color: accentColor, fontWeight: "700" },
                        needsAttendance && { color: Colors.dark.accentWarning },
                      ]}
                    >
                      {isToday ? "Today" : formatDate(session.startTime)}
                    </Text>
                    <View style={styles.timelineStatusRow}>
                      <Text
                        style={[
                          styles.timelineStatus,
                          isCompleted && { color: Colors.dark.successNeon },
                          (isCancelled || isSkipped) && { color: Colors.dark.error },
                          needsAttendance && { color: Colors.dark.accentWarning },
                        ]}
                      >
                        {isCompleted
                          ? "Completed"
                          : isCancelled || isSkipped
                          ? "Cancelled"
                          : isPast
                          ? "Needs Attendance"
                          : "Scheduled"}
                      </Text>
                      {canEditAttendance ? (
                        <Ionicons name="chevron-forward" size={16} color={isCompleted ? Colors.dark.successNeon : Colors.dark.accentWarning} />
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.timelineTime}>
                    Week {session.weekNumber || index + 1}
                  </Text>
                </View>
              </>
            );

            return canEditAttendance ? (
              <Pressable
                key={session.id}
                style={styles.timelineItem}
                onPress={() => handleSessionPress(session)}
              >
                {timelineContent}
              </Pressable>
            ) : (
              <View key={session.id} style={styles.timelineItem}>
                {timelineContent}
              </View>
            );
          })
        )}
      </View>
    );
  };

  const renderFeedbackTab = () => {
    if (feedbackLoading) {
      return (
        <View style={styles.tabContent}>
          <ActivityIndicator size="large" color={Colors.dark.successNeon} />
        </View>
      );
    }

    if (!feedbackData || feedbackData.summary.withFeedback === 0) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyState}>
            <Ionicons name="chatbubble-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No feedback recorded yet</Text>
            <Text style={styles.emptySubtext}>
              Complete sessions and add feedback to track progress
            </Text>
          </View>
        </View>
      );
    }

    const { summary, feedback } = feedbackData;

    return (
      <View style={styles.tabContent}>
        <View style={styles.feedbackSummary}>
          <View style={styles.feedbackStat}>
            <Text style={styles.feedbackStatValue}>{summary.withFeedback}</Text>
            <Text style={styles.feedbackStatLabel}>Sessions with Feedback</Text>
          </View>
          <View style={styles.feedbackStat}>
            <Text style={styles.feedbackStatValue}>{summary.total - summary.withFeedback}</Text>
            <Text style={styles.feedbackStatLabel}>Pending Feedback</Text>
          </View>
        </View>
        
        {Object.keys(summary.intensity).length > 0 ? (
          <View style={styles.intensityBreakdown}>
            <Text style={styles.sectionTitle}>Intensity Breakdown</Text>
            <View style={styles.intensityRow}>
              {Object.entries(summary.intensity).map(([level, count]) => (
                <View key={level} style={styles.intensityChip}>
                  <Ionicons 
                    name={level === "intense" ? "flame" : level === "normal" ? "fitness" : "leaf"} 
                    size={16} 
                    color={level === "intense" ? Colors.dark.error : level === "normal" ? Colors.dark.gold : Colors.dark.successNeon} 
                  />
                  <Text style={styles.intensityText}>{level}: {count}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Recent Feedback</Text>
        {feedback.slice(0, 5).map((fb) => (
          <View key={fb.id} style={styles.feedbackCard}>
            <View style={styles.feedbackHeader}>
              <Text style={styles.feedbackDate}>
                {fb.sessionDate ? formatDate(fb.sessionDate) : "Session"}
              </Text>
              {fb.intensity ? (
                <View style={[styles.intensityBadge, { backgroundColor: fb.intensity === "intense" ? Colors.dark.error + "20" : fb.intensity === "normal" ? Colors.dark.gold + "20" : Colors.dark.successNeon + "20" }]}>
                  <Text style={[styles.intensityBadgeText, { color: fb.intensity === "intense" ? Colors.dark.error : fb.intensity === "normal" ? Colors.dark.gold : Colors.dark.successNeon }]}>
                    {fb.intensity}
                  </Text>
                </View>
              ) : null}
            </View>
            {fb.coachNotes ? (
              <Text style={styles.feedbackNote} numberOfLines={2}>{fb.coachNotes}</Text>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  const renderProgressTab = () => {
    if (progressLoading) {
      return (
        <View style={styles.tabContent}>
          <ActivityIndicator size="large" color={Colors.dark.gold} />
        </View>
      );
    }

    if (!progressData || progressData.players.length === 0) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyState}>
            <Ionicons name="trending-up-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No progress data yet</Text>
            <Text style={styles.emptySubtext}>
              Complete sessions to track player XP gains
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        <View style={styles.progressSummary}>
          <View style={styles.progressStat}>
            <Text style={styles.progressStatValue}>{progressData.totalXp.toLocaleString()}</Text>
            <Text style={styles.progressStatLabel}>Total XP Earned</Text>
          </View>
          <View style={styles.progressStat}>
            <Text style={styles.progressStatValue}>{progressData.sessionsCompleted}/{progressData.totalSessions}</Text>
            <Text style={styles.progressStatLabel}>Sessions Complete</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Player Leaderboard</Text>
        {progressData.players.map((player, index) => (
          <View key={player.id} style={styles.playerProgressCard}>
            <View style={styles.playerRank}>
              <Text style={styles.rankNumber}>{index + 1}</Text>
            </View>
            <View style={styles.playerProgressInfo}>
              <Text style={styles.playerProgressName}>{player.name}</Text>
              <Text style={styles.playerProgressSessions}>{player.sessionsAttended} sessions</Text>
            </View>
            <View style={styles.playerXpBadge}>
              <Ionicons name="star" size={14} color={Colors.dark.gold} />
              <Text style={styles.playerXpValue}>{player.xpEarned.toLocaleString()}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

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
      default:
        return null;
    }
  };

  return (
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
                    {DAY_NAMES[series.dayOfWeek]}s at {formatTime(series.startTime)} - {series.sessionType.replace("_", " ")}
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
                {getPastSessionsSinceJoinDate().map((session) => (
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
                      <Text style={styles.attendanceWeek}>Week {session.weekNumber || "?"}</Text>
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
                    <Pressable
                      style={styles.createPackageButton}
                      onPress={() => setShowCreatePackageForm(true)}
                    >
                      <Ionicons name="add-circle-outline" size={20} color={Colors.dark.successNeon} />
                      <Text style={styles.createPackageButtonText}>Create New Package</Text>
                    </Pressable>
                    
                    {packageTemplates.length === 0 ? (
                      <View style={styles.emptyState}>
                        <Ionicons name="cube-outline" size={40} color={Colors.dark.textMuted} />
                        <Text style={styles.emptyText}>No packages available</Text>
                        <Text style={styles.emptySubtext}>Create one above or skip</Text>
                      </View>
                    ) : (
                      packageTemplates.map((template) => (
                        <Pressable
                          key={template.id}
                          style={[
                            styles.packageCard,
                            selectedPackageTemplateId === template.id && styles.packageCardSelected,
                          ]}
                          onPress={() => handleSelectPackage(template.id)}
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
                      ))
                    )}
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
                    filteredPlayers.map((player) => (
                      <Pressable
                        key={player.id}
                        style={styles.selectablePlayerRow}
                        onPress={() => handlePlayerSelect(player.id)}
                      >
                        <View style={[styles.playerAvatar, { backgroundColor: Colors.dark.successNeon + "30" }]}>
                          <Text style={[styles.playerInitial, { color: Colors.dark.successNeon }]}>
                            {player.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.playerInfo}>
                          <Text style={styles.playerName}>{player.name}</Text>
                          {player.ballLevel ? (
                            <Text style={styles.playerStats}>{player.ballLevel}</Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Attendance Modal */}
      <Modal
        visible={showAttendanceModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAttendanceModal(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowAttendanceModal(false)} />
          <View style={[styles.drawer, { paddingTop: Spacing.xl, paddingHorizontal: Spacing.lg }]}>
            <View style={styles.attendanceModalHeader}>
              <View>
                <Text style={styles.attendanceModalTitle}>Mark Attendance</Text>
                {selectedSession ? (
                  <Text style={styles.attendanceModalDate}>
                    {formatDate(selectedSession.startTime)} - Week {selectedSession.weekNumber || "?"}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => setShowAttendanceModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }}>
              {(() => {
                const sessionDate = selectedSession ? new Date(selectedSession.startTime) : new Date();
                // Filter players who had joined by the session date
                const activePlayers = (series?.players?.filter(p => p.status === "active") || []).filter(p => {
                  if (!p.joinedAt) return true; // No join date = show player
                  const joinDate = new Date(p.joinedAt);
                  return joinDate <= sessionDate;
                });
                const presentCount = Object.values(sessionAttendance).filter(s => s === "present").length;
                const sessionType = series?.sessionType || "group";
                
                let creditTypeHint = "";
                if (sessionType === "semi_private" || sessionType === "semi") {
                  if (presentCount === 1 && activePlayers.length >= 2) {
                    creditTypeHint = "Only 1 player present - will be charged as private lesson";
                  } else if (presentCount >= 2) {
                    creditTypeHint = "Semi-private credits will be charged";
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
                      <Text style={styles.creditHint}>{creditTypeHint}</Text>
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
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pause Player Modal */}
      <Modal
        visible={showPauseModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPauseModal(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowPauseModal(false)} />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <KeyboardAwareScrollViewCompat>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Pause Player</Text>
                <Pressable onPress={() => setShowPauseModal(false)} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={Colors.dark.text} />
                </Pressable>
              </View>
              
              <Text style={styles.modalSubtitle}>
                Player will not appear in sessions during this period
              </Text>

              <View style={styles.dateFieldsRow}>
                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>From Date</Text>
                  {Platform.OS === "web" ? (
                    <WebCalendarPicker
                      value={pauseFromDate}
                      onChange={(date) => {
                        setPauseFromDate(date);
                        if (pauseUntilDate < date) {
                          const newUntil = new Date(date);
                          newUntil.setDate(newUntil.getDate() + 7);
                          setPauseUntilDate(newUntil);
                        }
                      }}
                    />
                  ) : (
                    <>
                      <Pressable 
                        style={styles.dateButton} 
                        onPress={() => setShowPauseFromPicker(true)}
                      >
                        <Ionicons name="calendar-outline" size={18} color={Colors.dark.gold} />
                        <Text style={styles.dateButtonText}>
                          {pauseFromDate.toLocaleDateString()}
                        </Text>
                      </Pressable>
                      {showPauseFromPicker ? (
                        <DateTimePicker
                          value={pauseFromDate}
                          mode="date"
                          display="default"
                          onChange={(e, date) => {
                            setShowPauseFromPicker(false);
                            if (date) {
                              setPauseFromDate(date);
                              if (pauseUntilDate < date) {
                                const newUntil = new Date(date);
                                newUntil.setDate(newUntil.getDate() + 7);
                                setPauseUntilDate(newUntil);
                              }
                            }
                          }}
                        />
                      ) : null}
                    </>
                  )}
                </View>

                <View style={styles.dateField}>
                  <Text style={styles.fieldLabel}>Until Date</Text>
                  {Platform.OS === "web" ? (
                    <WebCalendarPicker
                      value={pauseUntilDate}
                      onChange={setPauseUntilDate}
                    />
                  ) : (
                    <>
                      <Pressable 
                        style={styles.dateButton} 
                        onPress={() => setShowPauseUntilPicker(true)}
                      >
                        <Ionicons name="calendar-outline" size={18} color={Colors.dark.gold} />
                        <Text style={styles.dateButtonText}>
                          {pauseUntilDate.toLocaleDateString()}
                        </Text>
                      </Pressable>
                      {showPauseUntilPicker ? (
                        <DateTimePicker
                          value={pauseUntilDate}
                          mode="date"
                          display="default"
                          minimumDate={pauseFromDate}
                          onChange={(e, date) => {
                            setShowPauseUntilPicker(false);
                            if (date) setPauseUntilDate(date);
                          }}
                        />
                      ) : null}
                    </>
                  )}
                </View>
              </View>

              {pauseUntilDate < pauseFromDate ? (
                <Text style={styles.dateValidationError}>
                  Until date must be on or after from date
                </Text>
              ) : null}

              <View style={styles.reasonField}>
                <Text style={styles.fieldLabel}>Reason (optional)</Text>
                <TextInput
                  style={styles.reasonInput}
                  placeholder="e.g., Family vacation, Injury..."
                  placeholderTextColor={Colors.dark.textMuted}
                  value={pauseReason}
                  onChangeText={setPauseReason}
                />
              </View>

              <View style={styles.modalActions}>
                <Pressable 
                  style={styles.cancelButton} 
                  onPress={() => setShowPauseModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable 
                  style={[
                    styles.confirmButton, 
                    styles.pauseConfirmButton,
                    pauseUntilDate < pauseFromDate && styles.confirmButtonDisabled
                  ]}
                  onPress={handleConfirmPause}
                  disabled={pausePlayerMutation.isPending || pauseUntilDate < pauseFromDate}
                >
                  {pausePlayerMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                  ) : (
                    <Text style={styles.confirmButtonText}>Pause Player</Text>
                  )}
                </Pressable>
              </View>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>

      {/* Remove Player Modal */}
      <Modal
        visible={showRemoveModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRemoveModal(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowRemoveModal(false)} />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Remove Player</Text>
              <Pressable onPress={() => setShowRemoveModal(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            
            <Text style={styles.modalSubtitle}>
              This will mark the player as a former player from the selected date
            </Text>

            <View style={styles.dateField}>
              <Text style={styles.fieldLabel}>Effective Date</Text>
              {Platform.OS === "web" ? (
                <WebCalendarPicker
                  value={removeDate}
                  onChange={setRemoveDate}
                />
              ) : (
                <>
                  <Pressable 
                    style={styles.dateButton} 
                    onPress={() => setShowRemoveDatePicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={18} color={Colors.dark.error} />
                    <Text style={styles.dateButtonText}>
                      {removeDate.toLocaleDateString()}
                    </Text>
                  </Pressable>
                  {showRemoveDatePicker ? (
                    <DateTimePicker
                      value={removeDate}
                      mode="date"
                      display="default"
                      onChange={(e, date) => {
                        setShowRemoveDatePicker(false);
                        if (date) setRemoveDate(date);
                      }}
                    />
                  ) : null}
                </>
              )}
            </View>

            <View style={styles.modalActions}>
              <Pressable 
                style={styles.cancelButton} 
                onPress={() => setShowRemoveModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.confirmButton, styles.removeConfirmButton]}
                onPress={handleConfirmRemove}
                disabled={removePlayerMutation.isPending}
              >
                {removePlayerMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.text} />
                ) : (
                  <Text style={styles.confirmButtonText}>Remove Player</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 1,
  },
  drawer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "90%",
    minHeight: "60%",
    zIndex: 2,
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.textMuted,
    borderRadius: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
  },
  header: {
    position: "relative",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  headerContent: {
    position: "relative",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
  },
  closeButton: {
    padding: Spacing.xs,
  },
  title: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
    marginHorizontal: Spacing.lg,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    position: "relative",
  },
  tabActive: {},
  tabLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  tabContent: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
  },
  statValue: {
    fontSize: Typography.h1.fontSize,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  statLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  infoSection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  infoText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    position: "relative",
    overflow: "visible",
    zIndex: 1,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
  },
  playerInitial: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  playerStats: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  creditBadge: {
    backgroundColor: Colors.dark.successNeon + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    minWidth: 28,
    alignItems: "center",
  },
  creditBadgeWarning: {
    backgroundColor: Colors.dark.accentWarning + "30",
  },
  creditBadgeDebt: {
    backgroundColor: Colors.dark.error + "30",
  },
  creditBadgeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.successNeon,
  },
  creditBadgeTextWarning: {
    color: Colors.dark.accentWarning,
  },
  creditBadgeTextDebt: {
    color: Colors.dark.error,
  },
  playerMenuButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  playerActionMenu: {
    position: "absolute",
    right: 0,
    top: 36,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
    padding: Spacing.xs,
    minWidth: 120,
    zIndex: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  playerActionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  playerActionText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
  },
  reactivateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.successNeon + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  reactivateButtonText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.successNeon,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyText: {
    fontSize: Typography.h4.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  timelineItem: {
    flexDirection: "row",
    marginBottom: Spacing.md,
  },
  timelineConnector: {
    width: 24,
    alignItems: "center",
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.dark.textMuted,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    marginTop: Spacing.xs,
  },
  timelineContent: {
    flex: 1,
    marginLeft: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  timelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timelineDate: {
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  timelineStatus: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  timelineTime: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  feedbackSummary: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  feedbackStat: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  feedbackStatValue: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.successNeon,
  },
  feedbackStatLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  intensityBreakdown: {
    marginBottom: Spacing.lg,
  },
  intensityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  intensityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  intensityText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.text,
    textTransform: "capitalize",
  },
  feedbackCard: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  feedbackHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  feedbackDate: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  intensityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  intensityBadgeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  feedbackNote: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  progressSummary: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  progressStat: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  progressStatValue: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  progressStatLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  playerProgressCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  playerRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.gold + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  rankNumber: {
    fontSize: Typography.small.fontSize,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  playerProgressInfo: {
    flex: 1,
  },
  playerProgressName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerProgressSessions: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  playerXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.gold + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  playerXpValue: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  // Add Player Modal styles
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  editMaxPlayersRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  maxPlayersInput: {
    width: 32,
    height: 28,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.successNeon,
    borderRadius: BorderRadius.sm,
    color: Colors.dark.text,
    textAlign: "center",
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    paddingHorizontal: 4,
    marginHorizontal: 2,
  },
  saveMaxPlayersBtn: {
    marginLeft: Spacing.sm,
    padding: 4,
  },
  cancelMaxPlayersBtn: {
    marginLeft: Spacing.xs,
    padding: 4,
  },
  editableTitle: {
    flexDirection: "row",
    alignItems: "center",
  },
  addPlayerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.successNeon + "20",
    borderRadius: BorderRadius.md,
  },
  addPlayerButtonText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.successNeon,
  },
  emptyAddButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.dark.successNeon + "50",
  },
  emptyAddText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.successNeon,
  },
  addPlayerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  addPlayerTitle: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  addPlayerContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.sm,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  playerList: {
    flex: 1,
  },
  noPlayersText: {
    textAlign: "center",
    color: Colors.dark.textMuted,
    paddingVertical: Spacing.xl,
  },
  selectablePlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  selectedPlayerName: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  dateLabel: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.successNeon + "30",
  },
  datePickerText: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  webDateInput: {
    flex: 1,
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.successNeon,
    padding: 0,
    marginLeft: Spacing.sm,
  },
  saveButton: {
    backgroundColor: Colors.dark.successNeon,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  backfillSubtitle: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  attendanceRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  attendanceRowSelected: {
    borderWidth: 1,
    borderColor: Colors.dark.successNeon,
  },
  attendanceCheck: {
    marginRight: Spacing.md,
  },
  attendanceInfo: {
    flex: 1,
  },
  attendanceDate: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  attendanceWeek: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  packageCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  packageCardSelected: {
    borderColor: Colors.dark.successNeon,
  },
  packageInfo: {
    flex: 1,
  },
  packageName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  packageDetails: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  packagePrice: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "700",
    color: Colors.dark.successNeon,
  },
  skipButton: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  skipButtonDisabled: {
    opacity: 0.5,
  },
  skipButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    textDecorationLine: "underline",
  },
  createPackageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.successNeon,
    borderStyle: "dashed",
    marginBottom: Spacing.lg,
  },
  createPackageButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.successNeon,
  },
  createPackageForm: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.successNeon,
  },
  createPackageTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  formField: {
    marginBottom: Spacing.md,
  },
  formRow: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  formLabel: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  formInput: {
    backgroundColor: Colors.dark.backgroundHighlight,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundLight,
  },
  totalPricePreview: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.successNeon,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  formActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  formCancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundLight,
  },
  formCancelButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  formSaveButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.successNeon,
  },
  formSaveButtonDisabled: {
    opacity: 0.5,
  },
  formSaveButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.backgroundRoot,
  },
  timelineContentClickable: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
  },
  timelineStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  attendanceModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  attendanceModalTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  attendanceModalDate: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
  },
  attendancePlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  attendancePlayerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  attendancePlayerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.successNeon + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  attendancePlayerInitial: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.successNeon,
  },
  attendancePlayerName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  attendanceToggle: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.xs,
  },
  attendanceToggleOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  attendanceToggleActive: {
    backgroundColor: Colors.dark.successNeon,
  },
  attendanceToggleAbsent: {
    backgroundColor: Colors.dark.error,
  },
  attendanceToggleVacation: {
    backgroundColor: Colors.dark.gold,
  },
  attendanceToggleText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  attendanceToggleTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  attendanceActions: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  cancelSessionButton: {
    backgroundColor: Colors.dark.error + "20",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.error,
  },
  cancelSessionButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.error,
  },
  creditHint: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.md,
  },
  deleteSeriesSection: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  deleteSeriesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.error + "15",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  deleteSeriesButtonDisabled: {
    opacity: 0.5,
  },
  deleteSeriesButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.error,
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  modalSubtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  dateFieldsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  dateField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
  },
  dateButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  reasonField: {
    marginBottom: Spacing.lg,
  },
  reasonInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
  },
  cancelButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  confirmButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  pauseConfirmButton: {
    backgroundColor: Colors.dark.gold,
  },
  removeConfirmButton: {
    backgroundColor: Colors.dark.error,
  },
  confirmButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.backgroundRoot,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  dateValidationError: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.error,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
});
