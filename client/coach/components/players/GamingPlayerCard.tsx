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
import { apiRequest, getStaticAssetsUrl, getApiUrl, getAuthHeaders, buildPhotoUrl } from "@/lib/query-client";
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
export function GamingPlayerCard({ 
  player, 
  onPress, 
  getStatusBadge,
  needsBaseline,
  onStartBaseline,
  isPast,
  isPendingPayment,
  onArchive,
  onRestore,
  onPendingPayment,
}: { 
  player: Player; 
  onPress: () => void;
  getStatusBadge: (status: string | null) => { color: string; icon: "airplane" | "bandage" | "sparkles"; label: string } | null;
  needsBaseline?: boolean;
  onStartBaseline?: () => void;
  isPast?: boolean;
  isPendingPayment?: boolean;
  onArchive?: () => void;
  onRestore?: () => void;
  onPendingPayment?: () => void;
}) {
  const levelColor = getPlayerLevelColor(player.ballLevel ?? "green");
  const levelTextColor = getPlayerLevelTextColor(player.ballLevel ?? "green");
  const effectiveStatus = player.onHoliday ? "holiday" : player.status;
  const statusBadge = getStatusBadge(effectiveStatus);
  const scale = useSharedValue(1);
  const [showInvitePopover, setShowInvitePopover] = useState(false);
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false);

  const isPendingSignup = !player.onboardingCompleted;

  const { data: inviteData } = useQuery<{ inviteCode: string; status: string } | null>({
    queryKey: ["/api/players", player.id, "invite"],
    enabled: isPendingSignup && showInvitePopover,
    retry: false,
  });

  const handleCopyInviteCode = async () => {
    const code = inviteData?.inviteCode;
    if (code) {
      await Clipboard.setStringAsync(code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setInviteCodeCopied(true);
      setTimeout(() => setInviteCodeCopied(false), 3000);
    }
  };
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const xpProgress = Math.random() * 100;

  return (
    <>
    <AnimatedPressable
      style={[styles.gamingCardContainer, animatedStyle, isPast && { opacity: 0.65 }, isPendingPayment && { opacity: 0.8 }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <LinearGradient
        colors={isPast ? ["#33333840", "#33333810"] : isPendingPayment ? ["#f59e0b40", "#f59e0b10"] : [levelColor + "40", levelColor + "10"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gamingCardBorder}
      >
        <View style={styles.gamingCardInner}>
          <View style={styles.gamingAvatarContainer}>
            <View style={[styles.gamingAvatarGlow, { backgroundColor: levelColor + "30" }]} />
            <View style={[styles.gamingAvatarRing, { borderColor: levelColor }]} />
            {player.profilePhotoUrl ? (
              Platform.OS === 'web' ? (
                <RNImage
                  source={{ uri: buildPhotoUrl(player.profilePhotoUrl)! }}
                  style={styles.gamingAvatarPhoto}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={{ uri: buildPhotoUrl(player.profilePhotoUrl)! }}
                  style={styles.gamingAvatarPhoto}
                  contentFit="cover"
                />
              )
            ) : (
              <LinearGradient
                colors={[levelColor, levelColor + "80"]}
                style={styles.gamingAvatar}
              >
                <Text style={styles.gamingAvatarText}>
                  {player.name.charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>
            )}
          </View>

          <View style={styles.gamingCardInfo}>
            <View style={styles.gamingCardNameRow}>
              <Text style={styles.gamingCardName} numberOfLines={1}>
                {player.name}
              </Text>
              {player.auditVerifiedAt ? (
                <View style={styles.auditVerifiedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.dark.primary} />
                </View>
              ) : null}
              {statusBadge ? (
                <View style={[styles.gamingStatusBadge, { backgroundColor: statusBadge.color + "25", borderColor: statusBadge.color }]}>
                  <Ionicons name={statusBadge.icon} size={10} color={statusBadge.color} />
                  <Text style={[styles.gamingStatusBadgeText, { color: statusBadge.color }]}>{statusBadge.label}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.gamingXpContainer}>
              <View style={styles.gamingXpBarBg}>
                <LinearGradient
                  colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.gamingXpBarFill, { width: `${xpProgress}%` }]}
                />
              </View>
              <Text style={styles.gamingXpText}>
                {Math.round(xpProgress)}%
              </Text>
            </View>

            <View style={styles.gamingCardMeta}>
              <View style={[styles.gamingLevelBadge, { borderColor: levelColor + "60" }]}>
                <View style={[styles.gamingLevelDotSmall, { backgroundColor: levelColor }]} />
                <Text style={[styles.gamingLevelText, { color: levelTextColor }]}>
                  {(player.ballLevel ?? "green").toUpperCase()}
                </Text>
              </View>
              {(() => {
                const credits = player.remainingCredits;
                const byType = player.creditsByType;

                const getCreditColor = (val: number) =>
                  val < 0 ? Colors.dark.error
                  : val === 0 ? Colors.dark.error
                  : val <= 2 ? Colors.dark.gold
                  : "#22c55e";

                const overallColor = credits === undefined
                  ? Colors.dark.tabIconDefault
                  : getCreditColor(credits);

                const formatCreditParts = () => {
                  if (credits === undefined) return [{ text: "No pkg", color: Colors.dark.tabIconDefault }];
                  if (!byType) return [{ text: credits === 0 ? "0 credits" : `${formatCredits(credits)}`, color: getCreditColor(credits) }];

                  const parts: { text: string; color: string }[] = [];
                  if (byType.private !== 0) parts.push({ text: `${formatCredits(byType.private)} Prv`, color: getCreditColor(byType.private) });
                  if (byType.group !== 0) parts.push({ text: `${formatCredits(byType.group)} Grp`, color: getCreditColor(byType.group) });
                  if (byType.semiPrivate !== 0) parts.push({ text: `${formatCredits(byType.semiPrivate)} Semi`, color: getCreditColor(byType.semiPrivate) });
                  if (parts.length > 0) return parts;
                  // Distinguish "depleted active package" from "no package at all"
                  if ((player.totalCredits ?? 0) > 0) {
                    return [{ text: "Depleted", color: Colors.dark.gold }];
                  }
                  return [{ text: "0 credits", color: Colors.dark.error }];
                };

                const parts = formatCreditParts();

                return (
                  <View style={[styles.creditsBadge, { backgroundColor: overallColor + "20" }]}>
                    <Ionicons name="ticket-outline" size={12} color={overallColor} />
                    {parts.map((p, i) => (
                      <Text key={i} style={[styles.creditsText, { color: p.color }]}>
                        {i > 0 ? " | " : ""}{p.text}
                      </Text>
                    ))}
                  </View>
                );
              })()}
              {needsBaseline && (
                <Pressable
                  style={styles.baselineNeededBadge}
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onStartBaseline?.();
                  }}
                >
                  <Ionicons name="flag" size={10} color={Colors.dark.orange} />
                  <Text style={styles.baselineNeededText}>Baseline</Text>
                </Pressable>
              )}
              {isPendingPayment ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#f59e0b25", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#f59e0b50" }}>
                  <Ionicons name="wallet-outline" size={9} color="#f59e0b" />
                  <Text style={{ fontSize: 9, fontWeight: "700", color: "#f59e0b", letterSpacing: 0.3 }}>Awaiting Payment</Text>
                </View>
              ) : isPendingSignup ? (
                <Pressable
                  style={styles.awaitingSignupBadge}
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowInvitePopover(true);
                  }}
                >
                  <Ionicons name="time-outline" size={9} color={Colors.dark.orange} />
                  <Text style={styles.awaitingSignupText}>Awaiting signup</Text>
                </Pressable>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#22c55e18", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#22c55e" }} />
                  <Text style={{ fontSize: 9, fontWeight: "700", color: "#22c55e", letterSpacing: 0.3 }}>App active</Text>
                </View>
              )}
            </View>
          </View>

          <View style={{ flexDirection: "column", alignItems: "center", gap: 6 }}>
            {onPendingPayment ? (
              <Pressable
                style={[styles.archiveActionBtn, { backgroundColor: "#f59e0b20", borderColor: "#f59e0b50" }]}
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onPendingPayment();
                }}
              >
                <Ionicons name="wallet-outline" size={14} color="#f59e0b" />
              </Pressable>
            ) : null}
            {onArchive ? (
              <Pressable
                style={styles.archiveActionBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onArchive();
                }}
              >
                <Ionicons name="archive-outline" size={14} color={Colors.dark.tabIconDefault} />
              </Pressable>
            ) : null}
            {onRestore ? (
              <Pressable
                style={styles.restoreActionBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onRestore();
                }}
              >
                <Ionicons name="refresh-outline" size={14} color={Colors.dark.primary} />
              </Pressable>
            ) : null}
            <View style={styles.gamingChevron}>
              <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault + "80"} />
            </View>
          </View>
        </View>
      </LinearGradient>
    </AnimatedPressable>

    <Modal visible={showInvitePopover} transparent animationType="fade" onRequestClose={() => setShowInvitePopover(false)}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 24 }}
        onPress={() => setShowInvitePopover(false)}
      >
        <Pressable style={styles.pendingInvitePopover} onPress={(e) => e.stopPropagation()} onStartShouldSetResponder={() => true}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ionicons name="time-outline" size={18} color={Colors.dark.orange} />
            <Text style={styles.pendingInvitePopoverTitle}>Awaiting Signup</Text>
          </View>
          <Text style={styles.pendingInvitePopoverInstruction}>
            {player.name} hasn't joined the app yet. Share this code with them:
          </Text>
          {inviteData?.inviteCode ? (
            <>
              <Text style={styles.pendingInvitePopoverCode} selectable>{inviteData.inviteCode}</Text>
              <Pressable style={styles.pendingInviteCopyBtn} onPress={handleCopyInviteCode}>
                <Ionicons name={inviteCodeCopied ? "checkmark-circle" : "copy-outline"} size={16} color={inviteCodeCopied ? Colors.dark.primary : Colors.dark.orange} />
                <Text style={[styles.pendingInviteCopyBtnText, inviteCodeCopied ? { color: Colors.dark.primary } : null]}>
                  {inviteCodeCopied ? "Copied!" : "Copy Code"}
                </Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator size="small" color={Colors.dark.orange} style={{ marginVertical: 16 }} />
          )}
          <Pressable style={styles.pendingInviteDismissBtn} onPress={() => setShowInvitePopover(false)}>
            <Text style={styles.pendingInviteDismissBtnText}>Dismiss</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

