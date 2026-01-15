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

function isPlayerActiveForSession(player: Player, sessionDate: Date): boolean {
  if (!player.joinedAt) return true;
  
  const joinDate = new Date(player.joinedAt);
  if (joinDate > sessionDate) return false;
  
  if (player.leftAt) {
    const leftDate = new Date(player.leftAt);
    if (leftDate < sessionDate) return false;
  }
  
  if (player.pauseFrom) {
    const pauseStart = new Date(player.pauseFrom);
    if (sessionDate >= pauseStart) {
      if (!player.pauseUntil) {
        return false;
      }
      const pauseEnd = new Date(player.pauseUntil);
      if (sessionDate <= pauseEnd) return false;
    }
  }
  
  return true;
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
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoringSession, setRestoringSession] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionInstance | null>(null);
  const [sessionAttendance, setSessionAttendance] = useState<Record<string, "present" | "absent" | "vacation">>({});
  const [loadingAttendance, setLoadingAttendance] = useState(false);
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
  
  // Edit join date modal state
  const [showEditJoinDateModal, setShowEditJoinDateModal] = useState(false);
  const [editJoinDatePlayerId, setEditJoinDatePlayerId] = useState<string | null>(null);
  const [editJoinDate, setEditJoinDate] = useState<Date>(new Date());
  const [showEditJoinDatePicker, setShowEditJoinDatePicker] = useState(false);
  const [savingJoinDate, setSavingJoinDate] = useState(false);
  
  // Create package inline form state
  const [showCreatePackageForm, setShowCreatePackageForm] = useState(false);
  const [newPackageName, setNewPackageName] = useState("");
  const [newPackageCredits, setNewPackageCredits] = useState("");
  
  // Credit packages accordion state
  const [expandedCreditType, setExpandedCreditType] = useState<string | null>(null);
  const [selectedCreditPackage, setSelectedCreditPackage] = useState<{ creditType: string; credits: number; price: string } | null>(null);
  const [newPackagePricePerCredit, setNewPackagePricePerCredit] = useState("");

  const { data: series, isLoading } = useQuery<SeriesDetail>({
    queryKey: [`/api/coach/series/${seriesId}`],
    enabled: !!seriesId && visible,
  });

  // Build display title with local time (startTime is stored as UTC, convert to local)
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
      creditPackage?: { creditType: string; credits: number } | null;
    }) => {
      // Add player to class - backend handles package creation if templateId or creditPackage provided
      return apiRequest("POST", `/api/coach/series/${seriesId}/players`, {
        playerId: data.playerId,
        joinDate: data.joinDate,
        attendedSessionIds: data.attendedSessionIds,
        packageTemplateId: data.packageTemplateId,
        creditPackage: data.creditPackage,
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
      setSelectedCreditPackage(null);
      setExpandedCreditType(null);
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
      creditPackage: selectedCreditPackage ? {
        creditType: selectedCreditPackage.creditType,
        credits: selectedCreditPackage.credits,
      } : null,
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
    
    // Filter players who were active at the session date
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
            const canEditAttendance = isPast && !isSkipped;
            const canClick = canEditAttendance || isCancelled || isSkipped;

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
                <View style={[styles.timelineContent, canClick && styles.timelineContentClickable]}>
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
                      {canClick ? (
                        <Ionicons 
                          name="chevron-forward" 
                          size={16} 
                          color={
                            isCancelled || isSkipped 
                              ? Colors.dark.error 
                              : isCompleted 
                                ? Colors.dark.successNeon 
                                : Colors.dark.accentWarning
                          } 
                        />
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.timelineTime}>
                    Week {session.weekNumber || index + 1}
                  </Text>
                </View>
              </>
            );

            return canClick ? (
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                  <Text style={styles.attendanceModalTitle}>Mark Attendance</Text>
                  {loadingAttendance ? (
                    <ActivityIndicator size="small" color={Colors.dark.accentNeon} />
                  ) : null}
                </View>
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
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Restore Session Modal */}
      <Modal
        visible={showRestoreModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRestoreModal(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowRestoreModal(false)} />
          <View 
            style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Restore Session</Text>
              <Pressable onPress={() => setShowRestoreModal(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            
            {selectedSession ? (
              <View style={styles.restoreSessionContent}>
                <View style={styles.restoreSessionIcon}>
                  <LinearGradient
                    colors={[Colors.dark.accentCyan + "30", Colors.dark.accentCyan + "10"]}
                    style={styles.restoreIconGradient}
                  >
                    <Ionicons name="refresh" size={32} color={Colors.dark.accentCyan} />
                  </LinearGradient>
                </View>
                
                <Text style={styles.restoreSessionDate}>
                  {formatDate(selectedSession.startTime)}
                </Text>
                <Text style={styles.restoreSessionWeek}>
                  Week {selectedSession.weekNumber || "?"}
                </Text>
                
                <Text style={styles.restoreSessionDescription}>
                  This session was cancelled. Would you like to restore it so you can mark attendance?
                </Text>
                
                <Pressable
                  style={({ pressed }) => [
                    styles.restoreButton,
                    pressed && styles.restoreButtonPressed,
                    restoringSession && styles.saveButtonDisabled,
                  ]}
                  onPress={handleRestoreSession}
                  disabled={restoringSession}
                >
                  {restoringSession ? (
                    <ActivityIndicator size="small" color={Colors.dark.background} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color={Colors.dark.background} />
                      <Text style={styles.restoreButtonText}>Restore Session</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}
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
          <View 
            style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg, zIndex: 2 }]}
            onStartShouldSetResponderCapture={() => true}
            onResponderRelease={(e) => e.stopPropagation?.()}
          >
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

      {/* Edit Join Date Modal */}
      <Modal
        visible={showEditJoinDateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditJoinDateModal(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowEditJoinDateModal(false)} />
          <View 
            style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg, zIndex: 2 }]}
            onStartShouldSetResponder={() => true}
            onResponderRelease={(e) => e.stopPropagation?.()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Join Date</Text>
              <Pressable onPress={() => setShowEditJoinDateModal(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            
            <Text style={styles.modalSubtitle}>
              Change when this player joined the class. This affects which sessions they appear in for attendance.
            </Text>

            <View style={styles.dateField}>
              <Text style={styles.fieldLabel}>Join Date</Text>
              {Platform.OS === "web" ? (
                <WebCalendarPicker
                  value={editJoinDate}
                  onChange={setEditJoinDate}
                />
              ) : (
                <>
                  <Pressable 
                    style={styles.dateButton} 
                    onPress={() => setShowEditJoinDatePicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={18} color={Colors.dark.accentCyan} />
                    <Text style={styles.dateButtonText}>
                      {editJoinDate.toLocaleDateString()}
                    </Text>
                  </Pressable>
                  {showEditJoinDatePicker ? (
                    <DateTimePicker
                      value={editJoinDate}
                      mode="date"
                      display="default"
                      onChange={(e, date) => {
                        setShowEditJoinDatePicker(false);
                        if (date) setEditJoinDate(date);
                      }}
                    />
                  ) : null}
                </>
              )}
            </View>

            <View style={styles.modalActions}>
              <Pressable 
                style={styles.cancelButton} 
                onPress={() => setShowEditJoinDateModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={styles.confirmButton}
                onPress={handleSaveJoinDate}
                disabled={savingJoinDate}
              >
                {savingJoinDate ? (
                  <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                ) : (
                  <Text style={styles.confirmButtonText}>Save</Text>
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
    bottom: 40,
    minWidth: 180,
    zIndex: 100,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    shadowColor: Colors.dark.accentNeon,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  playerActionMenuGradient: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: Spacing.sm,
  },
  playerActionMenuHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  playerActionMenuTitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  playerActionDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    marginVertical: Spacing.xs,
  },
  playerActionIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  playerActionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  playerActionItemPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  playerActionItemDanger: {
    marginTop: Spacing.xs,
  },
  playerActionItemOld: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  playerActionText: {
    flex: 1,
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
  packageCardFlex: {
    flex: 1,
    marginBottom: 0,
  },
  templateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  templateDeleteButton: {
    padding: Spacing.md,
    backgroundColor: Colors.dark.error + "15",
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
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
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  createPackageButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.successNeon,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundHighlight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  infoBoxText: {
    flex: 1,
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    lineHeight: 18,
  },
  creditAccordion: {
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundLight,
  },
  creditAccordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  creditAccordionHeaderExpanded: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundLight,
  },
  creditAccordionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  creditTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  creditAccordionTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  creditAccordionSubtitle: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  creditOptionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  creditOption: {
    width: "48%",
    aspectRatio: 1.3,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  creditOptionSelected: {
    borderColor: Colors.dark.successNeon,
    backgroundColor: Colors.dark.successNeon + "15",
  },
  creditOptionCredits: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  creditOptionLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  creditOptionPrice: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.successNeon,
    marginTop: Spacing.xs,
  },
  creditOptionTextSelected: {
    color: Colors.dark.successNeon,
  },
  assignPackageButton: {
    backgroundColor: Colors.dark.successNeon,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  assignPackageButtonDisabled: {
    opacity: 0.5,
  },
  assignPackageButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.backgroundRoot,
  },
  templateSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundLight,
  },
  templateSectionTitle: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
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
  restoreSessionContent: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  restoreSessionIcon: {
    marginBottom: Spacing.lg,
  },
  restoreIconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.accentCyan + "40",
  },
  restoreSessionDate: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  restoreSessionWeek: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  restoreSessionDescription: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  restoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.accentCyan,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    minWidth: 200,
  },
  restoreButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  restoreButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.background,
  },
  creditHintBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  creditHintBoxPrivate: {
    borderColor: Colors.dark.sessionPrivate + "40",
    backgroundColor: Colors.dark.sessionPrivate + "10",
  },
  creditHintBoxSemi: {
    borderColor: Colors.dark.sessionSemiPrivate + "40",
    backgroundColor: Colors.dark.sessionSemiPrivate + "10",
  },
  creditHint: {
    fontSize: Typography.caption.fontSize,
    textAlign: "center",
  },
  creditHintPrivate: {
    color: Colors.dark.sessionPrivate,
  },
  creditHintSemi: {
    color: Colors.dark.sessionSemiPrivate,
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
  modalContentElevated: {
    position: "relative",
    zIndex: 10,
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
    backgroundColor: Colors.dark.successNeon,
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
