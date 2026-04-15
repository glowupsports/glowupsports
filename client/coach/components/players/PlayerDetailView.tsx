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
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import * as Linking from "expo-linking";
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming,
  withSequence,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, FontSizes, getPlayerLevelColor, getPlayerLevelTextColor, GlowColors } from "@/constants/theme";
import { apiRequest, getStaticAssetsUrl, getApiUrl, getAuthHeaders, buildPhotoUrl } from "@/lib/query-client";
import { useCoach } from "@/coach/context/CoachContext";
import { useNavigation } from "@react-navigation/native";
import { formatCredits } from "@/lib/dateUtils";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import PackagesCard from "@/coach/components/PackagesCard";
import QuickBaselineDrawer from "@/coach/components/QuickBaselineDrawer";
import QuickFeedbackModal from "@/coach/components/QuickFeedbackModal";
import { PlayerAttendanceSection } from "./PlayerAttendanceSection";
import { PlayerStrokeFeedbackSection } from "./PlayerStrokeFeedbackSection";
import { PlayerNotesSection } from "./PlayerNotesSection";
import { CollapsibleSection } from "./CollapsibleSection";
import { PlayerMonthlyReportsSection } from "./PlayerMonthlyReportsSection";
import { GuidedEmptyState } from "@/components/GuidedEmptyState";
import { PremiumBaselineFlow } from "@/coach/components/PremiumBaselineFlow";
import { DeepAssessmentDrawer } from "@/coach/components/DeepAssessmentDrawer";
import { PremiumAddPlayerFlow } from "@/coach/components/PremiumAddPlayerFlow";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { JuniorAssessmentFlow } from "@/coach/components/JuniorAssessmentFlow";
import { ActionSheet } from "@/components/ActionSheet";
import type { AssessmentResult as JuniorAssessmentResult } from "@/coach/components/JuniorAssessmentFlow";

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
  parentEmail?: string | null;
  parentReporting?: boolean;
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

import * as Clipboard from "expo-clipboard";
import { styles } from "./playersStyles";

interface PlayerQuestItem {
  id: string;
  name: string;
  description: string;
  iconName: string;
  iconColor: string;
  category: string;
  currentProgress: number;
  targetProgress: number;
  status: string;
  xpReward: number | null;
  personalisedBy: string | null;
}

