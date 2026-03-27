import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Image as RNImage,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

const TAB_BAR_HEIGHT = 80;
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import * as Linking from "expo-linking";
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
  withTiming,
  withSequence,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, FontSizes, getPlayerLevelColor, getPlayerLevelTextColor, GlowColors } from "@/constants/theme";
import { apiRequest, getStaticAssetsUrl, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { useCoach } from "@/coach/context/CoachContext";
import { convertUTCTimeToLocal, formatCredits } from "@/lib/dateUtils";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import PackagesCard from "@/coach/components/PackagesCard";
import CreateInvoiceModal from "@/admin/components/CreateInvoiceModal";
import QuickBaselineDrawer from "@/coach/components/QuickBaselineDrawer";
import { GuidedEmptyState } from "@/components/GuidedEmptyState";
import { PremiumBaselineFlow } from "@/coach/components/PremiumBaselineFlow";
import { DeepAssessmentDrawer } from "@/coach/components/DeepAssessmentDrawer";
import { PremiumAddPlayerFlow } from "@/coach/components/PremiumAddPlayerFlow";
import { useTabNavigation } from "@/components/TabNavigationContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const BALL_LEVELS = ["blue", "red", "orange", "green", "yellow", "glow"];

interface Player {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ballLevel: string | null;
  skillLevel: string | null;
  status: string | null;
  medicalNotes: string | null;
  lastLessonDate: string | null;
  createdAt: string;
  age?: number | null;
  height?: number | null;
  tshirtSize?: string | null;
  onboardingCompleted?: boolean;
  motivationType?: string | null;
  experienceLevel?: string | null;
  dominantHand?: string | null;
  enjoymentTags?: string[] | null;
  focusGoals?: string[] | null;
  selfConfidenceFlags?: string[] | null;
  profilePhotoUrl?: string | null;
  remainingCredits?: number;
  totalCredits?: number;
  creditsByType?: { private: number; group: number; semiPrivate: number };
  primaryCreditType?: string | null;
  auditVerifiedAt?: string | null;
  auditVerifiedBy?: string | null;
  activeGroupsCount?: number;
  pausedGroupsCount?: number;
  onHoliday?: boolean;
}

interface PlayerNote {
  id: string;
  playerId: string | null;
  coachId: string | null;
  content: string;
  category: string;
  isPinned: boolean;
  sessionId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface PlayerXpData {
  totalXp: number;
  transactions: { id: string; xpAmount: number; source: string; description: string | null; createdAt: string }[];
}

// Level progression thresholds (XP required for each level)
const LEVEL_THRESHOLDS = {
  red: { xpRequired: 0, nextLevel: "orange", xpForNext: 500 },
  orange: { xpRequired: 500, nextLevel: "green", xpForNext: 1500 },
  green: { xpRequired: 1500, nextLevel: "yellow", xpForNext: 3500 },
  yellow: { xpRequired: 3500, nextLevel: "glow", xpForNext: 7000 },
  glow: { xpRequired: 7000, nextLevel: null, xpForNext: null },
};

type LevelReadiness = {
  nextLevel: string;
  progress: number;
  xpRemaining: number;
  xpInLevel: number;
  xpNeeded: number;
} | null;

const getLevelReadiness = (currentLevel: string | null, totalXp: number): LevelReadiness => {
  if (!currentLevel) return null;
  const levelData = LEVEL_THRESHOLDS[currentLevel.toLowerCase() as keyof typeof LEVEL_THRESHOLDS];
  // Return null for max level (Glow) or invalid level - no progress card needed
  if (!levelData || !levelData.nextLevel || !levelData.xpForNext) return null;
  
  const xpInLevel = totalXp - levelData.xpRequired;
  const xpNeeded = levelData.xpForNext - levelData.xpRequired;
  const progress = Math.min(100, Math.max(0, (xpInLevel / xpNeeded) * 100));
  const xpRemaining = Math.max(0, levelData.xpForNext - totalXp);
  
  return {
    nextLevel: levelData.nextLevel,
    progress,
    xpRemaining,
    xpInLevel,
    xpNeeded,
  };
};

const NOTE_CATEGORIES = [
  { value: "technique", label: "Technique", icon: "fitness-outline" as const },
  { value: "mental", label: "Mental", icon: "bulb-outline" as const },
  { value: "physical", label: "Physical", icon: "body-outline" as const },
  { value: "next-lesson", label: "Next Lesson", icon: "arrow-forward-outline" as const },
  { value: "general", label: "General", icon: "document-text-outline" as const },
];

import { styles } from "./playersStyles";
export function PlayerDetailView({
  player,
  onBack,
  insets,
}: {
  player: Player;
  onBack: () => void;
  insets: { top: number; bottom: number };
}) {
  const { coach, academy } = useCoach();
  const queryClient = useQueryClient();
  const tz = academy?.timezone || "Asia/Dubai";
  
  const tabBarHeight = TAB_BAR_HEIGHT;
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState("general");
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [isExportingAttendanceReport, setIsExportingAttendanceReport] = useState(false);
  const [isSharingAttendanceLink, setIsSharingAttendanceLink] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [expandedSeriesIds, setExpandedSeriesIds] = useState<Set<string>>(new Set());
  const [pillarProgressExpanded, setPillarProgressExpanded] = useState(false);
  const [showDeepAssessment, setShowDeepAssessment] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState<AttendanceHistoryRecord | null>(null);
  const [isUpdatingAttendance, setIsUpdatingAttendance] = useState(false);

  const [showEditPlayer, setShowEditPlayer] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [editName, setEditName] = useState(player.name);
  const [editEmail, setEditEmail] = useState(player.email ?? "");
  const [editPhone, setEditPhone] = useState(player.phone ?? "");
  const [editBallLevel, setEditBallLevel] = useState(player.ballLevel ?? "");


  const [localPlayer, setLocalPlayer] = useState(player);

  useEffect(() => {
    setLocalPlayer(player);
  }, [player]);

  const deletePlayerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/players/${player.id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete player");
      }
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.setQueryData<Player[]>(["/api/players?withCredits=true"], (old) =>
        old?.filter((p) => p.id !== player.id)
      );
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/players-without-baseline"] });
      onBack();
    },
    onError: (error: Error) => {
      setTimeout(() => {
        Alert.alert("Error", error.message || "Failed to delete player");
      }, 350);
    },
  });

  const handleDeletePlayer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "Delete Player",
      `This will permanently remove ${localPlayer.name} and all their data from your academy. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deletePlayerMutation.mutate(),
        },
      ]
    );
  };

  const updatePlayerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/players/${player.id}`, {
        name: editName.trim(),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        ballLevel: editBallLevel || null,
      });
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLocalPlayer((prev) => ({
        ...prev,
        name: editName.trim(),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        ballLevel: editBallLevel || null,
      }));
      queryClient.setQueryData<Player[]>(["/api/players?withCredits=true"], (old) =>
        old?.map((p) =>
          p.id === player.id
            ? { ...p, name: editName.trim(), email: editEmail.trim() || null, phone: editPhone.trim() || null, ballLevel: editBallLevel || null }
            : p
        )
      );
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      setShowEditPlayer(false);
      setTimeout(() => {
        Alert.alert("Saved", "Player details updated.");
      }, 300);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to update player");
    },
  });

  const sendInviteEmailMutation = useMutation<
    { success: boolean; sent: boolean; sentTo?: string; reason?: string },
    Error
  >({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/players/${player.id}/send-invite-email`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.sent) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => {
          Alert.alert("Invite Sent", `Invite email sent to ${data.sentTo}`);
        }, 350);
      } else {
        const msg =
          data.reason === "no_email"
            ? "This player has no email address."
            : "This player has already accepted their invite.";
        setTimeout(() => {
          Alert.alert("Not Sent", msg);
        }, 350);
      }
    },
    onError: (error: Error) => {
      setTimeout(() => {
        Alert.alert("Failed", error.message || "Could not send invite. Try again.");
      }, 350);
    },
  });

  const [localAuditVerified, setLocalAuditVerified] = useState<boolean>(!!player.auditVerifiedAt);
  const [verifyFlashText, setVerifyFlashText] = useState<string | null>(null);
  const verifyFlashOpacity = useSharedValue(0);
  const verifyButtonScale = useSharedValue(1);

  const verifyFlashStyle = useAnimatedStyle(() => ({
    opacity: verifyFlashOpacity.value,
    transform: [{ translateY: interpolate(verifyFlashOpacity.value, [0, 1], [8, 0]) }],
  }));

  const verifyButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: verifyButtonScale.value }],
  }));

  const auditVerifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/players/${player.id}/audit-verify`);
      return res.json();
    },
    onSuccess: (data: any) => {
      setLocalAuditVerified(data.auditVerified);
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      verifyButtonScale.value = withSequence(
        withSpring(1.3, { damping: 8 }),
        withSpring(1, { damping: 12 })
      );
      setVerifyFlashText(data.auditVerified ? "Verified" : "Unverified");
      verifyFlashOpacity.value = withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(1, { duration: 1200 }),
        withTiming(0, { duration: 400 })
      );
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setVerifyFlashText("Error");
      verifyFlashOpacity.value = withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(1, { duration: 1000 }),
        withTiming(0, { duration: 400 })
      );
      console.error("[AuditVerify] Error:", error);
    },
  });

  const handleExportProgressReport = async () => {
    try {
      setIsExportingReport(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const response = await fetch(new URL(`/api/players/${player.id}/progress-report`, getApiUrl()).toString(), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate progress report");
      }
      
      const html = await response.text();
      
      const safeName = player.name.replace(/[^a-zA-Z0-9]/g, "_");
      if (Platform.OS === "web") {
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeName}_Progress_Report.html`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const newUri = `${FileSystem.cacheDirectory}${safeName}_Progress_Report_${Date.now()}.pdf`;
        await FileSystem.moveAsync({ from: uri, to: newUri });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(newUri, {
            mimeType: "application/pdf",
            dialogTitle: `${player.name} Progress Report`,
            UTI: "com.adobe.pdf",
          });
        } else {
          await Print.printAsync({ uri: newUri });
        }
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error exporting progress report:", error);
      Alert.alert("Error", "Failed to generate progress report. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsExportingReport(false);
    }
  };

  const handleExportAttendanceReport = async () => {
    try {
      setIsExportingAttendanceReport(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const response = await fetch(new URL(`/api/players/${player.id}/attendance-report`, getApiUrl()).toString(), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate attendance report");
      }
      
      const html = await response.text();
      
      const safeName = player.name.replace(/[^a-zA-Z0-9]/g, "_");
      if (Platform.OS === "web") {
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeName}_Attendance_Report.html`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const newUri = `${FileSystem.cacheDirectory}${safeName}_Attendance_Report_${Date.now()}.pdf`;
        await FileSystem.moveAsync({ from: uri, to: newUri });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(newUri, {
            mimeType: "application/pdf",
            dialogTitle: `${player.name} Attendance Report`,
            UTI: "com.adobe.pdf",
          });
        } else {
          await Print.printAsync({ uri: newUri });
        }
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error exporting attendance report:", error);
      Alert.alert("Error", "Failed to generate attendance report. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsExportingAttendanceReport(false);
    }
  };

  const handleShareAttendanceLink = async () => {
    try {
      setIsSharingAttendanceLink(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const response = await fetch(
        new URL(`/api/players/${player.id}/attendance-share-token`, getApiUrl()).toString(),
        { method: "POST", credentials: "include", headers: getAuthHeaders() },
      );

      if (!response.ok) throw new Error("Failed to generate share link");

      const { shareUrl } = await response.json();

      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(shareUrl);
        Alert.alert("Link Copied", "Attendance link copied to clipboard. Share it with the player or parent.");
      } else {
        const { Share } = await import("react-native");
        await Share.share({
          message: `${player.name}'s attendance report: ${shareUrl}`,
          url: shareUrl,
          title: `${player.name} Attendance`,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error sharing attendance link:", error);
      Alert.alert("Error", "Failed to generate share link. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSharingAttendanceLink(false);
    }
  };

  const [isSendingMonthlyReport, setIsSendingMonthlyReport] = useState(false);

  const handleSendMonthlyReport = async () => {
    try {
      setIsSendingMonthlyReport(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const response = await fetch(new URL(`/api/player/${player.id}/monthly-report`, getApiUrl()).toString(), {
        method: "POST",
        credentials: "include",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}), // Uses previous month by default
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to send monthly report");
      }
      
      Alert.alert(
        "Monthly Report Sent",
        `${data.month} report has been emailed to this player.`,
        [{ text: "OK" }]
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error("Error sending monthly report:", error);
      Alert.alert("Error", error.message || "Failed to send monthly report. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSendingMonthlyReport(false);
    }
  };

  const { data: notes = [], isLoading: notesLoading } = useQuery<PlayerNote[]>({
    queryKey: [`/api/players/${player.id}/notes`],
  });

  const { data: xpData } = useQuery<PlayerXpData>({
    queryKey: [`/api/players/${player.id}/xp`],
  });

  interface PlayerStatsPayments {
    totalOwed: number;
    totalPaid: number;
    lastPaymentDate?: string;
    status: "paid" | "partial" | "overdue";
    currency: string;
    invoices?: {
      id: string;
      invoiceNumber: string;
      amount: number;
      currency: string;
      status: string;
      dueDate?: string;
      paidAt?: string;
      createdAt?: string;
      notes?: string;
      isOverdue: boolean;
    }[];
  }
  interface PlayerStatsData {
    player: {
      id: string;
      name: string;
      email?: string;
      phone?: string;
      parentName?: string;
      parentPhone?: string;
    };
    payments: PlayerStatsPayments;
    packages?: {
      id: string;
      creditType: string;
      totalCredits: number;
      remainingCredits: number;
      status: string;
      isPaid?: boolean;
      price?: number;
      packageName?: string;
    }[];
  }
  const { data: playerStats } = useQuery<PlayerStatsData>({
    queryKey: ["/api/admin/players", player.id, "stats"],
  });

  const { data: inviteData } = useQuery<{ inviteCode: string; status: string } | null>({
    queryKey: ["/api/players", player.id, "invite"],
    enabled: !!localPlayer.email,
    retry: false,
  });
  const isInvitePending = inviteData?.status === "pending";

  const getPaymentStatusColor = (status?: string) => {
    switch (status) {
      case "paid": return Colors.dark.successNeon;
      case "partial": return Colors.dark.orange;
      case "overdue": return Colors.dark.error;
      default: return Colors.dark.textMuted;
    }
  };

  // Fetch baseline status
  interface BaselineData {
    id: string;
    playerId: string;
    status: string;
    ballLevel: string | null;
    skillLevel: number | null;
    createdAt: string;
    lockedAt: string | null;
  }
  const { data: baselineData } = useQuery<BaselineData>({
    queryKey: [`/api/players/${player.id}/baseline`],
  });
  const [showResetBaselineConfirm, setShowResetBaselineConfirm] = useState(false);

  const resetBaselineMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/players/${player.id}/baseline`);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/baseline`] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/players-without-baseline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/baseline-stats"] });
      setShowResetBaselineConfirm(false);
    },
    onError: () => {
      Alert.alert("Error", "Failed to reset baseline. Please try again.");
    },
  });

  // Fetch pillar progress for Glow Leveling OS
  interface PillarProgressData {
    pillars: Array<{
      name: string;
      score: number;
      trend: string;
      skillsTotal: number;
      skillsMeetsOrAbove: number;
      lastUpdated: string | null;
    }>;
    overallReadiness: number;
    trialGateReady: boolean;
    recentFeedbackCount: number;
  }
  const { data: pillarProgress } = useQuery<PillarProgressData>({
    queryKey: [`/api/players/${player.id}/pillar-progress`],
  });

  // Fetch attendance summary
  interface AttendanceSummary {
    totalLessons: number;
    attendedCount: number;
    actuallyAttendedCount: number;
    presentCount: number;
    absentCount: number;
    attendancePercentage: number;
  }
  const { data: attendanceSummary } = useQuery<AttendanceSummary>({
    queryKey: [`/api/coach/players/${player.id}/attendance-summary`],
  });

  // Fetch full attendance history with series summaries
  const { data: attendanceData } = useQuery<AttendanceHistoryResponse>({
    queryKey: [`/api/coach/players/${player.id}/attendance-history`],
  });
  const attendanceHistory = attendanceData?.history || [];
  const seriesAttendanceSummaries = attendanceData?.seriesSummaries || [];

  // Fetch stroke feedback timeline for this player
  interface StrokeFeedbackEntry {
    id: string;
    sessionId: string;
    strokeFeedback: { stroke: string; rating: number; note?: string }[] | null;
    lessonIntensity: string | null;
    playerNote: string | null;
    overall: string;
    effort: number;
    createdAt: string;
  }
  const { data: strokeFeedbackData = [] } = useQuery<StrokeFeedbackEntry[]>({
    queryKey: [`/api/glow/players/${player.id}/stroke-feedback`],
  });
  const [strokeTimelineExpanded, setStrokeTimelineExpanded] = useState(false);

  // Format attendance date for display
  const formatAttendanceDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: tz });
  };

  // Format time for attendance history (ISO string to HH:MM)
  const formatAttendanceTime = (timeStr: string | null) => {
    if (!timeStr) return "";
    try {
      const d = new Date(timeStr);
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
    } catch {
      return "";
    }
  };

  // Convert UTC time string (HH:MM) to local academy timezone
  const formatSeriesTime = (utcTime: string) => {
    return convertUTCTimeToLocal(utcTime, tz);
  };

  // Calculate level readiness (returns null for max level or invalid level)
  const levelReadiness = getLevelReadiness(localPlayer.ballLevel, xpData?.totalXp || 0);

  const addNoteMutation = useMutation({
    mutationFn: async (data: { content: string; category: string }) => {
      return apiRequest("POST", `/api/players/${player.id}/notes`, {
        ...data,
        coachId: coach?.id,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/notes`] });
      setNewNoteContent("");
      setNewNoteCategory("general");
      setShowAddNote(false);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to save note");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/players/${player.id}/notes/${noteId}`);
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/notes`] });
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ noteId, isPinned }: { noteId: string; isPinned: boolean }) => {
      return apiRequest("PATCH", `/api/players/${player.id}/notes/${noteId}/pin`, { isPinned });
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/notes`] });
    },
  });

  const updateAttendanceMutation = useMutation({
    mutationFn: async ({ sessionId, newStatus }: { sessionId: string; newStatus: string }) => {
      const response = await fetch(
        new URL(`/api/coach/players/${player.id}/sessions/${sessionId}/attendance`, getApiUrl()).toString(),
        {
          method: "PATCH",
          credentials: "include",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ newStatus }),
        }
      );
      if (!response.ok) throw new Error("Failed to update attendance");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/players/${player.id}/attendance-history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/coach/players/${player.id}/attendance-summary`] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/credit-balance`] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingAttendance(null);
      setIsUpdatingAttendance(false);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsUpdatingAttendance(false);
      Alert.alert("Error", "Failed to update attendance");
    },
  });

  const handleAddNote = () => {
    if (!newNoteContent.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addNoteMutation.mutate({ content: newNoteContent.trim(), category: newNoteCategory });
  };

  const handleDeleteNote = (noteId: string) => {
    Alert.alert("Delete Note", "Are you sure you want to delete this note?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteNoteMutation.mutate(noteId) },
    ]);
  };

  const getCategoryInfo = (category: string | null) => {
    return NOTE_CATEGORIES.find(c => c.value === category) || NOTE_CATEGORIES[4];
  };

  const formatNoteDate = (date: string | null) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const pinnedNotes = notes.filter(n => n.isPinned);
  const regularNotes = notes.filter(n => !n.isPinned);
  const nextLessonNotes = notes.filter(n => n.category === "next-lesson");

  const displayedHistory = showAllHistory ? attendanceHistory : attendanceHistory.slice(0, 5);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      {/* Premium Header */}
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={styles.premiumDetailHeader}
      >
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.premiumHeaderTopLine}
        />
        <View style={styles.premiumHeaderNav}>
          <Pressable style={styles.premiumBackButton} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
          </Pressable>
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <Pressable
              style={styles.premiumExportButton}
              onPress={handleDeletePlayer}
              disabled={deletePlayerMutation.isPending}
            >
              {deletePlayerMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.error} />
              ) : (
                <Ionicons name="trash-outline" size={20} color={Colors.dark.error} />
              )}
            </Pressable>
            <Pressable
              style={styles.premiumExportButton}
              onPress={() => {
                setEditName(localPlayer.name);
                setEditEmail(localPlayer.email ?? "");
                setEditPhone(localPlayer.phone ?? "");
                setEditBallLevel(localPlayer.ballLevel ?? "");
                setShowEditPlayer(true);
              }}
            >
              <Ionicons name="pencil-outline" size={22} color={Colors.dark.tabIconDefault} />
            </Pressable>
            <View style={{ alignItems: "center" }}>
              <Animated.View style={verifyButtonAnimStyle}>
                <Pressable 
                  style={[
                    styles.premiumExportButton,
                    localAuditVerified ? { backgroundColor: Colors.dark.primary + "30", borderColor: Colors.dark.primary, borderWidth: 1 } : null,
                  ]} 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    auditVerifyMutation.mutate();
                  }}
                  disabled={auditVerifyMutation.isPending}
                >
                  {auditVerifyMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.primary} />
                  ) : (
                    <Ionicons 
                      name={localAuditVerified ? "checkmark-circle" : "checkmark-circle-outline"} 
                      size={22} 
                      color={localAuditVerified ? Colors.dark.primary : Colors.dark.tabIconDefault} 
                    />
                  )}
                </Pressable>
              </Animated.View>
              {verifyFlashText ? (
                <Animated.Text style={[{
                  position: "absolute",
                  top: 44,
                  fontSize: 11,
                  fontWeight: "700",
                  color: verifyFlashText === "Error" ? Colors.dark.error : 
                         verifyFlashText === "Unverified" ? Colors.dark.warning : Colors.dark.primary,
                  textAlign: "center",
                  width: 80,
                }, verifyFlashStyle]}>
                  {verifyFlashText}
                </Animated.Text>
              ) : null}
            </View>
            <Pressable 
              style={styles.premiumExportButton} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowDeepAssessment(true);
              }}
            >
              <Ionicons name="analytics" size={22} color={Colors.dark.xpCyan} />
            </Pressable>
            <Pressable 
              style={styles.premiumExportButton} 
              onPress={handleExportProgressReport}
              disabled={isExportingReport}
            >
              {isExportingReport ? (
                <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
              ) : (
                <Ionicons name="document-text-outline" size={22} color={Colors.dark.xpCyan} />
              )}
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.detailContent}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl, paddingTop: Spacing.md }}
        showsVerticalScrollIndicator={false}
      >
        {/* Premium Profile Card */}
        <View style={styles.premiumProfileCard}>
          <View style={styles.premiumAvatarContainer}>
            <LinearGradient
              colors={[getPlayerLevelColor(localPlayer.ballLevel ?? "green"), Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.premiumAvatarGlow}
            />
            {localPlayer.profilePhotoUrl ? (
              Platform.OS === 'web' ? (
                <RNImage
                  source={{ uri: `${getStaticAssetsUrl()}${localPlayer.profilePhotoUrl}` }}
                  style={styles.premiumAvatarPhoto}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={{ uri: `${getStaticAssetsUrl()}${localPlayer.profilePhotoUrl}` }}
                  style={styles.premiumAvatarPhoto}
                  contentFit="cover"
                />
              )
            ) : (
              <View style={[styles.premiumAvatar, { backgroundColor: getPlayerLevelColor(localPlayer.ballLevel ?? "green") + "30" }]}>
                <Text style={[styles.premiumInitial, { color: getPlayerLevelTextColor(localPlayer.ballLevel ?? "green") }]}>{localPlayer.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          
          <View style={styles.premiumProfileInfo}>
            <Text style={styles.premiumProfileName}>{localPlayer.name}</Text>
            {localPlayer.ballLevel ? (
              <View style={styles.premiumLevelBadge}>
                <View style={[styles.premiumLevelDot, { backgroundColor: getPlayerLevelColor(localPlayer.ballLevel) }]} />
                <Text style={styles.premiumLevelText}>
                  {localPlayer.ballLevel.charAt(0).toUpperCase() + localPlayer.ballLevel.slice(1)} Ball
                </Text>
              </View>
            ) : null}
            {xpData ? (
              <View style={styles.premiumXpBadge}>
                <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
                <Text style={styles.premiumXpText}>{xpData.totalXp} XP</Text>
              </View>
            ) : null}
          </View>

          {/* Quick Stats Row */}
          <View style={styles.premiumQuickStats}>
            <View style={styles.premiumQuickStat}>
              <Text style={styles.premiumQuickStatValue}>{attendanceSummary?.totalLessons ?? 0}</Text>
              <Text style={styles.premiumQuickStatLabel}>Sessions</Text>
            </View>
            <View style={styles.premiumQuickStatDivider} />
            <View style={styles.premiumQuickStat}>
              <Text style={[styles.premiumQuickStatValue, { color: Colors.dark.primary }]}>
                {attendanceSummary?.attendancePercentage ?? 0}%
              </Text>
              <Text style={styles.premiumQuickStatLabel}>Attendance</Text>
            </View>
          </View>
        </View>

        {pillarProgress ? (
          <View style={styles.levelReadinessCard}>
            <Pressable onPress={() => setPillarProgressExpanded(!pillarProgressExpanded)} style={styles.levelReadinessHeader}>
              <View style={[styles.levelReadinessIcon, { backgroundColor: Colors.dark.xpCyan + "25", borderColor: Colors.dark.xpCyan + "40" }]}>
                <Ionicons name="stats-chart" size={18} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.levelReadinessTitle}>Pillar Progress</Text>
              {pillarProgress.trialGateReady ? (
                <View style={[styles.xpBadge, { backgroundColor: Colors.dark.primary + "30" }]}>
                  <Ionicons name="trophy" size={12} color={Colors.dark.primary} />
                  <Text style={[styles.xpBadgeText, { color: Colors.dark.primary }]}>Trial Ready</Text>
                </View>
              ) : xpData ? (
                <View style={styles.xpBadge}>
                  <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
                  <Text style={styles.xpBadgeText}>{xpData.totalXp} XP</Text>
                </View>
              ) : null}
              <Ionicons name={pillarProgressExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.dark.tabIconDefault} style={{ marginLeft: 4 }} />
            </Pressable>
            
            {pillarProgressExpanded ? <><View style={styles.pillarGrid}>
              {pillarProgress.pillars.map((pillar) => {
                const pillarColors: Record<string, string> = {
                  TECHNIQUE: Colors.dark.sessionPrivate,
                  TACTICAL: Colors.dark.xpCyan,
                  PHYSICAL: Colors.dark.gold,
                  MENTAL: Colors.dark.sessionSemiPrivate,
                  SOCIAL: Colors.dark.primary,
                  MATCH: Colors.dark.error,
                };
                const pillarIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
                  TECHNIQUE: "tennisball",
                  TACTICAL: "bulb",
                  PHYSICAL: "fitness",
                  MENTAL: "flash-outline",
                  SOCIAL: "people",
                  MATCH: "trophy",
                };
                const color = pillarColors[pillar.name] || Colors.dark.primary;
                const icon: keyof typeof Ionicons.glyphMap = pillarIcons[pillar.name] || "ellipse";
                const progressPercent = Math.round((pillar.score / 2) * 100);
                const trendIcon: keyof typeof Ionicons.glyphMap = pillar.trend === "improving" ? "trending-up" : 
                                  pillar.trend === "declining" ? "trending-down" : "remove";
                const trendColor = pillar.trend === "improving" ? Colors.dark.primary : 
                                   pillar.trend === "declining" ? Colors.dark.error : Colors.dark.tabIconDefault;
                
                return (
                  <View key={pillar.name} style={styles.pillarItem}>
                    <View style={[styles.pillarIconContainer, { backgroundColor: color + "20" }]}>
                      <Ionicons name={icon} size={14} color={color} />
                    </View>
                    <View style={styles.pillarInfo}>
                      <View style={styles.pillarNameRow}>
                        <Text style={styles.pillarName}>{pillar.name.charAt(0) + pillar.name.slice(1).toLowerCase()}</Text>
                        <Ionicons name={trendIcon} size={12} color={trendColor} />
                      </View>
                      <View style={styles.pillarProgressBar}>
                        <View style={[styles.pillarProgressFill, { width: `${progressPercent}%`, backgroundColor: color }]} />
                      </View>
                    </View>
                    <Text style={[styles.pillarPercent, { color }]}>{progressPercent}%</Text>
                  </View>
                );
              })}
            </View>
            
            {pillarProgress.recentFeedbackCount > 0 ? (
              <View style={styles.feedbackSummaryRow}>
                <Ionicons name="chatbubble-outline" size={12} color={Colors.dark.tabIconDefault} />
                <Text style={styles.feedbackSummaryText}>
                  {pillarProgress.recentFeedbackCount} feedback{pillarProgress.recentFeedbackCount !== 1 ? "s" : ""} last 30 days
                </Text>
              </View>
            ) : null}
            </> : null}
          </View>
        ) : null}

        <PackagesCard playerId={player.id} playerName={localPlayer.name} />

        {/* Payments Section */}
        {playerStats?.payments ? (
          <View style={styles.paymentsSection}>
            <Text style={styles.paymentsSectionTitle}>Payments</Text>
            <View style={styles.paymentsSummary}>
              <View style={[
                styles.paymentsStatusBadge, 
                { backgroundColor: `${getPaymentStatusColor(playerStats.payments.status)}20` }
              ]}>
                <Text style={[styles.paymentsStatusText, { color: getPaymentStatusColor(playerStats.payments.status) }]}>
                  {playerStats.payments.status?.toUpperCase() || "N/A"}
                </Text>
              </View>
            </View>
            <View style={styles.paymentsFinanceRow}>
              <Text style={styles.paymentsFinanceLabel}>Total Owed</Text>
              <Text style={[styles.paymentsFinanceValue, { color: Colors.dark.error }]}>
                {playerStats.payments.currency} {playerStats.payments.totalOwed}
              </Text>
            </View>
            <View style={styles.paymentsFinanceRow}>
              <Text style={styles.paymentsFinanceLabel}>Total Paid</Text>
              <Text style={[styles.paymentsFinanceValue, { color: Colors.dark.successNeon }]}>
                {playerStats.payments.currency} {playerStats.payments.totalPaid}
              </Text>
            </View>
            {playerStats.payments.lastPaymentDate ? (
              <View style={styles.paymentsFinanceRow}>
                <Text style={styles.paymentsFinanceLabel}>Last Payment</Text>
                <Text style={styles.paymentsFinanceValue}>{playerStats.payments.lastPaymentDate}</Text>
              </View>
            ) : null}
            <View style={styles.paymentsActions}>
              <Pressable 
                style={styles.paymentsRecordButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowRecordPaymentModal(true);
                }}
              >
                <Ionicons name="card-outline" size={16} color="#000" />
                <Text style={styles.paymentsRecordText}>Record Payment</Text>
              </Pressable>
              <Pressable 
                style={styles.paymentsCreateInvoiceButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowInvoiceModal(true);
                }}
              >
                <Ionicons name="document-text-outline" size={16} color={Colors.dark.successNeon} />
                <Text style={styles.paymentsCreateInvoiceText}>Create Invoice</Text>
              </Pressable>
            </View>

            {playerStats.payments.invoices && playerStats.payments.invoices.length > 0 ? (
              <View style={{ marginTop: Spacing.md }}>
                <Text style={{ ...Typography.caption, color: Colors.dark.textMuted, fontWeight: "700" as const, letterSpacing: 1, marginBottom: Spacing.sm }}>
                  INVOICES ({playerStats.payments.invoices.length})
                </Text>
                {playerStats.payments.invoices.map((inv: any) => {
                  const isOverdue = inv.isOverdue;
                  const isPaid = inv.status === "paid";
                  const statusColor = isPaid ? Colors.dark.successNeon : isOverdue ? Colors.dark.error : "#FFD700";
                  const statusLabel = isPaid ? "PAID" : isOverdue ? "OVERDUE" : "PENDING";
                  return (
                    <View key={inv.id} style={{
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderRadius: BorderRadius.sm,
                      padding: Spacing.sm,
                      marginBottom: 6,
                      borderLeftWidth: 3,
                      borderLeftColor: statusColor,
                    }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, color: Colors.dark.text, fontWeight: "600" as const }}>
                            #{inv.invoiceNumber}
                          </Text>
                          <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginTop: 2 }}>
                            Due: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "No date"}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 15, fontWeight: "700" as const, color: statusColor }}>
                          {inv.currency} {inv.amount.toLocaleString()}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}>
                        <View style={{
                          backgroundColor: `${statusColor}20`,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: BorderRadius.xs,
                        }}>
                          <Text style={{ fontSize: 10, fontWeight: "700" as const, color: statusColor }}>{statusLabel}</Text>
                        </View>
                        {!isPaid ? (
                          <View style={{ flexDirection: "row", gap: 6, marginLeft: "auto" }}>
                            <Pressable
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                                backgroundColor: `${Colors.dark.successNeon}20`,
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: BorderRadius.sm,
                                borderWidth: 1,
                                borderColor: `${Colors.dark.successNeon}40`,
                              }}
                              onPress={async () => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                try {
                                  await apiRequest("PATCH", `/api/billing/invoices/${inv.id}`, { status: "paid", paidAt: new Date().toISOString() });
                                  queryClient.invalidateQueries({ queryKey: ["/api/admin/players", player.id, "stats"] });
                                  queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
                                  queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  Alert.alert("Invoice Paid", `Invoice #${inv.invoiceNumber} has been marked as paid.`);
                                } catch (error) {
                                  Alert.alert("Error", "Failed to mark invoice as paid. Please try again.");
                                }
                              }}
                            >
                              <Ionicons name="checkmark-circle" size={14} color={Colors.dark.successNeon} />
                              <Text style={{ fontSize: 12, color: Colors.dark.successNeon, fontWeight: "700" as const }}>Paid</Text>
                            </Pressable>
                            <Pressable
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                                backgroundColor: `${isOverdue ? Colors.dark.error : "#FFD700"}15`,
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: BorderRadius.sm,
                                borderWidth: 1,
                                borderColor: `${isOverdue ? Colors.dark.error : "#FFD700"}30`,
                              }}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                setShowInvoiceModal(true);
                              }}
                            >
                              <Ionicons name="mail-outline" size={14} color={isOverdue ? Colors.dark.error : "#FFD700"} />
                              <Text style={{ fontSize: 12, color: isOverdue ? Colors.dark.error : "#FFD700", fontWeight: "700" as const }}>Reminder</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Baseline Management Card */}
        <View style={styles.baselineManagementCard}>
          <View style={styles.baselineManagementHeader}>
            <View style={styles.baselineIconContainer}>
              <Ionicons name="flag" size={18} color={baselineData ? Colors.dark.primary : Colors.dark.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.baselineManagementTitle}>Start Baseline</Text>
              <Text style={styles.baselineManagementStatus}>
                {baselineData 
                  ? `Current: ${(baselineData.ballLevel || "Unknown").toUpperCase()} ${baselineData.skillLevel || ""} (${baselineData.status})`
                  : "No baseline set"
                }
              </Text>
            </View>
          </View>
          <Pressable
            style={[
              styles.baselineActionButton,
              baselineData ? styles.baselineResetButton : styles.baselineStartButton,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (baselineData) {
                setShowResetBaselineConfirm(true);
              } else {
                onBack();
              }
            }}
          >
            <Ionicons 
              name={baselineData ? "refresh" : "play"} 
              size={16} 
              color={baselineData ? Colors.dark.gold : Colors.dark.backgroundRoot} 
            />
            <Text style={[
              styles.baselineActionButtonText,
              baselineData && styles.baselineResetButtonText,
            ]}>
              {baselineData ? "Reopen Baseline" : "Start Baseline"}
            </Text>
          </Pressable>
        </View>

        {/* Reset Baseline Confirmation Modal */}
        <Modal visible={showResetBaselineConfirm} transparent animationType="fade">
          <View style={styles.confirmModalOverlay}>
            <View style={styles.confirmModalContent}>
              <View style={styles.confirmModalIcon}>
                <Ionicons name="warning" size={32} color={Colors.dark.gold} />
              </View>
              <Text style={styles.confirmModalTitle}>Reopen Baseline?</Text>
              <Text style={styles.confirmModalText}>
                This will delete the current baseline assessment for {player.name}. 
                You can then set a new baseline from scratch.
              </Text>
              <View style={styles.confirmModalActions}>
                <Pressable
                  style={styles.confirmModalCancelButton}
                  onPress={() => setShowResetBaselineConfirm(false)}
                >
                  <Text style={styles.confirmModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.confirmModalConfirmButton}
                  onPress={() => resetBaselineMutation.mutate()}
                  disabled={resetBaselineMutation.isPending}
                >
                  {resetBaselineMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                  ) : (
                    <Text style={styles.confirmModalConfirmText}>Reopen</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {player.onboardingCompleted ? (
          <View style={styles.onboardingCard}>
            <View style={styles.onboardingHeader}>
              <Ionicons name="person-circle-outline" size={20} color={Colors.dark.xpCyan} />
              <Text style={styles.onboardingTitle}>Player Profile (Self-Reported)</Text>
            </View>
            
            <View style={styles.onboardingGrid}>
              {player.motivationType ? (
                <View style={styles.onboardingItem}>
                  <Text style={styles.onboardingLabel}>Motivation</Text>
                  <Text style={styles.onboardingValue}>
                    {player.motivationType === "fun" ? "Plays for fun" :
                     player.motivationType === "improve" ? "Wants to improve" :
                     player.motivationType === "compete" ? "Wants to compete" : "Not sure yet"}
                  </Text>
                </View>
              ) : null}
              
              {player.experienceLevel ? (
                <View style={styles.onboardingItem}>
                  <Text style={styles.onboardingLabel}>Experience</Text>
                  <Text style={styles.onboardingValue}>
                    {player.experienceLevel === "new" ? "New to tennis" :
                     player.experienceLevel === "6-12months" ? "6-12 months" :
                     player.experienceLevel === "1-3years" ? "1-3 years" : "3+ years"}
                  </Text>
                </View>
              ) : null}
              
              {player.dominantHand ? (
                <View style={styles.onboardingItem}>
                  <Text style={styles.onboardingLabel}>Dominant Hand</Text>
                  <Text style={styles.onboardingValue}>
                    {player.dominantHand === "left" ? "Left-handed" : "Right-handed"}
                  </Text>
                </View>
              ) : null}
            </View>

            {player.enjoymentTags && player.enjoymentTags.length > 0 ? (
              <View style={styles.onboardingTagSection}>
                <Text style={styles.onboardingLabel}>Enjoys</Text>
                <View style={styles.onboardingTags}>
                  {player.enjoymentTags.map((tag) => (
                    <View key={tag} style={styles.onboardingTag}>
                      <Text style={styles.onboardingTagText}>
                        {tag === "rallies" ? "Hitting rallies" :
                         tag === "winning" ? "Winning points" :
                         tag === "technique" ? "Learning technique" :
                         tag === "social" ? "Playing with others" :
                         tag === "active" ? "Being active" : "Competing"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            
            {player.focusGoals && player.focusGoals.length > 0 ? (
              <View style={styles.onboardingTagSection}>
                <Text style={styles.onboardingLabel}>Wants to work on</Text>
                <View style={styles.onboardingTags}>
                  {player.focusGoals.map((goal) => (
                    <View key={goal} style={[styles.onboardingTag, styles.onboardingTagGoal]}>
                      <Text style={[styles.onboardingTagText, styles.onboardingTagGoalText]}>
                        {goal === "technique" ? "Technique" :
                         goal === "confidence" ? "Confidence" :
                         goal === "fitness" ? "Fitness" :
                         goal === "focus" ? "Focus" :
                         goal === "strategy" ? "Playing smarter" : "Social/Teamwork"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {player.selfConfidenceFlags && player.selfConfidenceFlags.length > 0 ? (
              <View style={styles.onboardingTagSection}>
                <Text style={styles.onboardingLabel}>Self-assessment</Text>
                <View style={styles.onboardingTags}>
                  {player.selfConfidenceFlags.map((flag) => (
                    <View key={flag} style={[styles.onboardingTag, styles.onboardingTagNeutral]}>
                      <Text style={styles.onboardingTagText}>
                        {flag === "confident" ? "Feels confident" :
                         flag === "basics" ? "Knows basics" :
                         flag === "nervous" ? "Gets nervous in matches" : "Still learning fundamentals"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {nextLessonNotes.length > 0 ? (
          <View style={styles.nextLessonSection}>
            <View style={styles.nextLessonHeader}>
              <Ionicons name="arrow-forward-circle" size={20} color={Colors.dark.primary} />
              <Text style={styles.nextLessonTitle}>Next Lesson Suggestion</Text>
            </View>
            <Text style={styles.nextLessonText}>{nextLessonNotes[0].content}</Text>
          </View>
        ) : null}

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>Basic Info</Text>
          <View style={styles.infoCard}>
            {localPlayer.email ? (
              <View>
                <View style={styles.infoRow}>
                  <Ionicons name="mail-outline" size={20} color={Colors.dark.tabIconDefault} />
                  <Text style={styles.infoText}>{localPlayer.email}</Text>
                </View>
                {isInvitePending ? (
                  <Pressable
                    style={[
                      styles.sendInviteButton,
                      sendInviteEmailMutation.isPending ? { opacity: 0.5 } : null,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      sendInviteEmailMutation.mutate();
                    }}
                    disabled={sendInviteEmailMutation.isPending}
                  >
                    {sendInviteEmailMutation.isPending ? (
                      <ActivityIndicator size="small" color={Colors.dark.primary} />
                    ) : (
                      <Ionicons name="paper-plane-outline" size={15} color={Colors.dark.primary} />
                    )}
                    <Text style={styles.sendInviteButtonText}>
                      {sendInviteEmailMutation.isPending ? "Sending..." : "Send Invite Email"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {localPlayer.phone ? (
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={20} color={Colors.dark.tabIconDefault} />
                <Text style={styles.infoText}>{localPlayer.phone}</Text>
              </View>
            ) : null}
            {player.skillLevel ? (
              <View style={styles.infoRow}>
                <Ionicons name="trophy-outline" size={20} color={Colors.dark.tabIconDefault} />
                <Text style={styles.infoText}>Skill Level: {player.skillLevel}</Text>
              </View>
            ) : null}
            {player.age ? (
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={20} color={Colors.dark.tabIconDefault} />
                <Text style={styles.infoText}>Age: {player.age} years</Text>
              </View>
            ) : null}
            {player.height ? (
              <View style={styles.infoRow}>
                <Ionicons name="resize-outline" size={20} color={Colors.dark.tabIconDefault} />
                <Text style={styles.infoText}>Height: {player.height} cm</Text>
              </View>
            ) : null}
            {player.tshirtSize ? (
              <View style={styles.infoRow}>
                <Ionicons name="shirt-outline" size={20} color={Colors.dark.tabIconDefault} />
                <Text style={styles.infoText}>T-Shirt: {player.tshirtSize}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {player.medicalNotes ? (
          <View style={styles.infoSection}>
            <Text style={styles.sectionLabel}>Medical Notes</Text>
            <View style={[styles.infoCard, styles.warningCard]}>
              <Ionicons name="medical-outline" size={20} color={Colors.dark.error} />
              <Text style={styles.medicalText}>{player.medicalNotes}</Text>
            </View>
          </View>
        ) : null}

        {/* Attendance History Section */}
        <View style={styles.infoSection}>
          <View style={styles.attendanceHistoryHeader}>
            <View style={styles.attendanceHistoryTitleRow}>
              <Ionicons name="calendar" size={18} color={Colors.dark.xpCyan} />
              <Text style={styles.sectionLabel}>ATTENDANCE HISTORY</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                style={[styles.reportButton, isExportingAttendanceReport && { opacity: 0.5 }]}
                onPress={handleExportAttendanceReport}
                disabled={isExportingAttendanceReport}
              >
                {isExportingAttendanceReport ? (
                  <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={14} color={Colors.dark.xpCyan} />
                    <Text style={styles.reportButtonText}>PDF</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={[styles.reportButton, isSharingAttendanceLink && { opacity: 0.5 }]}
                onPress={handleShareAttendanceLink}
                disabled={isSharingAttendanceLink}
              >
                {isSharingAttendanceLink ? (
                  <ActivityIndicator size="small" color="#A78BFA" />
                ) : (
                  <>
                    <Ionicons name="link-outline" size={14} color="#A78BFA" />
                    <Text style={[styles.reportButtonText, { color: "#A78BFA" }]}>Share Link</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={[styles.reportButton, isSendingMonthlyReport && { opacity: 0.5 }]}
                onPress={handleSendMonthlyReport}
                disabled={isSendingMonthlyReport}
              >
                {isSendingMonthlyReport ? (
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
                ) : (
                  <>
                    <Ionicons name="mail-outline" size={14} color={Colors.dark.primary} />
                    <Text style={[styles.reportButtonText, { color: Colors.dark.primary }]}>Email</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {attendanceHistory.length === 0 ? (
            <View style={styles.emptyAttendanceCard}>
              <Ionicons name="calendar-outline" size={40} color={Colors.dark.disabled} />
              <Text style={styles.emptyAttendanceText}>No sessions yet</Text>
              <Text style={styles.emptyAttendanceSubtext}>Sessions will appear here once attended</Text>
            </View>
          ) : (
            <View style={styles.attendanceHistoryList}>
              {/* Series Summary Cards - show when player has multiple lesson groups */}
              {seriesAttendanceSummaries.length > 1 && (
                <View style={styles.seriesSummaryContainer}>
                  <Text style={styles.seriesSummaryTitle}>Per Lesson Group</Text>
                  <View style={styles.seriesSummaryGrid}>
                    {seriesAttendanceSummaries.map((summary) => (
                      <View key={summary.seriesId} style={styles.seriesSummaryCard}>
                        <View style={styles.seriesSummaryHeader}>
                          <Text style={styles.seriesSummaryDay}>{summary.dayName}</Text>
                          <Text style={styles.seriesSummaryTime}>{formatSeriesTime(summary.startTime)}</Text>
                        </View>
                        <View style={styles.seriesSummaryStats}>
                          <View style={styles.seriesSummaryStat}>
                            <Text style={[styles.seriesSummaryStatValue, { color: Colors.dark.primary }]}>
                              {summary.presentCount}
                            </Text>
                            <Text style={styles.seriesSummaryStatLabel}>Present</Text>
                          </View>
                          <View style={styles.seriesSummaryStat}>
                            <Text style={[styles.seriesSummaryStatValue, { color: Colors.dark.error }]}>
                              {summary.absentCount}
                            </Text>
                            <Text style={styles.seriesSummaryStatLabel}>Absent</Text>
                          </View>
                          <View style={styles.seriesSummaryStat}>
                            <Text style={[
                              styles.seriesSummaryStatValue,
                              { color: summary.attendanceRate >= 80 ? Colors.dark.primary : 
                                       summary.attendanceRate >= 60 ? Colors.dark.gold : Colors.dark.error }
                            ]}>
                              {summary.attendanceRate}%
                            </Text>
                            <Text style={styles.seriesSummaryStatLabel}>Rate</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Group sessions by series if multiple groups exist */}
              {seriesAttendanceSummaries.length > 1 ? (
                seriesAttendanceSummaries.map((summary) => {
                  const seriesRecords = displayedHistory
                    .filter(r => r.seriesId === summary.seriesId)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                  if (seriesRecords.length === 0) return null;
                  
                  const isExpanded = expandedSeriesIds.has(summary.seriesId);
                  const toggleExpanded = () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setExpandedSeriesIds(prev => {
                      const newSet = new Set(prev);
                      if (newSet.has(summary.seriesId)) {
                        newSet.delete(summary.seriesId);
                      } else {
                        newSet.add(summary.seriesId);
                      }
                      return newSet;
                    });
                  };
                  
                  return (
                    <View key={summary.seriesId} style={styles.seriesGroupSection}>
                      <Pressable style={styles.seriesGroupHeader} onPress={toggleExpanded}>
                        <View style={styles.seriesGroupHeaderLeft}>
                          <Text style={styles.seriesGroupDay}>{summary.dayName}</Text>
                          <Text style={styles.seriesGroupTime}>{formatSeriesTime(summary.startTime)}</Text>
                          <View style={styles.seriesGroupCount}>
                            <Text style={styles.seriesGroupCountText}>{seriesRecords.length}</Text>
                          </View>
                        </View>
                        <Ionicons 
                          name={isExpanded ? "chevron-up" : "chevron-down"} 
                          size={20} 
                          color={Colors.dark.xpCyan} 
                        />
                      </Pressable>
                      {isExpanded && seriesRecords.map((record) => (
                        <View key={record.sessionId} style={styles.attendanceHistoryRow}>
                          <View style={styles.attendanceHistoryDate}>
                            <Text style={styles.attendanceHistoryDateText}>
                              {formatAttendanceDate(record.date)}
                            </Text>
                          </View>
                          <View style={styles.attendanceHistoryDetails}>
                            <View style={styles.attendanceHistoryType}>
                              <Text style={styles.attendanceHistoryTypeText}>
                                {record.sessionType === "private" ? "Private" : 
                                 record.sessionType === "group" ? "Group" : 
                                 record.sessionType === "semi-private" ? "Semi" : record.sessionType}
                              </Text>
                            </View>
                            <View style={[
                              styles.attendanceStatusBadge,
                              record.status === "present" ? styles.attendanceStatusPresent :
                              record.status === "absent" ? styles.attendanceStatusAbsent :
                              (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? styles.attendanceStatusCancelled :
                              styles.attendanceStatusPending
                            ]}>
                              <Ionicons 
                                name={record.status === "present" ? "checkmark-circle" : 
                                      record.status === "absent" ? "close-circle" : 
                                      (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? "calendar-outline" : "time"} 
                                size={14} 
                                color={record.status === "present" ? Colors.dark.primary : 
                                       record.status === "absent" ? Colors.dark.error : 
                                       (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? Colors.dark.textSecondary : Colors.dark.gold}
                              />
                              <Text style={[
                                styles.attendanceStatusText,
                                record.status === "present" ? styles.attendanceStatusTextPresent :
                                record.status === "absent" ? styles.attendanceStatusTextAbsent :
                                (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? styles.attendanceStatusTextCancelled :
                                styles.attendanceStatusTextPending
                              ]}>
                                {record.status === "present" ? "Present" : 
                                 record.status === "absent" ? "Absent" : 
                                 record.status === "holiday" ? "Holiday" :
                                 record.status === "vacation" ? "Vacation" :
                                 record.status === "cancelled" ? "Cancelled" : "Pending"}
                              </Text>
                            </View>
                            <Pressable
                              style={styles.attendanceEditButton}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setEditingAttendance(record);
                              }}
                            >
                              <Ionicons name="pencil" size={16} color={Colors.dark.xpCyan} />
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })
              ) : (
                /* Original layout for single lesson group - sorted by date (newest first) */
                [...displayedHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((record, index) => (
                  <View key={record.sessionId} style={styles.attendanceHistoryRow}>
                    <View style={styles.attendanceHistoryDate}>
                      <Text style={styles.attendanceHistoryDateText}>
                        {formatAttendanceDate(record.date)}
                      </Text>
                      <Text style={styles.attendanceHistoryTime}>
                        {formatAttendanceTime(record.startTime)} - {formatAttendanceTime(record.endTime)}
                      </Text>
                    </View>
                    <View style={styles.attendanceHistoryDetails}>
                      <View style={styles.attendanceHistoryType}>
                        <Text style={styles.attendanceHistoryTypeText}>
                          {record.sessionType === "private" ? "Private" : 
                           record.sessionType === "group" ? "Group" : 
                           record.sessionType === "semi-private" ? "Semi" : record.sessionType}
                        </Text>
                      </View>
                      <View style={[
                        styles.attendanceStatusBadge,
                        record.status === "present" ? styles.attendanceStatusPresent :
                        record.status === "absent" ? styles.attendanceStatusAbsent :
                        (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? styles.attendanceStatusCancelled :
                        styles.attendanceStatusPending
                      ]}>
                        <Ionicons 
                          name={record.status === "present" ? "checkmark-circle" : 
                                record.status === "absent" ? "close-circle" : 
                                (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? "calendar-outline" : "time"} 
                          size={14} 
                          color={record.status === "present" ? Colors.dark.primary : 
                                 record.status === "absent" ? Colors.dark.error : 
                                 (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? Colors.dark.textSecondary : Colors.dark.gold}
                        />
                        <Text style={[
                          styles.attendanceStatusText,
                          record.status === "present" ? styles.attendanceStatusTextPresent :
                          record.status === "absent" ? styles.attendanceStatusTextAbsent :
                          (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? styles.attendanceStatusTextCancelled :
                          styles.attendanceStatusTextPending
                        ]}>
                          {record.status === "present" ? "Present" : 
                           record.status === "absent" ? "Absent" : 
                           record.status === "holiday" ? "Holiday" :
                           record.status === "vacation" ? "Vacation" :
                           record.status === "cancelled" ? "Cancelled" : "Pending"}
                          {record.lateMinutes && record.lateMinutes > 0 ? ` (+${record.lateMinutes}m late)` : ""}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.attendanceEditButton}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setEditingAttendance(record);
                        }}
                      >
                        <Ionicons name="pencil" size={16} color={Colors.dark.xpCyan} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}

              {attendanceHistory.length > 5 ? (
                <Pressable
                  style={styles.showMoreHistoryButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowAllHistory(!showAllHistory);
                  }}
                >
                  <Text style={styles.showMoreHistoryText}>
                    {showAllHistory ? "Show Less" : `Show All (${attendanceHistory.length} sessions)`}
                  </Text>
                  <Ionicons 
                    name={showAllHistory ? "chevron-up" : "chevron-down"} 
                    size={16} 
                    color={Colors.dark.xpCyan} 
                  />
                </Pressable>
              ) : null}
            </View>
          )}
        </View>

        {/* Stroke Feedback Timeline Section */}
        {strokeFeedbackData.length > 0 ? (
          <View style={styles.infoSection}>
            <Pressable
              style={styles.attendanceHistoryTitleRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStrokeTimelineExpanded((v) => !v);
              }}
            >
              <Ionicons name="tennisball-outline" size={18} color={GlowColors.primary} />
              <Text style={styles.sectionLabel}>VOORTGANG PER SLAG</Text>
              <View style={{ flex: 1 }} />
              <Ionicons
                name={strokeTimelineExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={Colors.dark.tabIconDefault}
              />
            </Pressable>

            {strokeTimelineExpanded ? (
              <View style={{ marginTop: Spacing.md }}>
                {(() => {
                  const strokeMap: Record<string, { date: string; rating: number; note?: string }[]> = {};
                  for (const entry of strokeFeedbackData) {
                    if (!entry.strokeFeedback) continue;
                    for (const sf of entry.strokeFeedback) {
                      if (!strokeMap[sf.stroke]) strokeMap[sf.stroke] = [];
                      strokeMap[sf.stroke].push({ date: entry.createdAt, rating: sf.rating, note: sf.note });
                    }
                  }
                  const strokes = Object.keys(strokeMap);
                  if (strokes.length === 0) {
                    return (
                      <Text style={{ color: Colors.dark.textMuted, fontSize: 13, textAlign: "center", paddingVertical: Spacing.md }}>
                        Nog geen slag-feedback beschikbaar
                      </Text>
                    );
                  }
                  return strokes.map((strokeId) => {
                    const strokeLabel = strokeId.charAt(0).toUpperCase() + strokeId.slice(1);
                    const records = strokeMap[strokeId].slice(0, 6);
                    const latest = records[0];
                    const latestColor = latest.rating === 2 ? GlowColors.primary : latest.rating === 1 ? Colors.dark.orange : Colors.dark.error;
                    const latestLabel = latest.rating === 2 ? "Goed" : latest.rating === 1 ? "In ontwikkeling" : "Aandachtspunt";
                    const latestIcon: keyof typeof Ionicons.glyphMap = latest.rating === 2 ? "checkmark-circle" : latest.rating === 1 ? "ellipse-outline" : "alert-circle";
                    return (
                      <View key={strokeId} style={strokeTimelineStyles.strokeRow}>
                        <View style={strokeTimelineStyles.strokeHeader}>
                          <Text style={strokeTimelineStyles.strokeName}>{strokeLabel}</Text>
                          <View style={[strokeTimelineStyles.latestBadge, { borderColor: latestColor, backgroundColor: latestColor + "18" }]}>
                            <Ionicons name={latestIcon} size={12} color={latestColor} />
                            <Text style={[strokeTimelineStyles.latestBadgeText, { color: latestColor }]}>{latestLabel}</Text>
                          </View>
                        </View>
                        <View style={strokeTimelineStyles.miniTimeline}>
                          {records.slice(0).reverse().map((r, i) => {
                            const rColor = r.rating === 2 ? GlowColors.primary : r.rating === 1 ? Colors.dark.orange : Colors.dark.error;
                            return (
                              <View key={i} style={[strokeTimelineStyles.timelineDot, { backgroundColor: rColor }]} />
                            );
                          })}
                        </View>
                        {latest.note ? (
                          <Text style={strokeTimelineStyles.strokeNote}>{latest.note}</Text>
                        ) : null}
                      </View>
                    );
                  });
                })()}

                {/* Overall recent feedback note */}
                {strokeFeedbackData[0]?.playerNote ? (
                  <View style={strokeTimelineStyles.playerNoteCard}>
                    <Ionicons name="chatbubble-outline" size={14} color={Colors.dark.xpCyan} />
                    <Text style={strokeTimelineStyles.playerNoteText}>{strokeFeedbackData[0].playerNote}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.infoSection}>
          <View style={styles.notesSectionHeader}>
            <Text style={styles.sectionLabel}>Coach Notes</Text>
            <Text style={styles.notesCount}>{notes.length} notes</Text>
          </View>

          {showAddNote ? (
            <View style={styles.addNoteForm}>
              <View style={styles.categoryPicker}>
                {NOTE_CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat.value}
                    style={[
                      styles.categoryChip,
                      newNoteCategory === cat.value && styles.categoryChipActive,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setNewNoteCategory(cat.value);
                    }}
                  >
                    <Ionicons
                      name={cat.icon}
                      size={14}
                      color={newNoteCategory === cat.value ? Colors.dark.primary : Colors.dark.tabIconDefault}
                    />
                    <Text
                      style={[
                        styles.categoryChipText,
                        newNoteCategory === cat.value && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.noteInput}
                placeholder="Write a note..."
                placeholderTextColor={Colors.dark.tabIconDefault}
                value={newNoteContent}
                onChangeText={setNewNoteContent}
                multiline
                maxLength={500}
              />
              <View style={styles.noteActions}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowAddNote(false);
                    setNewNoteContent("");
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveNoteButton, addNoteMutation.isPending && styles.saveNoteButtonDisabled]}
                  onPress={handleAddNote}
                  disabled={addNoteMutation.isPending || !newNoteContent.trim()}
                >
                  {addNoteMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                  ) : (
                    <Text style={styles.saveNoteButtonText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              style={styles.addNoteButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowAddNote(true);
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color={Colors.dark.primary} />
              <Text style={styles.addNoteText}>Add note</Text>
            </Pressable>
          )}

          {notesLoading ? (
            <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginTop: Spacing.md }} />
          ) : notes.length === 0 ? (
            <View style={styles.emptyNotesCard}>
              <Ionicons name="document-text-outline" size={32} color={Colors.dark.disabled} />
              <Text style={styles.noNotesText}>No notes yet</Text>
            </View>
          ) : (
            <View style={styles.notesList}>
              {pinnedNotes.map((note) => {
                const catInfo = getCategoryInfo(note.category);
                return (
                  <View key={note.id} style={[styles.noteCard, styles.pinnedNoteCard]}>
                    <View style={styles.noteHeader}>
                      <View style={styles.noteCategoryBadge}>
                        <Ionicons name={catInfo.icon} size={12} color={Colors.dark.primary} />
                        <Text style={styles.noteCategoryText}>{catInfo.label}</Text>
                      </View>
                      <Ionicons name="pin" size={14} color={Colors.dark.gold} />
                    </View>
                    <Text style={styles.noteContent}>{note.content}</Text>
                    <View style={styles.noteFooter}>
                      <Text style={styles.noteDate}>{formatNoteDate(note.createdAt)}</Text>
                      <View style={styles.noteFooterActions}>
                        <Pressable onPress={() => togglePinMutation.mutate({ noteId: note.id, isPinned: false })}>
                          <Ionicons name="pin-outline" size={18} color={Colors.dark.tabIconDefault} />
                        </Pressable>
                        <Pressable onPress={() => handleDeleteNote(note.id)}>
                          <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
              {regularNotes.map((note) => {
                const catInfo = getCategoryInfo(note.category);
                return (
                  <View key={note.id} style={styles.noteCard}>
                    <View style={styles.noteHeader}>
                      <View style={styles.noteCategoryBadge}>
                        <Ionicons name={catInfo.icon} size={12} color={Colors.dark.tabIconDefault} />
                        <Text style={styles.noteCategoryText}>{catInfo.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.noteContent}>{note.content}</Text>
                    <View style={styles.noteFooter}>
                      <Text style={styles.noteDate}>{formatNoteDate(note.createdAt)}</Text>
                      <View style={styles.noteFooterActions}>
                        <Pressable onPress={() => togglePinMutation.mutate({ noteId: note.id, isPinned: true })}>
                          <Ionicons name="pin-outline" size={18} color={Colors.dark.tabIconDefault} />
                        </Pressable>
                        <Pressable onPress={() => handleDeleteNote(note.id)}>
                          <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <DeepAssessmentDrawer
        visible={showDeepAssessment}
        player={player}
        onClose={() => setShowDeepAssessment(false)}
      />

      {/* Edit Player Modal */}
      <Modal visible={showEditPlayer} transparent animationType="fade" onRequestClose={() => setShowEditPlayer(false)}>
        <Pressable style={styles.editAttendanceModalOverlay} onPress={() => setShowEditPlayer(false)}>
          <Pressable style={[styles.editAttendanceModalContent, { gap: 12 }]} onPress={(e) => e.stopPropagation()} onStartShouldSetResponder={() => true}>
            <Text style={styles.editAttendanceModalTitle}>Edit Player</Text>

            <View style={{ gap: 8 }}>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" }}>NAME *</Text>
              <TextInput
                style={{
                  backgroundColor: Colors.dark.backgroundDefault,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 15,
                  color: Colors.dark.text,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.1)",
                }}
                value={editName}
                onChangeText={setEditName}
                placeholder="Player name"
                placeholderTextColor={Colors.dark.tabIconDefault}
                autoCapitalize="words"
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" }}>EMAIL</Text>
              <TextInput
                style={{
                  backgroundColor: Colors.dark.backgroundDefault,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 15,
                  color: Colors.dark.text,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.1)",
                }}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="Email address"
                placeholderTextColor={Colors.dark.tabIconDefault}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" }}>PHONE</Text>
              <TextInput
                style={{
                  backgroundColor: Colors.dark.backgroundDefault,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 15,
                  color: Colors.dark.text,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.1)",
                }}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="Phone number"
                placeholderTextColor={Colors.dark.tabIconDefault}
                keyboardType="phone-pad"
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" }}>BALL LEVEL</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {BALL_LEVELS.map(level => (
                  <Pressable
                    key={level}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 20,
                      borderWidth: 1.5,
                      borderColor: editBallLevel === level ? getPlayerLevelColor(level) : "rgba(255,255,255,0.12)",
                      backgroundColor: editBallLevel === level ? getPlayerLevelColor(level) + "25" : "transparent",
                    }}
                    onPress={() => setEditBallLevel(level)}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: editBallLevel === level ? getPlayerLevelColor(level) : Colors.dark.textSecondary,
                    }}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <Pressable
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center" }}
                onPress={() => setShowEditPlayer(false)}
              >
                <Text style={{ color: Colors.dark.text, fontWeight: "600", fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.dark.primary, alignItems: "center", opacity: updatePlayerMutation.isPending ? 0.7 : 1 }}
                onPress={() => {
                  if (!editName.trim()) {
                    Alert.alert("Required", "Player name cannot be empty");
                    return;
                  }
                  updatePlayerMutation.mutate();
                }}
                disabled={updatePlayerMutation.isPending}
              >
                {updatePlayerMutation.isPending ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>Save</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Attendance Modal */}
      <Modal visible={!!editingAttendance} transparent animationType="fade">
        <Pressable style={styles.editAttendanceModalOverlay} onPress={() => setEditingAttendance(null)}>
          <View style={styles.editAttendanceModalContent}>
            <Text style={styles.editAttendanceModalTitle}>Edit Attendance</Text>
            <Text style={styles.editAttendanceModalSubtitle}>
              {editingAttendance ? formatAttendanceDate(editingAttendance.date) : ""}
            </Text>
            
            {["present", "absent", "late", "holiday"].map((status) => (
              <Pressable
                key={status}
                style={[
                  styles.editAttendanceOption,
                  editingAttendance?.status === status && styles.editAttendanceOptionSelected,
                ]}
                onPress={() => {
                  if (editingAttendance && editingAttendance.status !== status) {
                    setIsUpdatingAttendance(true);
                    updateAttendanceMutation.mutate({
                      sessionId: editingAttendance.sessionId,
                      newStatus: status,
                    });
                  } else {
                    setEditingAttendance(null);
                  }
                }}
                disabled={isUpdatingAttendance}
              >
                <Ionicons
                  name={status === "present" ? "checkmark-circle" : 
                        status === "absent" ? "close-circle" : 
                        status === "late" ? "time" : "calendar-outline"}
                  size={20}
                  color={status === "present" ? Colors.dark.primary : 
                         status === "absent" ? Colors.dark.error : 
                         status === "late" ? Colors.dark.gold : Colors.dark.textSecondary}
                />
                <Text style={styles.editAttendanceOptionText}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
                {editingAttendance?.status === status && (
                  <Ionicons name="checkmark" size={20} color={Colors.dark.primary} style={{ marginLeft: "auto" }} />
                )}
              </Pressable>
            ))}
            
            {isUpdatingAttendance && (
              <ActivityIndicator size="small" color={Colors.dark.xpCyan} style={{ marginTop: 16 }} />
            )}
            
            <Text style={styles.editAttendanceNote}>
              Changing attendance will automatically adjust credits
            </Text>
          </View>
        </Pressable>
      </Modal>

      <CreateInvoiceModal
        visible={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        player={playerStats?.player ? {
          id: playerStats.player.id,
          name: playerStats.player.name,
          email: playerStats.player.email,
          phone: playerStats.player.phone,
          parentName: playerStats.player.parentName,
          parentEmail: undefined,
          parentPhone: playerStats.player.parentPhone,
        } : null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/players", player.id, "stats"] });
        }}
      />

      {/* Record Payment Modal */}
      <Modal
        visible={showRecordPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRecordPaymentModal(false)}
      >
        <View style={styles.recordPaymentOverlay}>
          <View style={styles.recordPaymentContainer}>
            <View style={styles.recordPaymentHeader}>
              <Text style={styles.recordPaymentTitle}>Record Payment</Text>
              <Pressable 
                style={styles.recordPaymentClose}
                onPress={() => setShowRecordPaymentModal(false)}
              >
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            
            <ScrollView style={styles.recordPaymentContent}>
              {playerStats?.packages?.filter((p: any) => !p.isPaid).length === 0 ? (
                <View style={styles.noUnpaidBox}>
                  <Ionicons name="checkmark-circle" size={48} color={Colors.dark.successNeon} />
                  <Text style={styles.noUnpaidTitleText}>All Paid!</Text>
                  <Text style={styles.noUnpaidSubText}>
                    This player has no outstanding payments.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.unpaidTitle}>Unpaid Packages</Text>
                  {playerStats?.packages?.filter((p: any) => !p.isPaid).map((pkg: any) => (
                    <View key={pkg.id} style={styles.unpaidCard}>
                      <View style={styles.unpaidInfo}>
                        <View style={styles.unpaidRow}>
                          <Ionicons 
                            name={pkg.creditType === "private" ? "person" : pkg.creditType === "semi_private" ? "people" : "people-circle"} 
                            size={20} 
                            color={Colors.dark.primary} 
                          />
                          <Text style={styles.unpaidType}>
                            {pkg.creditType === "private" ? "Private" : pkg.creditType === "semi_private" ? "Semi-Private" : "Group"}
                          </Text>
                        </View>
                        <Text style={styles.unpaidCredits}>
                          {formatCredits(pkg.remainingCredits)} / {formatCredits(pkg.totalCredits)} credits
                        </Text>
                        <Text style={styles.unpaidPrice}>
                          AED {Number(pkg.price || 0).toLocaleString()}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.markPaidBtn}
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          try {
                            await apiRequest("PATCH", `/api/packages/${pkg.id}`, { isPaid: true, paidAt: new Date().toISOString() });
                            queryClient.invalidateQueries({ queryKey: ["/api/admin/players", player.id, "stats"] });
                            queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
                            queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            Alert.alert("Payment Recorded", `Package marked as paid.`);
                          } catch (error) {
                            console.error("Failed to record payment:", error);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                            Alert.alert("Error", "Failed to record payment. Please try again.");
                          }
                        }}
                      >
                        <Ionicons name="checkmark" size={18} color="#000" />
                        <Text style={styles.markPaidBtnText}>Mark Paid</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
            
            <Pressable
              style={styles.recordPaymentDone}
              onPress={() => setShowRecordPaymentModal(false)}
            >
              <Text style={styles.recordPaymentDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