function PlayerQuestsSection({ playerId }: { playerId: string }) {
  const { data, isLoading } = useQuery<{ quests: PlayerQuestItem[] }>({
    queryKey: ["/api/coach/players", playerId, "quests"],
    queryFn: async () => {
      return apiRequest("GET", `/api/coach/players/${playerId}/quests`);
    },
  });

  const quests = data?.quests || [];

  if (isLoading) {
    return (
      <View style={{ paddingVertical: 16, alignItems: "center" }}>
        <ActivityIndicator size="small" color={Colors.dark.primary} />
      </View>
    );
  }

  if (quests.length === 0) {
    return (
      <View style={{ paddingVertical: 12, alignItems: "center", gap: 6 }}>
        <Ionicons name="flash-outline" size={24} color={Colors.dark.tabIconDefault} />
        <Text style={{ color: Colors.dark.textSecondary, fontSize: 13, textAlign: "center" }}>
          No active quests assigned
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8, paddingTop: 4 }}>
      {quests.map((quest) => {
        const progress = quest.targetProgress > 0 ? quest.currentProgress / quest.targetProgress : 0;
        const isComplete = quest.status === "completed" || quest.status === "claimed";
        return (
          <View
            key={quest.id}
            style={{
              backgroundColor: Colors.dark.backgroundSecondary,
              borderRadius: 10,
              padding: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderWidth: isComplete ? 1 : 0,
              borderColor: isComplete ? Colors.dark.primary + "40" : "transparent",
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: (quest.iconColor || "#00FF88") + "20",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name={(quest.iconName || "flash") as React.ComponentProps<typeof Ionicons>["name"]} size={18} color={isComplete ? Colors.dark.primary : (quest.iconColor || "#00FF88")} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text style={{ color: isComplete ? Colors.dark.primary : Colors.dark.text, fontSize: 13, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
                  {quest.name}
                </Text>
                {quest.personalisedBy ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#00FF8820", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, borderWidth: 1, borderColor: "#00FF8840" }}>
                    <Ionicons name="sparkles" size={9} color="#00FF88" />
                    <Text style={{ fontSize: 9, fontWeight: "700", color: "#00FF88" }}>For you</Text>
                  </View>
                ) : null}
                {isComplete ? (
                  <View style={{ backgroundColor: Colors.dark.primary + "20", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 }}>
                    <Text style={{ fontSize: 9, fontWeight: "700", color: Colors.dark.primary }}>Done</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ flex: 1, height: 4, backgroundColor: Colors.dark.backgroundRoot, borderRadius: 2, overflow: "hidden" }}>
                  <View style={{ width: `${Math.min(progress * 100, 100)}%`, height: "100%", backgroundColor: isComplete ? Colors.dark.primary : (quest.iconColor || "#00FF88"), borderRadius: 2 }} />
                </View>
                <Text style={{ fontSize: 11, color: Colors.dark.textSecondary, minWidth: 36 }}>
                  {quest.currentProgress}/{quest.targetProgress}
                </Text>
              </View>
            </View>
            {quest.xpReward ? (
              <View style={{ alignItems: "center" }}>
                <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
                <Text style={{ fontSize: 10, fontWeight: "600", color: Colors.dark.xpCyan }}>+{quest.xpReward}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ProminentInviteCard({
  inviteCode,
  playerName,
  onSendEmail,
  isSendingEmail,
  onGenerateNewCode,
  isGeneratingNewCode,
}: {
  inviteCode: string;
  playerName: string;
  onSendEmail?: () => void;
  isSendingEmail?: boolean;
  onGenerateNewCode?: () => void;
  isGeneratingNewCode?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const handleCopy = async () => {
    await Clipboard.setStringAsync(inviteCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };
  const handleShare = async () => {
    if (Platform.OS === "web") {
      await Clipboard.setStringAsync(inviteCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 3000);
      return;
    }
    try {
      const { Share } = await import("react-native");
      await Share.share({
        message: `Hi ${playerName}! Use invite code ${inviteCode} to sign up on the Glow Up Sports app.`,
        title: "Invite Code",
      });
    } catch {}
  };
  const handleGenerateNewCode = () => {
    Alert.alert(
      "Generate New Code?",
      "The current invite code will stop working immediately. Anyone holding the old code will no longer be able to use it. Are you sure you want to generate a new code?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate New Code",
          style: "destructive",
          onPress: () => onGenerateNewCode?.(),
        },
      ]
    );
  };
  return (
    <View style={styles.prominentInviteCard}>
      <Text style={styles.prominentInviteCardTitle}>Invite Code — Awaiting Signup</Text>
      <Text style={styles.prominentInviteInstruction}>
        Share this code with {playerName} so they can sign up in the app
      </Text>
      <Text style={styles.prominentInviteCode} selectable>{inviteCode}</Text>
      <Pressable style={styles.prominentCopyButton} onPress={handleCopy}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.prominentCopyButtonGradient}
        >
          <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={18} color={Colors.dark.buttonText} />
          <Text style={styles.prominentCopyButtonText}>{copied ? "Copied!" : "Copy Code"}</Text>
        </LinearGradient>
      </Pressable>
      <Pressable style={styles.prominentShareButton} onPress={handleShare}>
        <Ionicons name={codeCopied ? "checkmark-circle-outline" : "share-outline"} size={16} color={codeCopied ? Colors.dark.successNeon : Colors.dark.primary} />
        <Text style={[styles.prominentShareButtonText, codeCopied ? { color: Colors.dark.successNeon } : null]}>
          {codeCopied ? "Code Copied!" : "Share Code"}
        </Text>
      </Pressable>
      {onSendEmail ? (
        <Pressable
          style={[styles.prominentShareButton, { marginTop: 4, borderColor: Colors.dark.tabIconDefault + "40", backgroundColor: Colors.dark.backgroundTertiary }]}
          onPress={onSendEmail}
          disabled={isSendingEmail}
        >
          {isSendingEmail ? (
            <ActivityIndicator size="small" color={Colors.dark.primary} />
          ) : (
            <Ionicons name="paper-plane-outline" size={16} color={Colors.dark.tabIconDefault} />
          )}
          <Text style={[styles.prominentShareButtonText, { color: Colors.dark.tabIconDefault }]}>
            {isSendingEmail ? "Sending..." : "Send invite by email"}
          </Text>
        </Pressable>
      ) : null}
      {onGenerateNewCode ? (
        <Pressable
          style={[styles.prominentShareButton, { marginTop: 4, borderColor: Colors.dark.error + "40", backgroundColor: Colors.dark.backgroundTertiary }]}
          onPress={handleGenerateNewCode}
          disabled={isGeneratingNewCode}
        >
          {isGeneratingNewCode ? (
            <ActivityIndicator size="small" color={Colors.dark.error} />
          ) : (
            <Ionicons name="refresh-outline" size={16} color={Colors.dark.error} />
          )}
          <Text style={[styles.prominentShareButtonText, { color: Colors.dark.error }]}>
            {isGeneratingNewCode ? "Generating..." : "Generate New Code"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PlayerDetailView({
  player,
  onBack,
  onNavigateToPlayer,
  insets,
  onAssessmentComplete,
}: {
  player: Player;
  onBack: () => void;
  onNavigateToPlayer?: (playerId: string) => void;
  insets: { top: number; bottom: number };
  onAssessmentComplete?: (result: JuniorAssessmentResult) => void;
}) {
  const { coach, academy } = useCoach();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const tz = academy?.timezone || "Asia/Dubai";
  
  const tabBarHeight = TAB_BAR_HEIGHT;
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [pillarProgressExpanded, setPillarProgressExpanded] = useState(false);
  const [showRatePlayerSessions, setShowRatePlayerSessions] = useState(false);
  const [selectedSessionForRating, setSelectedSessionForRating] = useState<{ id: string; players: { id: string; name: string; ballLevel?: string | null }[] } | null>(null);
  const [showDeepAssessment, setShowDeepAssessment] = useState(false);
  const [showJuniorAssessment, setShowJuniorAssessment] = useState(false);
  const [lastJuniorAssessmentResult, setLastJuniorAssessmentResult] = useState<JuniorAssessmentResult | null>(null);
  const [showEditPlayer, setShowEditPlayer] = useState(false);
  const [editName, setEditName] = useState(player.name);
  const [editEmail, setEditEmail] = useState(player.email ?? "");
  const [editPhone, setEditPhone] = useState(player.phone ?? "");
  const [editBallLevel, setEditBallLevel] = useState(player.ballLevel ?? "");
  const [editParentEmail, setEditParentEmail] = useState(player.parentEmail ?? "");
  const [editParentReporting, setEditParentReporting] = useState(player.parentReporting ?? false);

  const [showParentReport, setShowParentReport] = useState(false);
  const [parentReportLetter, setParentReportLetter] = useState<string | null>(null);
  const [parentReportMonthLabel, setParentReportMonthLabel] = useState<string>("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isSendingReport, setIsSendingReport] = useState(false);


  const [localPlayer, setLocalPlayer] = useState(player);

  // Merge player state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<Player | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const [showActionSheet, setShowActionSheet] = useState(false);

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

  const mergePlayerMutation = useMutation({
    mutationFn: async (targetId: string) => {
      const res = await apiRequest("POST", `/api/players/${player.id}/merge-into/${targetId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to merge players");
      }
      return res.json();
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      setShowMergeModal(false);
      setMergeTarget(null);
      if (data.userWarning) {
        setTimeout(() => {
          Alert.alert("Merge Complete", `Players merged successfully.\n\nNote: ${data.userWarning}`);
        }, 300);
      }
      if (onNavigateToPlayer && data.targetId) {
        onNavigateToPlayer(data.targetId);
      } else {
        onBack();
      }
    },
    onError: (error: Error) => {
      setTimeout(() => {
        Alert.alert("Error", error.message || "Failed to merge players");
      }, 350);
    },
  });

  const handleMergeConfirm = (target: Player) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "Merge Players",
      `All attendance, credits, groups, and notes from ${localPlayer.name} will be moved to ${target.name}. ${localPlayer.name} will then be deleted.\n\nThis cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Merge",
          style: "destructive",
          onPress: () => mergePlayerMutation.mutate(target.id),
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
        parentEmail: editParentEmail.trim() || null,
        parentReporting: editParentReporting,
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
        parentEmail: editParentEmail.trim() || null,
        parentReporting: editParentReporting,
      }));
      queryClient.setQueryData<Player[]>(["/api/players?withCredits=true"], (old) =>
        old?.map((p) =>
          p.id === player.id
            ? { ...p, name: editName.trim(), email: editEmail.trim() || null, phone: editPhone.trim() || null, ballLevel: editBallLevel || null, parentEmail: editParentEmail.trim() || null, parentReporting: editParentReporting }
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

  const handlePreviewParentReport = async () => {
    setIsGeneratingReport(true);
    setParentReportLetter(null);
    setShowParentReport(true);
    try {
      const res = await apiRequest("POST", `/api/players/${player.id}/parent-report/preview`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate report");
      setParentReportLetter(data.letter);
      setParentReportMonthLabel(data.monthLabel || "");
    } catch (err: any) {
      setShowParentReport(false);
      setTimeout(() => Alert.alert("Error", err.message || "Failed to generate parent report"), 300);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleSendParentReport = async () => {
    if (!localPlayer.parentEmail) {
      Alert.alert("No Parent Email", "Please add a parent email address in the player edit form first.");
      return;
    }
    setIsSendingReport(true);
    try {
      const res = await apiRequest("POST", `/api/players/${player.id}/parent-report/send`, {
        letter: parentReportLetter,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send report");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowParentReport(false);
      setTimeout(() => Alert.alert("Sent", `Parent report sent to ${data.sentTo}`), 300);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to send parent report");
    } finally {
      setIsSendingReport(false);
    }
  };

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

  const regenerateInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/players/${player.id}/invite/regenerate`);
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/players", player.id, "invite"] });
    },
    onError: (error: Error) => {
      setTimeout(() => {
        Alert.alert("Failed", error.message || "Could not generate new code. Try again.");
      }, 350);
    },
  });

  const [localAuditVerified, setLocalAuditVerified] = useState<boolean>(!!player.auditVerifiedAt);
  const [verifyFlashText, setVerifyFlashText] = useState<string | null>(null);
  const verifyFlashOpacity = useSharedValue(0);

  const verifyFlashStyle = useAnimatedStyle(() => ({
    opacity: verifyFlashOpacity.value,
    transform: [{ translateY: interpolate(verifyFlashOpacity.value, [0, 1], [8, 0]) }],
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
    enabled: !localPlayer.onboardingCompleted,
    retry: false,
  });
  const isInvitePending = inviteData?.status === "pending";

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
    playerSelfRatings: Record<string, number> | null;
    latestAssessmentMonth: string | null;
    latestAssessmentSummary: string | null;
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

  interface AttendanceHistoryRecord {
    sessionId: string;
    date: string;
    startTime: string;
    endTime: string;
    sessionType: string;
    status: string | null;
    sessionStatus: string | null;
    seriesTitle?: string | null;
  }
  const { data: attendanceHistoryData } = useQuery<{ history: AttendanceHistoryRecord[] }>({
    queryKey: [`/api/coach/players/${player.id}/attendance-history`],
    enabled: showRatePlayerSessions,
  });

  interface StrokeFeedbackRow {
    id: string;
    sessionId: string;
    createdAt: string;
  }
  // Fetches all session_skill_feedback rows for this player — used to exclude
  // already-rated sessions from the "Rate Player" picker so coach can't double-rate.
  const { data: strokeFeedbackData } = useQuery<StrokeFeedbackRow[]>({
    queryKey: [`/api/glow/players/${player.id}/stroke-feedback`],
    enabled: showRatePlayerSessions,
  });

  const recentCompletedSessions = React.useMemo(() => {
    if (!attendanceHistoryData?.history) return [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    // Build set of sessionIds that already have any QuickFeedback for this player
    const ratedSessionIds = new Set((strokeFeedbackData ?? []).map(f => f.sessionId));
    return attendanceHistoryData.history
      .filter(h => {
        if (h.sessionStatus !== "completed") return false;
        const sessionDate = h.date ? new Date(h.date) : null;
        if (sessionDate && sessionDate < thirtyDaysAgo) return false;
        if (ratedSessionIds.has(h.sessionId)) return false;
        return true;
      })
      .slice(0, 10);
  }, [attendanceHistoryData, strokeFeedbackData]);

  // Calculate level readiness (returns null for max level or invalid level)
  const levelReadiness = getLevelReadiness(localPlayer.ballLevel, xpData?.totalXp || 0);

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
          <Pressable
            style={styles.premiumActionsButton}
            onPress={() => {
              if (deletePlayerMutation.isPending) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowActionSheet(true);
            }}
          >
            {deletePlayerMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.error} />
            ) : (
              <Text style={styles.premiumActionsButtonText}>Actions</Text>
            )}
          </Pressable>
        </View>
      </LinearGradient>

      {/* Verify result toast */}
      {verifyFlashText ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.verifyToast,
            {
              backgroundColor:
                verifyFlashText === "Error"
                  ? Colors.dark.error + "EE"
                  : verifyFlashText === "Unverified"
                  ? Colors.dark.warning + "EE"
                  : Colors.dark.primary + "EE",
            },
            verifyFlashStyle,
          ]}
        >
          <Ionicons
            name={
              verifyFlashText === "Error"
                ? "alert-circle"
                : verifyFlashText === "Unverified"
                ? "close-circle"
                : "checkmark-circle"
            }
            size={16}
            color={verifyFlashText === "Error" || verifyFlashText === "Unverified" ? "#fff" : "#000"}
          />
          <Text
            style={[
              styles.verifyToastText,
              {
                color:
                  verifyFlashText === "Error" || verifyFlashText === "Unverified" ? "#fff" : "#000",
              },
            ]}
          >
            {verifyFlashText === "Verified"
              ? "Player verified"
              : verifyFlashText === "Unverified"
              ? "Verification removed"
              : "Verification failed"}
          </Text>
        </Animated.View>
      ) : null}

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
                  source={{ uri: buildPhotoUrl(localPlayer.profilePhotoUrl)! }}
                  style={styles.premiumAvatarPhoto}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={{ uri: buildPhotoUrl(localPlayer.profilePhotoUrl)! }}
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

          {/* Junior Assessment Card - visible for red/orange/green ball level players */}
          {localPlayer.ballLevel && ["red", "orange", "green"].includes(localPlayer.ballLevel.toLowerCase()) ? (() => {
            const bl = localPlayer.ballLevel!.toLowerCase();
            const lc = getPlayerLevelColor(bl);
            const pr = lastJuniorAssessmentResult;
            return (
              <View style={[styles.levelReadinessCard, { borderColor: lc + "35", marginTop: Spacing.md }]}>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowJuniorAssessment(true); }}
                  style={[styles.levelReadinessHeader, { marginBottom: 0 }]}
                >
                  <View style={[styles.levelReadinessIcon, { backgroundColor: lc + "25", borderColor: lc + "50" }]}>
                    <Ionicons name="trophy" size={18} color={lc} />
                  </View>
                  <Text style={styles.levelReadinessTitle}>Assess for Promotion</Text>
                  {pr ? (
                    <View style={[styles.xpBadge, { backgroundColor: pr.passed ? lc + "25" : Colors.dark.error + "20" }]}>
                      <Ionicons name={pr.passed ? "checkmark-circle" : "close-circle"} size={12} color={pr.passed ? lc : Colors.dark.error} />
                      <Text style={[styles.xpBadgeText, { color: pr.passed ? lc : Colors.dark.error }]}>
                        {pr.passed ? "PASS" : "FAIL"} {pr.percentage}%
                      </Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault} style={{ marginLeft: 4 }} />
                </Pressable>
              </View>
            );
          })() : null}
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
            
            {/* Player Voice — Perception Gap Section */}
            {pillarProgress.playerSelfRatings ? (() => {
              const SELF_KEY_MAP: Record<string, string> = {
                TECHNIQUE: "technical",
                TACTICAL: "tactical",
                PHYSICAL: "physical",
                MENTAL: "mental",
                MATCH: "matchplay",
              };
              const MIRROR_PURPLE = "#A78BFA";
              const gapPillars = pillarProgress.pillars
                .filter(p => SELF_KEY_MAP[p.name] && pillarProgress.playerSelfRatings![SELF_KEY_MAP[p.name]] != null)
                .map(p => {
                  const selfKey = SELF_KEY_MAP[p.name];
                  const selfRating = pillarProgress.playerSelfRatings![selfKey]; // 1–10
                  const selfPct = Math.round(selfRating * 10); // 0–100
                  const coachPct = Math.round((p.score / 2) * 100); // 0–100
                  const gap = selfPct - coachPct;
                  return { name: p.name, selfPct, coachPct, gap };
                });

              if (gapPillars.length === 0) return null;

              return (
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: MIRROR_PURPLE + "20", paddingTop: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 6 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: MIRROR_PURPLE + "25", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="mic" size={11} color={MIRROR_PURPLE} />
                    </View>
                    <Text style={{ color: MIRROR_PURPLE, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
                      Player Self-Perception
                    </Text>
                    {pillarProgress.latestAssessmentMonth ? (
                      <View style={{ backgroundColor: MIRROR_PURPLE + "20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: MIRROR_PURPLE, fontSize: 10 }}>{pillarProgress.latestAssessmentMonth}</Text>
                      </View>
                    ) : null}
                  </View>

                  {gapPillars.map(({ name, selfPct, coachPct, gap }) => {
                    const absGap = Math.abs(gap);
                    const gapColor = gap > 15 ? "#FBBF24" : gap < -15 ? "#F87171" : Colors.dark.tabIconDefault;
                    const pillarLabel = name.charAt(0) + name.slice(1).toLowerCase();
                    return (
                      <View key={name} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                          <Text style={{ color: Colors.dark.textMuted, fontSize: 11 }}>{pillarLabel}</Text>
                          {absGap > 10 ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Ionicons
                                name={gap > 0 ? "arrow-up" : "arrow-down"}
                                size={10}
                                color={gapColor}
                              />
                              <Text style={{ color: gapColor, fontSize: 10, fontWeight: "600" }}>
                                {gap > 0 ? "Player rates higher" : "Player rates lower"}
                              </Text>
                            </View>
                          ) : (
                            <Text style={{ color: Colors.dark.tabIconDefault, fontSize: 10 }}>Aligned</Text>
                          )}
                        </View>
                        {/* Coach bar */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <Text style={{ color: Colors.dark.tabIconDefault, fontSize: 9, width: 42 }}>Coach</Text>
                          <View style={{ flex: 1, height: 4, backgroundColor: Colors.dark.surfaceElevated, borderRadius: 2 }}>
                            <View style={{ width: `${coachPct}%`, height: 4, backgroundColor: Colors.dark.primary, borderRadius: 2 }} />
                          </View>
                          <Text style={{ color: Colors.dark.primary, fontSize: 10, width: 30, textAlign: "right" }}>{coachPct}%</Text>
                        </View>
                        {/* Player self-rating bar */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={{ color: Colors.dark.tabIconDefault, fontSize: 9, width: 42 }}>Player</Text>
                          <View style={{ flex: 1, height: 4, backgroundColor: Colors.dark.surfaceElevated, borderRadius: 2 }}>
                            <View style={{ width: `${selfPct}%`, height: 4, backgroundColor: MIRROR_PURPLE, borderRadius: 2 }} />
                          </View>
                          <Text style={{ color: MIRROR_PURPLE, fontSize: 10, width: 30, textAlign: "right" }}>{selfPct}%</Text>
                        </View>
                      </View>
                    );
                  })}

                  {pillarProgress.latestAssessmentSummary ? (
                    <View style={{ backgroundColor: MIRROR_PURPLE + "12", borderRadius: 8, padding: 8, marginTop: 4 }}>
                      <Text style={{ color: Colors.dark.textMuted, fontSize: 11, lineHeight: 16 }} numberOfLines={3}>
                        {pillarProgress.latestAssessmentSummary}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })() : null}

            {pillarProgress.recentFeedbackCount > 0 ? (
              <View style={styles.feedbackSummaryRow}>
                <Ionicons name="chatbubble-outline" size={12} color={Colors.dark.tabIconDefault} />
                <Text style={styles.feedbackSummaryText}>
                  {pillarProgress.recentFeedbackCount} feedback{pillarProgress.recentFeedbackCount !== 1 ? "s" : ""} last 30 days
                </Text>
              </View>
            ) : null}
            <Pressable
              style={styles.ratePillarButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowRatePlayerSessions(true);
              }}
            >
              <Ionicons name="star" size={14} color={Colors.dark.primary} />
              <Text style={styles.ratePillarButtonText}>Rate Player</Text>
            </Pressable>
            </> : null}
          </View>
        ) : null}

        <CollapsibleSection title="Packages" icon="ticket-outline" iconColor={Colors.dark.gold}>
          <PackagesCard playerId={player.id} playerName={localPlayer.name} />
        </CollapsibleSection>

        {isInvitePending && inviteData?.inviteCode ? (
          <CollapsibleSection title="Invite Code" icon="mail-outline" iconColor={Colors.dark.xpCyan}>
            <ProminentInviteCard inviteCode={inviteData.inviteCode} playerName={localPlayer.name} onSendEmail={() => sendInviteEmailMutation.mutate()} isSendingEmail={sendInviteEmailMutation.isPending} onGenerateNewCode={() => regenerateInviteMutation.mutate()} isGeneratingNewCode={regenerateInviteMutation.isPending} />
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection title="Basic Info" icon="person-outline" iconColor={Colors.dark.tabIconDefault}>
          <View style={styles.infoSection}>
            <View style={styles.infoCard}>
              {localPlayer.email ? (
                <View>
                  <View style={styles.infoRow}>
                    <Ionicons name="mail-outline" size={20} color={Colors.dark.tabIconDefault} />
                    <Text style={styles.infoText}>{localPlayer.email}</Text>
                  </View>
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
              <View style={[styles.infoCard, styles.warningCard]}>
                <Ionicons name="medical-outline" size={20} color={Colors.dark.error} />
                <Text style={styles.medicalText}>{player.medicalNotes}</Text>
              </View>
            </View>
          ) : null}

          {/* Parent Reporting Section */}
          {(localPlayer.parentEmail || (localPlayer.age && localPlayer.age < 18)) ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              {localPlayer.parentEmail ? (
                <View style={[styles.infoCard, { gap: 10 }]}>
                  <View style={styles.infoRow}>
                    <Ionicons name="people-outline" size={20} color={Colors.dark.xpCyan} />
                    <Text style={[styles.infoText, { flex: 1 }]}>Parent: {localPlayer.parentEmail}</Text>
                    {localPlayer.parentReporting ? (
                      <View style={{ backgroundColor: Colors.dark.primary + "25", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: Colors.dark.primary, fontSize: 11, fontWeight: "700" }}>REPORTING ON</Text>
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      backgroundColor: Colors.dark.xpCyan + "15",
                      borderWidth: 1,
                      borderColor: Colors.dark.xpCyan + "40",
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      handlePreviewParentReport();
                    }}
                  >
                    <Ionicons name="mail-outline" size={18} color={Colors.dark.xpCyan} />
                    <Text style={{ color: Colors.dark.xpCyan, fontWeight: "600", fontSize: 14 }}>
                      Send Parent Report
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection title="Attendance History" icon="calendar-outline" iconColor={Colors.dark.xpCyan}>
          <PlayerAttendanceSection playerId={player.id} playerName={localPlayer.name} tz={tz} hideHeader />
        </CollapsibleSection>

        <PlayerStrokeFeedbackSection playerId={player.id} />

        <CollapsibleSection title="Active Quests" icon="flash-outline" iconColor="#00FF88">
          <PlayerQuestsSection playerId={player.id} />
        </CollapsibleSection>

        <CollapsibleSection title="Coach Notes" icon="document-text-outline" iconColor={Colors.dark.primary}>
          <PlayerNotesSection playerId={player.id} coachId={coach?.id} hideHeader />
        </CollapsibleSection>

        <CollapsibleSection title="Monthly Reports" icon="mail-unread-outline" iconColor="#a855f7">
          <PlayerMonthlyReportsSection playerId={player.id} playerName={localPlayer.name} />
        </CollapsibleSection>

      </ScrollView>

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

            <View style={{ gap: 8 }}>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" }}>PARENT EMAIL</Text>
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
                value={editParentEmail}
                onChangeText={setEditParentEmail}
                placeholder="Parent email (for monthly reports)"
                placeholderTextColor={Colors.dark.tabIconDefault}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.dark.text, fontSize: 14, fontWeight: "600" }}>Monthly parent reporting</Text>
                <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 }}>AI progress letter sent on the 1st of each month</Text>
              </View>
              <Pressable
                style={{
                  width: 48,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: editParentReporting ? Colors.dark.primary : "rgba(255,255,255,0.15)",
                  justifyContent: "center",
                  paddingHorizontal: 3,
                }}
                onPress={() => setEditParentReporting(!editParentReporting)}
              >
                <View style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: "#fff",
                  alignSelf: editParentReporting ? "flex-end" : "flex-start",
                }} />
              </Pressable>
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
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <Text style={{ color: Colors.dark.buttonText, fontWeight: "700", fontSize: 15 }}>Save</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Session Picker Modal for Rate Player */}
      <Modal visible={showRatePlayerSessions} transparent animationType="slide" onRequestClose={() => setShowRatePlayerSessions(false)}>
        <Pressable style={styles.editAttendanceModalOverlay} onPress={() => setShowRatePlayerSessions(false)}>
          <Pressable style={[styles.editAttendanceModalContent, { maxHeight: "70%" }]} onPress={(e) => e.stopPropagation()} onStartShouldSetResponder={() => true}>
            <Text style={styles.editAttendanceModalTitle}>Rate Session</Text>
            <Text style={{ color: Colors.dark.textSecondary, fontSize: 13, marginBottom: Spacing.md }}>
              Select a completed session to rate {localPlayer.name}
            </Text>
            {!attendanceHistoryData ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginVertical: Spacing.lg }} />
            ) : recentCompletedSessions.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: Spacing.xl }}>
                <Ionicons name="calendar-outline" size={32} color={Colors.dark.tabIconDefault} />
                <Text style={{ color: Colors.dark.textSecondary, marginTop: Spacing.sm, textAlign: "center" }}>No completed sessions found</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {recentCompletedSessions.map((session) => {
                  const sessionDate = new Date(session.date);
                  const dateStr = sessionDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                  return (
                    <Pressable
                      key={session.sessionId}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: Spacing.md,
                        borderBottomWidth: 1,
                        borderBottomColor: "rgba(255,255,255,0.06)",
                        gap: Spacing.sm,
                      }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowRatePlayerSessions(false);
                        setSelectedSessionForRating({
                          id: session.sessionId,
                          players: [{ id: player.id, name: localPlayer.name, ballLevel: localPlayer.ballLevel }],
                        });
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.dark.primary + "20", justifyContent: "center", alignItems: "center" }}>
                        <Ionicons name="calendar" size={16} color={Colors.dark.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: Colors.dark.text, fontSize: 14, fontWeight: "600" }}>{dateStr}</Text>
                        {session.seriesTitle ? (
                          <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 }}>{session.seriesTitle}</Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.dark.tabIconDefault} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Quick Feedback Modal launched from Rate Player */}
      <QuickFeedbackModal
        visible={selectedSessionForRating !== null}
        session={selectedSessionForRating}
        onClose={() => setSelectedSessionForRating(null)}
        onComplete={() => {
          setSelectedSessionForRating(null);
          queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/pillar-progress`] });
        }}
      />

      {/* Parent Report Preview Modal */}
      <Modal visible={showParentReport} transparent animationType="slide" onRequestClose={() => setShowParentReport(false)}>
        <Pressable style={styles.editAttendanceModalOverlay} onPress={() => !isGeneratingReport && !isSendingReport && setShowParentReport(false)}>
          <Pressable style={[styles.editAttendanceModalContent, { maxHeight: "85%" }]} onPress={(e) => e.stopPropagation()} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md }}>
              <Text style={styles.editAttendanceModalTitle}>Parent Progress Letter</Text>
              <Pressable onPress={() => setShowParentReport(false)}>
                <Ionicons name="close" size={22} color={Colors.dark.tabIconDefault} />
              </Pressable>
            </View>

            {parentReportMonthLabel ? (
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginBottom: Spacing.md }}>
                {parentReportMonthLabel} — Preview before sending
              </Text>
            ) : null}

            {isGeneratingReport ? (
              <View style={{ alignItems: "center", paddingVertical: Spacing.xl * 2 }}>
                <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
                <Text style={{ color: Colors.dark.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
                  Generating AI letter for {localPlayer.name}...
                </Text>
              </View>
            ) : parentReportLetter ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: Spacing.lg }}>
                <Text style={{
                  color: Colors.dark.text,
                  fontSize: 14,
                  lineHeight: 22,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 12,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}>
                  {parentReportLetter}
                </Text>
              </ScrollView>
            ) : null}

            {parentReportLetter ? (
              <View style={{ gap: 10 }}>
                {localPlayer.parentEmail ? (
                  <Pressable
                    style={{
                      paddingVertical: 13,
                      borderRadius: 12,
                      backgroundColor: Colors.dark.primary,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 8,
                      opacity: isSendingReport ? 0.7 : 1,
                    }}
                    onPress={handleSendParentReport}
                    disabled={isSendingReport}
                  >
                    {isSendingReport ? (
                      <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                    ) : (
                      <Ionicons name="send" size={16} color={Colors.dark.buttonText} />
                    )}
                    <Text style={{ color: Colors.dark.buttonText, fontWeight: "700", fontSize: 15 }}>
                      {isSendingReport ? "Sending..." : `Send to ${localPlayer.parentEmail}`}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={{ backgroundColor: Colors.dark.warning + "20", borderRadius: 10, padding: 12 }}>
                    <Text style={{ color: Colors.dark.warning, fontSize: 13, textAlign: "center" }}>
                      No parent email on file. Add one in the Edit Player form.
                    </Text>
                  </View>
                )}
                <Pressable
                  style={{ paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center" }}
                  onPress={() => setShowParentReport(false)}
                >
                  <Text style={{ color: Colors.dark.text, fontWeight: "600", fontSize: 15 }}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <JuniorAssessmentFlow
        visible={showJuniorAssessment}
        playerId={localPlayer.id}
        playerName={localPlayer.name}
        currentLevelId={
          localPlayer.ballLevel
            ? {
                red: "RED_2",
                orange: "ORANGE_2",
                green: "GREEN_1",
              }[localPlayer.ballLevel.toLowerCase()] ?? null
            : null
        }
        onClose={() => setShowJuniorAssessment(false)}
        onAssessmentComplete={(result) => {
          setLastJuniorAssessmentResult(result);
          onAssessmentComplete?.(result);
        }}
      />

      <ActionSheet
        visible={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        actions={[
          {
            id: "edit",
            label: "Edit Player",
            icon: "pencil-outline",
            color: Colors.dark.tabIconDefault,
            onPress: () => {
              setEditName(localPlayer.name);
              setEditEmail(localPlayer.email ?? "");
              setEditPhone(localPlayer.phone ?? "");
              setEditBallLevel(localPlayer.ballLevel ?? "");
              setEditParentEmail(localPlayer.parentEmail ?? "");
              setEditParentReporting(localPlayer.parentReporting ?? false);
              setShowEditPlayer(true);
            },
          },
          {
            id: "verify",
            label: localAuditVerified ? "Unverify Player" : "Verify Player",
            icon: localAuditVerified ? "checkmark-circle" : "checkmark-circle-outline",
            color: localAuditVerified ? Colors.dark.primary : Colors.dark.tabIconDefault,
            isLoading: auditVerifyMutation.isPending,
            keepOpenWhileLoading: true,
            onPress: () => {
              auditVerifyMutation.mutate();
            },
          },
          {
            id: "deep-assessment",
            label: "Deep Assessment",
            icon: "analytics",
            color: Colors.dark.xpCyan,
            onPress: () => {
              setShowDeepAssessment(true);
            },
          },
          {
            id: "progress-report",
            label: "Progress Report",
            icon: "document-text-outline",
            color: Colors.dark.xpCyan,
            isLoading: isExportingReport,
            keepOpenWhileLoading: true,
            onPress: handleExportProgressReport,
          },
          {
            id: "video-feedback",
            label: "Video Feedback",
            icon: "videocam-outline",
            color: "#4DA3FF",
            onPress: () => {
              navigation.navigate("VideoFeedback", { playerId: player.id });
            },
          },
          {
            id: "match-history",
            label: "Match History",
            icon: "trophy-outline",
            color: "#CCFF00",
            onPress: () => {
              navigation.navigate("PlayerMatchHistory", { playerId: player.id, playerName: player.name });
            },
          },
          {
            id: "merge",
            label: "Merge Player",
            icon: "git-merge-outline",
            color: Colors.dark.tabIconDefault,
            onPress: () => {
              setMergeSearch("");
              setMergeTarget(null);
              setShowMergeModal(true);
            },
          },
          {
            id: "delete",
            label: "Delete Player",
            icon: "trash-outline",
            isLoading: deletePlayerMutation.isPending,
            isDestructive: true,
            onPress: handleDeletePlayer,
          },
        ]}
      />

      <MergePlayerModal
        visible={showMergeModal}
        sourcePlayer={localPlayer}
        search={mergeSearch}
        onSearchChange={setMergeSearch}
        onClose={() => setShowMergeModal(false)}
        onSelect={(target) => {
          setShowMergeModal(false);
          handleMergeConfirm(target);
        }}
        isMerging={mergePlayerMutation.isPending}
      />

    </View>
  );
}

function MergePlayerModal({
  visible,
  sourcePlayer,
  search,
  onSearchChange,
  onClose,
  onSelect,
  isMerging,
}: {
  visible: boolean;
  sourcePlayer: Player;
  search: string;
  onSearchChange: (s: string) => void;
  onClose: () => void;
  onSelect: (p: Player) => void;
  isMerging: boolean;
}) {
  const { data: allPlayers } = useQuery<Player[]>({
    queryKey: ["/api/players?withCredits=true"],
    enabled: visible,
  });

  const filtered = (allPlayers || []).filter(
    (p) =>
      p.id !== sourcePlayer.id &&
      (search.trim() === "" ||
        p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        (p.email || "").toLowerCase().includes(search.trim().toLowerCase()))
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: Colors.dark.backgroundDefault,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: 32,
            maxHeight: "80%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 12,
              gap: 12,
            }}
          >
            <Ionicons name="git-merge-outline" size={22} color={Colors.dark.warning} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.dark.text, fontWeight: "700", fontSize: 17 }}>
                Merge into another player
              </Text>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 }}>
                History from {sourcePlayer.name} will move to the selected player
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={Colors.dark.tabIconDefault} />
            </Pressable>
          </View>

          <View
            style={{
              marginHorizontal: 20,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: Colors.dark.backgroundSecondary,
              borderRadius: 10,
              paddingHorizontal: 12,
              gap: 8,
            }}
          >
            <Ionicons name="search-outline" size={16} color={Colors.dark.tabIconDefault} />
            <TextInput
              value={search}
              onChangeText={onSearchChange}
              placeholder="Search players..."
              placeholderTextColor={Colors.dark.tabIconDefault}
              style={{
                flex: 1,
                color: Colors.dark.text,
                fontSize: 15,
                paddingVertical: 10,
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 32 }}>
                <Ionicons name="people-outline" size={32} color={Colors.dark.tabIconDefault} />
                <Text style={{ color: Colors.dark.textSecondary, marginTop: 10, fontSize: 14 }}>
                  No other players found
                </Text>
              </View>
            ) : (
              filtered.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => onSelect(p)}
                  disabled={isMerging}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    gap: 12,
                    opacity: pressed ? 0.7 : 1,
                    backgroundColor: pressed ? Colors.dark.backgroundSecondary : "transparent",
                  })}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: Colors.dark.primary + "30",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: Colors.dark.primary, fontWeight: "700", fontSize: 15 }}>
                      {p.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.dark.text, fontWeight: "600", fontSize: 15 }}>
                      {p.name}
                    </Text>
                    {p.email ? (
                      <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }} numberOfLines={1}>
                        {p.email}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault} />
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

