import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert as RNAlert,
  Platform,
  Linking,
  RefreshControl,
  Image as RNImage,
} from "react-native";
import * as Location from "expo-location";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  interpolate,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LanguageHeaderButton } from "@/components/LanguageSelectorModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import MiniTimeline from "@/coach/components/MiniTimeline";
import { CoachStatusPanel } from "@/coach/components/CoachStatusPanel";
import { FreelanceLicenseWizard } from "@/coach/components/FreelanceLicenseWizard";
import { BurnoutRiskCard } from "@/coach/components/BurnoutRiskCard";
import { BirthdayOverviewCard } from "@/coach/components/BirthdayOverviewCard";
import { LoadForecastCard } from "@/coach/components/LoadForecastCard";
import { CoachEarningsCard } from "@/coach/components/CoachEarningsCard";
import { AcademySwitcher } from "@/coach/components/AcademySwitcher";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import { filterSessionsByDate } from "@/lib/dateUtils";
import { getApiUrl, apiRequest, buildPhotoUrl } from "@/lib/query-client";
import { NextSessionCountdown } from "@/coach/components/NextSessionCountdown";
import SessionDetailDrawer from "@/coach/components/SessionDetailDrawer";
import AttendanceDrawer from "@/coach/components/AttendanceDrawer";
import DaySessionsDrawer from "@/coach/components/DaySessionsDrawer";
import { IntakeResult } from "@/coach/components/IntakeFlowModal";
import { useIntakeModal } from "@/coach/context/IntakeModalContext";
import { useAIModal } from "@/coach/context/AIModalContext";
import { PlayersByLevelCard } from "@/coach/components/PlayersByLevelCard";
import { useWebSocket } from "@/lib/useWebSocket";
import { ActionNeededCard } from "@/components/ActionNeededCard";
import { CoachInsightsPanel } from "@/coach/components/CoachInsightsPanel";
import { RosterInsightsCard } from "@/coach/components/RosterInsightsCard";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { GettingStartedChecklist, ChecklistStep } from "@/components/GettingStartedChecklist";
import { WelcomeIntroModal } from "@/components/WelcomeIntroModal";
import { HelpButton } from "@/components/HelpButton";
import { QuickTipsBanner } from "@/components/QuickTipsBanner";
import { RoleSwitchingGuide } from "@/components/RoleSwitchingGuide";
import { PlatformUsageProgress } from "@/components/PlatformUsageProgress";
import { NotificationGuideModal } from "@/components/NotificationGuideModal";
import { FirstActionCelebration } from "@/components/FirstActionCelebration";
import { useTranslation } from "react-i18next";

interface Player {
  id: string;
  name: string;
  level?: string;
  ballLevel?: string | null;
  status?: string;
}

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  locationId?: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  ballLevel?: string | null;
  skillLevel?: number | null;
  isRecurring?: boolean | null;
  paymentStatus?: string | null;
  status: string | null;
  players?: Player[];
}

interface Alert {
  id: string;
  type: "unpaid" | "holiday" | "absent" | "feedback";
  message: string;
  priority: "high" | "medium" | "low";
}

interface PendingAttendanceSession {
  sessionId: string;
  startTime: string | Date;
  endTime: string | Date;
  sessionType: string;
  seriesTitle: string;
  players: Array<{ id: string; name: string }>;
}

interface PendingFeedbackSession {
  sessionId: string;
  startTime: string;
  sessionType: string;
  players: Array<{ id: string; name: string; attendanceStatus?: string }>;
  playerCount: number;
  needsGroupDynamics: boolean;
  cardType: "private" | "semi_private" | "group";
}

interface WeeklyCalendarData {
  ownSessions: Session[];
  blockedSessions: any[];
  courts: any[];
  dateRange: { start: string; end: string };
}

function TravelAlertBanner({ locationName, shouldLeaveInMinutes }: { locationName: string; shouldLeaveInMinutes: number }) {
  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 800 }),
        withTiming(1, { duration: 800 }),
      ),
      -1,
      false
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  const isLate = shouldLeaveInMinutes < 0;
  const isUrgent = !isLate && shouldLeaveInMinutes <= 10;
  const isWarning = !isLate && !isUrgent && shouldLeaveInMinutes <= 30;

  let bannerColor = "#2ECC40";
  if (isLate) bannerColor = "#E74C3C";
  else if (isUrgent) bannerColor = "#E74C3C";
  else if (isWarning) bannerColor = "#F39C12";

  const label = isLate
    ? `You're late — leave for ${locationName} NOW`
    : `Next: ${locationName} — Leave in ${shouldLeaveInMinutes} min`;

  return (
    <Animated.View style={[travelBannerStyles.wrapper, { borderColor: bannerColor + "80" }, pulseStyle]}>
      <LinearGradient
        colors={[bannerColor + "22", bannerColor + "10"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={travelBannerStyles.gradient}
      >
        <View style={travelBannerStyles.iconRow}>
          <Ionicons name="navigate" size={16} color={bannerColor} />
          <Text style={[travelBannerStyles.label, { color: bannerColor }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const travelBannerStyles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  gradient: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});

function PendingAttendanceCard({
  sessions,
  onSessionTap,
}: {
  sessions: PendingAttendanceSession[];
  onSessionTap: (session: PendingAttendanceSession) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? sessions : sessions.slice(0, 5);
  const hidden = sessions.length - 5;

  function formatSessionDate(startTime: string | Date): string {
    const d = new Date(startTime);
    const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    return `${day} · ${time}`;
  }

  return (
    <View style={attendanceCardStyles.card}>
      <View style={attendanceCardStyles.headerRow}>
        <Ionicons name="alert-circle" size={18} color="#FF6B35" />
        <Text style={attendanceCardStyles.headerTitle}>Attendance Needed</Text>
        <View style={attendanceCardStyles.attendanceBadge}>
          <Text style={attendanceCardStyles.attendanceBadgeText}>{sessions.length}</Text>
        </View>
      </View>
      <Text style={attendanceCardStyles.subLabel}>
        {sessions.length} {sessions.length === 1 ? "session needs" : "sessions need"} attendance — credits cannot be processed until resolved
      </Text>
      {displayed.map((sess) => (
        <Pressable
          key={sess.sessionId}
          style={attendanceCardStyles.sessionRow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onSessionTap(sess);
          }}
        >
          <View style={attendanceCardStyles.dotAndInfo}>
            <View style={attendanceCardStyles.dot} />
            <View style={attendanceCardStyles.sessionInfo}>
              <Text style={attendanceCardStyles.seriesTitle} numberOfLines={1}>{sess.seriesTitle}</Text>
              <Text style={attendanceCardStyles.dateText}>{formatSessionDate(sess.startTime)}</Text>
              <Text style={attendanceCardStyles.playersText} numberOfLines={1}>
                {(sess.players ?? []).length} player{(sess.players ?? []).length !== 1 ? 's' : ''} · tap to review
              </Text>
            </View>
          </View>
          <View style={attendanceCardStyles.rightRow}>
            <View style={attendanceCardStyles.typeBadge}>
              <Text style={attendanceCardStyles.typeText}>{sess.sessionType === "private" ? "Private" : "Group"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#FF6B35" />
          </View>
        </Pressable>
      ))}
      {!showAll && hidden > 0 && (
        <Pressable onPress={() => setShowAll(true)} style={attendanceCardStyles.showMoreBtn}>
          <Text style={attendanceCardStyles.showMoreText}>See {hidden} more</Text>
        </Pressable>
      )}
    </View>
  );
}

function PendingFeedbackCard({
  sessions,
  onSessionTap,
}: {
  sessions: PendingFeedbackSession[];
  onSessionTap: (session: PendingFeedbackSession) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? sessions : sessions.slice(0, 3);
  const hidden = sessions.length - 3;

  function formatDate(startTime: string): string {
    const d = new Date(startTime);
    const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    return `${day} · ${time}`;
  }

  return (
    <View style={feedbackCardStyles.card}>
      <View style={feedbackCardStyles.headerRow}>
        <Ionicons name="sparkles" size={16} color={Colors.dark.primary} />
        <Text style={feedbackCardStyles.headerTitle}>Coach with AI</Text>
        <View style={feedbackCardStyles.badge}>
          <Text style={feedbackCardStyles.badgeText}>{sessions.length}</Text>
        </View>
      </View>
      <Text style={feedbackCardStyles.subLabel}>
        {sessions.length === 1 ? "1 session" : `${sessions.length} sessions`} waiting for AI coaching notes
      </Text>
      {displayed.map((sess, idx) => {
        const isGroupCard = sess.cardType === "group";
        const key = isGroupCard ? sess.sessionId : `${sess.sessionId}:${sess.players[0]?.id ?? idx}`;
        const playerLabel = isGroupCard
          ? `${sess.players.slice(0, 3).map((p) => p.name).join(", ")}${sess.playerCount > 3 ? ` +${sess.playerCount - 3}` : ""}`
          : sess.players[0]?.name ?? "";
        const typeLabel = sess.sessionType === "private" ? "Private" : sess.sessionType === "group" ? "Group" : "Semi-Priv";
        return (
          <Pressable
            key={key}
            style={feedbackCardStyles.sessionRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onSessionTap(sess);
            }}
          >
            <View style={feedbackCardStyles.sessionInfo}>
              <Text style={feedbackCardStyles.dateText}>{formatDate(sess.startTime)}</Text>
              <Text style={feedbackCardStyles.playersText} numberOfLines={1}>
                {playerLabel}
              </Text>
            </View>
            <View style={feedbackCardStyles.rightRow}>
              <View style={feedbackCardStyles.typeBadge}>
                <Text style={feedbackCardStyles.typeText}>{typeLabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.primary} />
            </View>
          </Pressable>
        );
      })}
      {!showAll && hidden > 0 && (
        <Pressable onPress={() => setShowAll(true)} style={feedbackCardStyles.showMoreBtn}>
          <Text style={feedbackCardStyles.showMoreText}>See {hidden} more</Text>
        </Pressable>
      )}
    </View>
  );
}

const feedbackCardStyles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.dark.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  badge: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  subLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    gap: 8,
  },
  sessionInfo: {
    flex: 1,
    gap: 2,
  },
  dateText: {
    fontSize: 12,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  playersText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typeBadge: {
    backgroundColor: Colors.dark.primary + "18",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  typeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  showMoreBtn: {
    paddingTop: Spacing.sm,
    alignItems: "center",
  },
  showMoreText: {
    fontSize: 12,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
});

interface PendingReview {
  id: string;
  playerId: string;
  matchDate?: string;
  result?: string;
  score?: string;
  player?: { id: string; name?: string; firstName?: string; lastName?: string };
}

function CoachMatchReviewsCard({ coachId, navigation }: { coachId: string | null; navigation: any }) {
  const { data: pending, isLoading } = useQuery<PendingReview[]>({
    queryKey: [`/api/match-intelligence/coach/${coachId}/pending-reviews`],
    enabled: !!coachId,
    staleTime: 60000,
  });

  if (!coachId || isLoading) return null;
  if (!pending || pending.length === 0) {
    return (
      <View style={[matchReviewStyles.card, { flexDirection: "row", alignItems: "center", gap: Spacing.sm }]}>
        <View style={matchReviewStyles.iconWrap}>
          <Ionicons name="tennisball-outline" size={18} color="#A78BFA" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={matchReviewStyles.title}>Match Reviews</Text>
          <Text style={matchReviewStyles.meta}>No pending match reviews from your players.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={matchReviewStyles.card}>
      <View style={matchReviewStyles.header}>
        <View style={matchReviewStyles.iconWrap}>
          <Ionicons name="tennisball-outline" size={18} color="#A78BFA" />
        </View>
        <Text style={matchReviewStyles.title}>Match Reviews Pending</Text>
        <View style={matchReviewStyles.reviewBadge}>
          <Text style={matchReviewStyles.reviewBadgeText}>{pending.length}</Text>
        </View>
      </View>

      {pending.slice(0, 3).map((item) => (
        <Pressable
          key={item.id}
          style={matchReviewStyles.row}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate("MatchReview", { matchId: item.id });
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={matchReviewStyles.playerName}>
              {item.player?.name || (item.player?.firstName && item.player?.lastName ? `${item.player.firstName} ${item.player.lastName}` : "Player")}
            </Text>
            <Text style={matchReviewStyles.meta}>
              {item.result === "win" ? "Won" : item.result === "loss" ? "Lost" : "Result"}{item.score ? ` · ${item.score}` : ""}
              {item.matchDate ? ` · ${new Date(item.matchDate).toLocaleDateString()}` : ""}
            </Text>
          </View>
          <View style={matchReviewStyles.reviewChip}>
            <Text style={matchReviewStyles.reviewChipText}>Review</Text>
          </View>
        </Pressable>
      ))}

      {pending.length > 3 ? (
        <Pressable
          style={matchReviewStyles.seeAllRow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate("MatchReview", { matchId: pending[0].id });
          }}
        >
          <Text style={matchReviewStyles.seeAllText}>
            +{pending.length - 3} more — see first pending
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#A78BFA" />
        </Pressable>
      ) : null}
    </View>
  );
}

const attendanceCardStyles = StyleSheet.create({
  card: {
    backgroundColor: "#1A0A0A",
    borderRadius: BorderRadius.lg,
    borderLeftWidth: 3,
    borderLeftColor: "#FF6B35",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  attendanceBadge: {
    backgroundColor: "#FF6B35",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  attendanceBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  subLabel: {
    color: "#FF9B70",
    fontSize: 12,
    marginBottom: Spacing.sm,
    lineHeight: 17,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,107,53,0.15)",
  },
  dotAndInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF6B35",
  },
  sessionInfo: {
    flex: 1,
  },
  seriesTitle: {
    color: "#FF9B70",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dateText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  playersText: {
    color: "#B0B8C4",
    fontSize: 12,
    marginTop: 2,
  },
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typeBadge: {
    backgroundColor: "rgba(255,107,53,0.15)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeText: {
    color: "#FF9B70",
    fontSize: 11,
    fontWeight: "600",
  },
  showMoreBtn: {
    paddingTop: 10,
    alignItems: "center",
  },
  showMoreText: {
    color: "#FF9B70",
    fontSize: 13,
    fontWeight: "600",
  },
});

const matchReviewStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "#A78BFA30",
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#A78BFA20",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
    flex: 1,
  },
  reviewBadge: {
    backgroundColor: "#A78BFA",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  reviewBadgeText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  meta: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  reviewChip: {
    backgroundColor: "#A78BFA20",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#A78BFA60",
  },
  reviewChipText: {
    color: "#A78BFA",
    fontSize: 12,
    fontWeight: "600",
  },
  more: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingTop: 2,
  },
  seeAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 4,
  },
  seeAllText: {
    ...Typography.small,
    color: "#A78BFA",
    fontWeight: "600",
  },
});

export default function DashboardScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { navigateToTab } = useTabNavigation();
  const { coach, academy, calendarData, isLoading, refetchCalendar } = useCoach();
  const { logout } = useAuth();
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const [showFreelanceWizard, setShowFreelanceWizard] = useState(false);
  const [sessionsCollapsed, setSessionsCollapsed] = useState(true);
  const [focusCollapsed, setFocusCollapsed] = useState(false);
  const [energyCollapsed, setEnergyCollapsed] = useState(false);
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentSecond, setCurrentSecond] = useState(() => Math.floor(Date.now() / 1000));
  const [selectedSessionForDetail, setSelectedSessionForDetail] = useState<Session | null>(null);
  const [detailInitialAction, setDetailInitialAction] = useState<"attendance" | "detail" | "extend" | "end" | undefined>(undefined);
  const [selectedSessionForAttendance, setSelectedSessionForAttendance] = useState<Session | null>(null);
  // Pending feedback flow: intake → AI chat (runs from dashboard, not SessionDetailDrawer)
  const { openIntake } = useIntakeModal();
  const { openAIChat } = useAIModal();
  const [showWelcome, setShowWelcome] = useState(false);
  const [showHelpCenter, setShowHelpCenter] = useState(false);
  const [showDaySessions, setShowDaySessions] = useState(false);
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSecond(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  const { data: notificationsData } = useQuery<{ id: string; isRead: boolean | null }[]>({
    queryKey: ["/api/coach/notifications"],
    enabled: !!coach?.id,
    staleTime: 30000,
  });
  const unreadNotificationCount = notificationsData?.filter(n => !n.isRead)?.length ?? 0;

  const todayDateStr = new Date().toISOString().split("T")[0];
  const weeklyCalendarPath = coach?.id 
    ? `/api/coach/calendar?coachId=${coach.id}&date=${todayDateStr}&view=week` 
    : null;
  const { data: weeklyCalendarData, refetch: refetchWeeklyCalendar } = useQuery<WeeklyCalendarData>({
    queryKey: [weeklyCalendarPath],
    enabled: !!coach?.id && !!weeklyCalendarPath,
  });

  // WebSocket for real-time updates (placed after weeklyCalendar query to access refetchWeeklyCalendar)
  useWebSocket({
    onNewMessage: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/unread-count"] });
    }, [queryClient]),
    onNewSession: useCallback(() => {
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/sessions"], refetchType: "all" });
      if (refetchCalendar) refetchCalendar();
      refetchWeeklyCalendar();
    }, [queryClient, refetchCalendar, refetchWeeklyCalendar]),
    onSessionUpdate: useCallback(() => {
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/sessions"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/me/pending-attendance"] });
      if (refetchCalendar) refetchCalendar();
      refetchWeeklyCalendar();
    }, [queryClient, refetchCalendar, refetchWeeklyCalendar]),
    onConnected: useCallback(() => {
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/notifications"] });
      if (refetchCalendar) refetchCalendar();
    }, [queryClient, refetchCalendar]),
  });

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchCalendar(),
        refetchWeeklyCalendar(),
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && key.startsWith('/api/coach');
          }
        }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchCalendar, refetchWeeklyCalendar, queryClient]);
  
  const allSessions = weeklyCalendarData?.ownSessions || calendarData?.ownSessions || [];

  // Pulse animation for live indicator
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.3);
  
  // Gaming animations
  const glowPulse = useSharedValue(0);
  const avatarGlow = useSharedValue(0.5);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(1.8, { duration: 1200, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    pulseOpacity.value = withRepeat(
      withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    
    // Continuous glow pulse
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    
    // Avatar glow breathing
    avatarGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    
  }, []);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));
  
  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowPulse.value, [0, 1], [0.3, 0.8]),
    transform: [{ scale: interpolate(glowPulse.value, [0, 1], [1, 1.05]) }],
  }));
  
  const avatarGlowStyle = useAnimatedStyle(() => ({
    opacity: avatarGlow.value,
    transform: [{ scale: interpolate(avatarGlow.value, [0.5, 1], [1, 1.1]) }],
  }));
  const [insightsCollapsed, setInsightsCollapsed] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [alertsCollapsed, setAlertsCollapsed] = useState(false);

  const today = new Date();
  
  const getDateForOffset = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date;
  };
  
  const selectedDate = getDateForOffset(selectedDayOffset);
  
  const todaysSessions = useMemo(() => filterSessionsByDate(allSessions, today), [allSessions]);
  const selectedDaySessions = useMemo(() => filterSessionsByDate(allSessions, selectedDate), [allSessions, selectedDayOffset]);
  
  const getDayLabel = (offset: number) => {
    if (offset === 0) return "TODAY";
    if (offset === 1) return "TOMORROW";
    if (offset === -1) return "YESTERDAY";
    return getDateForOffset(offset).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  };

  const nextSession = useMemo(() => {
    const now = new Date();
    const upcoming = todaysSessions
      .filter((s) => new Date(s.startTime) > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return upcoming[0] || null;
  }, [todaysSessions]);

  const sessionForCountdown = useMemo(() => {
    const now = new Date();
    
    const liveSession = todaysSessions.find((s) => {
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      return now >= start && now < end;
    });
    if (liveSession) return liveSession;
    
    if (!nextSession) return null;
    const sessionStart = new Date(nextSession.startTime);
    const minutesUntil = (sessionStart.getTime() - now.getTime()) / (1000 * 60);
    if (minutesUntil <= 30 && minutesUntil > 0) {
      return nextSession;
    }
    return null;
  }, [todaysSessions, nextSession, currentSecond]);

  const coachStats = useMemo(() => {
    const maxDailyMinutes = 360;
    const totalMinutes = todaysSessions.reduce((acc, s) => acc + s.duration, 0);
    const completedMinutes = todaysSessions
      .filter((s) => new Date(s.endTime) < new Date())
      .reduce((acc, s) => acc + s.duration, 0);
    const remainingMinutes = totalMinutes - completedMinutes;
    
    const loadPercent = Math.min(100, Math.round((totalMinutes / maxDailyMinutes) * 100));
    const staminaPercent = Math.max(0, 100 - loadPercent);
    const impactPercent = totalMinutes > 0 ? Math.round((completedMinutes / totalMinutes) * 100) : 0;
    
    let energyState: "fullpower" | "charged" | "draining" | "depleted" = "fullpower";
    if (staminaPercent <= 20) energyState = "depleted";
    else if (staminaPercent <= 50) energyState = "draining";
    else if (staminaPercent < 100) energyState = "charged";
    
    // Day intensity for personality
    let dayIntensity: "rest" | "light" | "normal" | "heavy" = "rest";
    if (totalMinutes === 0) dayIntensity = "rest";
    else if (totalMinutes <= 120) dayIntensity = "light";
    else if (totalMinutes <= 240) dayIntensity = "normal";
    else dayIntensity = "heavy";
    
    return { totalMinutes, completedMinutes, remainingMinutes, staminaPercent, impactPercent, energyState, dayIntensity };
  }, [todaysSessions]);

  // Fetch burnout risk for recovery-aware stamina calculation
  const { data: burnoutRiskData } = useQuery<{
    riskScore: number;
    riskLevel: string;
    metrics: {
      restDaysLastWeek: number;
      avgDailyMinutesPast: number;
    };
  }>({
    queryKey: ["/api/coaches", coach?.id, "burnout-risk"],
    enabled: !!coach?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Calculate recovery-aware stamina: uses burnout risk which accounts for rest days
  const recoveryAwareStamina = useMemo(() => {
    if (!burnoutRiskData) return null;
    // Stamina = 100 - burnout risk (so more rest = higher stamina)
    return Math.max(0, 100 - burnoutRiskData.riskScore);
  }, [burnoutRiskData]);

  // Generate smart insights for coach
  const coachInsights = useMemo(() => {
    const insights: Array<{
      id: string;
      type: "level_up" | "attendance" | "streak" | "earnings" | "alert";
      title: string;
      description: string;
    }> = [];
    
    // Sessions insight
    if (todaysSessions.length > 5) {
      insights.push({
        id: "busy-day",
        type: "attendance",
        title: "Heavy Load Today",
        description: `${todaysSessions.length} sessions scheduled - pace yourself!`,
      });
    } else if (todaysSessions.length === 0) {
      insights.push({
        id: "rest-day",
        type: "streak",
        title: "Rest Day",
        description: "No sessions today - enjoy recovery time",
      });
    }
    
    // Performance insight based on completed sessions
    const completedToday = todaysSessions.filter(s => s.status === "completed").length;
    if (completedToday > 0 && todaysSessions.length > 0) {
      const completionRate = Math.round((completedToday / todaysSessions.length) * 100);
      if (completionRate >= 80) {
        insights.push({
          id: "great-progress",
          type: "earnings",
          title: "Great Progress",
          description: `${completionRate}% of today's sessions completed`,
        });
      }
    }
    
    // Stamina warning
    if (coachStats.staminaPercent <= 30) {
      insights.push({
        id: "low-stamina",
        type: "alert",
        title: "Low Energy",
        description: "Consider pacing or taking breaks",
      });
    }
    
    return insights;
  }, [todaysSessions, coachStats]);

  // Fetch coach XP from API
  const { data: coachXpData } = useQuery<{
    level: number;
    totalXp: number;
    currentLevelXp: number;
    requiredForLevel: number;
    xpPercent: number;
  }>({
    queryKey: ["/api/coach", coach?.id, "xp"],
    enabled: !!coach?.id,
  });
  
  
  const coachXP = useMemo(() => {
    if (coachXpData) {
      return {
        level: coachXpData.level,
        currentXP: coachXpData.currentLevelXp,
        requiredXP: coachXpData.requiredForLevel,
        xpPercent: coachXpData.xpPercent,
      };
    }
    // Fallback for initial load - matches server loop-based calculation
    const level = coach?.level || 1;
    const totalXp = coach?.totalXp || 0;
    
    // Calculate XP thresholds using same logic as server
    // Each level requires: 500 + (level-1) * 100 XP
    let accumulatedXp = 0;
    for (let lvl = 1; lvl < level; lvl++) {
      accumulatedXp += 500 + (lvl - 1) * 100;
    }
    const requiredXP = 500 + (level - 1) * 100;
    const currentXP = Math.max(0, totalXp - accumulatedXp);
    const xpPercent = Math.min(100, Math.max(0, requiredXP > 0 ? Math.round((currentXP / requiredXP) * 100) : 0));
    return { level, currentXP, requiredXP, xpPercent };
  }, [coachXpData, coach?.level, coach?.totalXp]);

  // Fetch pending booking requests for this coach
  const { data: pendingBookingRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/coach/booking-requests?status=pending"],
    enabled: !!coach?.id,
    staleTime: 30000,
  });

  // === GPS LOCATION TRACKING ===
  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const lastSentLocationRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);
  const [locationDeniedPermanently, setLocationDeniedPermanently] = useState(false);
  const [locationBannerDismissed, setLocationBannerDismissed] = useState(false);

  const sendLocationToServer = useCallback(async (lat: number, lng: number) => {
    try {
      await apiRequest("PATCH", "/api/coach/me/location", { lat, lng });
      lastSentLocationRef.current = { lat, lng, ts: Date.now() };
    } catch (err) {
      // silently ignore location update errors
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function setupLocationTracking() {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted" || cancelled) {
        if (perm.status === "denied" && !perm.canAskAgain && !cancelled) {
          setLocationDeniedPermanently(true);
        }
        return;
      }

      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!cancelled) {
        sendLocationToServer(initial.coords.latitude, initial.coords.longitude);
      }

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 50,
          timeInterval: 2 * 60 * 1000,
        },
        (loc) => {
          if (cancelled) return;
          const { latitude, longitude } = loc.coords;
          const last = lastSentLocationRef.current;
          const now = Date.now();
          if (!last || now - last.ts >= 2 * 60 * 1000) {
            sendLocationToServer(latitude, longitude);
          } else {
            const dLat = latitude - last.lat;
            const dLng = longitude - last.lng;
            const approxKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
            if (approxKm > 0.05) {
              sendLocationToServer(latitude, longitude);
            }
          }
        }
      );

      if (!cancelled) {
        locationWatcherRef.current = sub;
      } else {
        sub.remove();
      }
    }

    if (coach?.id && Platform.OS !== "web") {
      setupLocationTracking().catch(() => {});
    }

    return () => {
      cancelled = true;
      if (Platform.OS !== "web" && locationWatcherRef.current) {
        locationWatcherRef.current.remove();
        locationWatcherRef.current = null;
      }
    };
  }, [coach?.id, sendLocationToServer]);

  // === ETA QUERY FOR TRAVEL BANNER ===
  const { data: nextSessionEta } = useQuery<{
    sessionId?: string;
    locationName?: string;
    sessionStart?: string;
    minutesToSession?: number;
    minutes?: number;
    sameLocation?: boolean;
    shouldLeaveInMinutes?: number;
    eta?: null;
    reason?: string;
  } | null>({
    queryKey: ["/api/coach/me/next-session-eta"],
    enabled: !!coach?.id,
    refetchInterval: 60 * 1000,
    staleTime: 55 * 1000,
  });

  // Fetch coach reviews for dashboard card (E1)
  const { data: coachReviewsData } = useQuery<{ stats: { totalReviews: number; averageOverall: number | null } | null; reviews: any[] }>({
    queryKey: ["/api/coach/my-reviews"],
    enabled: !!coach?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: pendingAttendanceSessions = [] } = useQuery<PendingAttendanceSession[]>({
    queryKey: ["/api/coach/me/pending-attendance"],
    enabled: !!coach?.id,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: pendingFeedbackSessions = [] } = useQuery<PendingFeedbackSession[]>({
    queryKey: ["/api/coach/sessions/pending-feedback"],
    enabled: !!coach?.id,
    staleTime: 5 * 60 * 1000,
  });

  const pendingFeedbackCount = useMemo(() => {
    const now = new Date();
    const pendingSessions = todaysSessions.filter(
      (s) => new Date(s.endTime) < now && s.status !== "completed"
    );
    return pendingSessions.reduce((total, s) => total + (s.players?.length || 0), 0);
  }, [todaysSessions]);

  const currentSession = useMemo(() => {
    const now = new Date();
    return todaysSessions.find((session) => {
      const start = new Date(session.startTime);
      const end = new Date(session.endTime);
      return now >= start && now < end;
    });
  }, [todaysSessions]);

  const sessionTimeRemaining = useMemo(() => {
    if (!currentSession) return "--:--";
    const now = new Date();
    const end = new Date(currentSession.endTime);
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return "0:00";
    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [currentSession, currentSecond]);

  const getTimeUntil = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const diff = start.getTime() - now.getTime();
    if (diff <= 0) return "Now";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes} min`;
  };

  const alerts: Alert[] = useMemo(() => {
    const result: Alert[] = [];
    return result;
  }, []);

  const handleNavigate = (screen: string, params?: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const screenMap: Record<string, string> = {
      EditProfile: "CoachProfile",
    };
    const targetScreen = screenMap[screen] || screen;
    const tabNames = ["Dashboard", "Players", "Calendar", "Coaching"];
    if (tabNames.includes(targetScreen)) {
      navigateToTab(targetScreen);
    } else {
      (navigation as any).navigate(targetScreen, params);
    }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("coach.dashboard.goodMorning");
    if (hour < 18) return t("coach.dashboard.goodAfternoon");
    return t("coach.dashboard.goodEvening");
  };

  const dayPersonality = useMemo(() => {
    const sessionCount = todaysSessions.length;
    const totalMinutes = coachStats.totalMinutes;
    
    if (sessionCount === 0) {
      return { label: t("coach.dashboard.restDay"), color: Colors.dark.xpCyan };
    }
    if (totalMinutes <= 120) {
      return { label: t("coach.dashboard.lightDay"), color: Colors.dark.primary };
    }
    if (totalMinutes <= 240) {
      return { label: t("coach.dashboard.normalDay"), color: Colors.dark.gold };
    }
    return { label: t("coach.dashboard.heavyDay"), color: Colors.dark.orange };
  }, [todaysSessions.length, coachStats.totalMinutes, t]);

  const selectedDayPersonality = useMemo(() => {
    const sessions = selectedDaySessions;
    const totalMinutes = sessions.reduce((acc, s) => acc + s.duration, 0);
    
    if (sessions.length === 0) {
      return { label: t("coach.dashboard.restDay"), color: Colors.dark.xpCyan };
    }
    if (totalMinutes <= 120) {
      return { label: t("coach.dashboard.lightDay"), color: Colors.dark.primary };
    }
    if (totalMinutes <= 240) {
      return { label: t("coach.dashboard.normalDay"), color: Colors.dark.gold };
    }
    return { label: t("coach.dashboard.heavyDay"), color: Colors.dark.orange };
  }, [selectedDaySessions, t]);
  
  const selectedDayStats = useMemo(() => {
    const totalMinutes = selectedDaySessions.reduce((acc, s) => acc + s.duration, 0);
    return { sessionCount: selectedDaySessions.length, totalMinutes };
  }, [selectedDaySessions]);
  
  const getSelectedDayFocusMessage = () => {
    if (selectedDaySessions.length === 0) {
      return { primary: t("coach.dashboard.restDay"), secondary: t("coach.dashboard.noSessionsScheduled") };
    }
    const firstSession = selectedDaySessions.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    )[0];
    const context = getSessionContext(firstSession);
    return { 
      primary: `${selectedDaySessions.length} Session${selectedDaySessions.length > 1 ? 's' : ''}`, 
      secondary: `First: ${formatTime(firstSession.startTime)} - ${context}` 
    };
  };

  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case "private": return t("coach.dashboard.sessionTypePrivate");
      case "semi_private": return t("coach.dashboard.sessionTypeSemiPrivate");
      case "group": return t("coach.dashboard.sessionTypeGroup");
      case "physical": return t("coach.dashboard.sessionTypePhysical");
      default: return type;
    }
  };

  const getSessionContext = (session: Session) => {
    const type = getSessionTypeLabel(session.sessionType);
    const court = calendarData?.courts?.find(c => c.id === session.courtId);
    const courtName = court?.name || "";
    const timeStr = `${formatTime(session.startTime)} - ${formatTime(session.endTime)}`;
    const parts = [type];
    if (courtName) parts.push(courtName);
    const context = parts.join(" · ");
    return context || timeStr;
  };

  const getFocusMessage = () => {
    if (currentSession) {
      const context = getSessionContext(currentSession);
      return { primary: t("coach.dashboard.inSession"), secondary: context || `${formatTime(currentSession.startTime)} - ${formatTime(currentSession.endTime)}` };
    }
    if (nextSession) {
      const context = getSessionContext(nextSession);
      return { primary: t("coach.dashboard.nextSessionIn", { time: getTimeUntil(nextSession.startTime) }), secondary: context };
    }
    if (todaysSessions.length === 0) {
      if (pendingFeedbackCount > 0) {
        return { primary: t("coach.dashboard.xpAvailable"), secondary: t("coach.dashboard.completeFeedbackForXp", { count: pendingFeedbackCount }) };
      }
      return { primary: t("coach.dashboard.offCourt"), secondary: t("coach.dashboard.perfectTimeToReview") };
    }
    return { primary: t("coach.dashboard.matchPoint"), secondary: t("coach.dashboard.allSessionsComplete") };
  };

  const coachChecklistSteps: ChecklistStep[] = useMemo(() => {
    const hasPlayers = (calendarData?.ownSessions || []).some(s => s.players && s.players.length > 0);
    const hasSessions = (calendarData?.ownSessions || []).length > 0;
    const hasProfile = !!coach?.name;
    
    return [
      {
        id: "complete_profile",
        icon: "person-circle",
        title: "Complete Your Profile",
        description: "Add your photo, bio, and coaching specialties",
        actionLabel: "Go to Profile",
        onAction: () => navigation.navigate("CoachProfile" as never),
        isCompleted: hasProfile && !!coach?.photoUrl,
      },
      {
        id: "view_players",
        icon: "people",
        title: "View Your Players",
        description: "See who's assigned to you and their progress",
        actionLabel: "View Players",
        onAction: () => navigateToTab("Players"),
        isCompleted: hasPlayers,
      },
      {
        id: "create_session",
        icon: "calendar",
        title: "Create Your First Session",
        description: "Schedule a training session with your players",
        actionLabel: "Go to Calendar",
        onAction: () => navigateToTab("Calendar"),
        isCompleted: hasSessions,
      },
      {
        id: "give_feedback",
        icon: "chatbubble-ellipses",
        title: "Give Your First Feedback",
        description: "Rate a player's performance after a session",
        actionLabel: "View Sessions",
        onAction: () => navigateToTab("Coaching"),
        isCompleted: false,
      },
      {
        id: "explore_templates",
        icon: "document-text",
        title: "Explore Lesson Templates",
        description: "Use pre-built lesson plans to structure your sessions",
        actionLabel: "View Templates",
        onAction: () => navigation.navigate("Templates" as never),
        isCompleted: false,
      },
    ];
  }, [coach, calendarData, navigation, navigateToTab]);

  const coachTips = [
    { id: "tip_feedback", icon: "chatbubble-ellipses", text: "Tip: Give feedback right after a session for the most accurate assessment" },
    { id: "tip_templates", icon: "document-text", text: "Tip: Use lesson templates to save time planning your sessions" },
    { id: "tip_attendance", icon: "checkmark-circle", text: "Tip: Mark attendance before the session ends for auto credit deduction" },
    { id: "tip_wellness", icon: "heart", text: "Tip: Log your wellness regularly to track your coaching energy levels" },
    { id: "tip_calendar", icon: "calendar", text: "Tip: Swipe on the calendar to see your full week schedule" },
  ];

  const coachFAQs = [
    { question: "How do I create a new session?", answer: "Go to your Calendar tab and tap the + button. Choose the session type, add players, select a court and time, then confirm.", category: "Sessions" },
    { question: "How do I give feedback to a player?", answer: "After completing a session, go to Coaching tab. Select the session and tap on a player to rate their performance across the 6 skill pillars.", category: "Feedback" },
    { question: "What are the skill pillars?", answer: "The 6 pillars are: Serve, Return, Forehand, Backhand, Net Play, and Movement. Each is rated 0-2 to track player development.", category: "Progress" },
    { question: "How do credits work?", answer: "Players buy credit packages (private, semi-private, group). When you mark attendance, the appropriate credit is automatically deducted.", category: "Billing" },
    { question: "How do I switch between roles?", answer: "If you have multiple roles (coach + player), tap the mode switcher at the top of your screen to switch views.", category: "General" },
    { question: "How do I mark attendance?", answer: "Open a session from your calendar, tap 'Attendance', and mark each player as Present, Absent, or Late.", category: "Sessions" },
  ];

  const [showRoleSwitchGuide, setShowRoleSwitchGuide] = useState(false);
  const [showNotificationGuide, setShowNotificationGuide] = useState(false);
  const [showFirstCelebration, setShowFirstCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ title: "", description: "", icon: "trophy", xpReward: 0 });

  const coachFeatureUsage = useMemo(() => [
    { id: "sessions", name: "Session Management", icon: "calendar", isUsed: true },
    { id: "feedback", name: "Player Feedback", icon: "chatbubble-ellipses", isUsed: false },
    { id: "templates", name: "Lesson Templates", icon: "document-text", isUsed: false },
    { id: "wellness", name: "Wellness Tracking", icon: "heart", isUsed: false },
    { id: "attendance", name: "Attendance", icon: "checkmark-circle", isUsed: true },
  ], []);

  if (!coach) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      </View>
    );
  }

  const coachWelcomeSlides = [
    {
      icon: "tennisball",
      iconColor: "#2ECC40",
      title: "Welcome, Coach!",
      description: "You're now part of Glow Up Sports. This app helps you manage your players, track their progress, and deliver world-class coaching.",
    },
    {
      icon: "calendar",
      iconColor: "#00BCD4",
      title: "Manage Your Schedule",
      description: "View your calendar, create sessions, and track attendance. Your players will be notified automatically when you schedule or update sessions.",
    },
    {
      icon: "stats-chart",
      iconColor: "#FF9800",
      title: "Track Player Progress",
      description: "Give detailed feedback after each session. Rate players across 6 skill pillars and watch them grow through the Glow leveling system.",
    },
    {
      icon: "rocket",
      iconColor: "#9B59B6",
      title: "Let's Get Started!",
      description: "Check your dashboard for your Getting Started checklist. Complete each step to set up your coaching profile and start making an impact!",
    },
  ];

  const focusMessage = getFocusMessage();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      {/* Collapsible Mode Switcher */}
      <CollapsibleModeSwitcher />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.footerCollapsed + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.dark.primary}
            colors={[Colors.dark.primary]}
          />
        }
      >
        {/* GETTING STARTED CHECKLIST */}
        <GettingStartedChecklist
          role="coach"
          steps={coachChecklistSteps}
        />

        <QuickTipsBanner role="coach" tips={coachTips} />

        <PlatformUsageProgress
          role="coach"
          features={coachFeatureUsage}
        />

        {/* === GAMING PLAYER CARD HEADER === */}
        <View style={styles.playerCard}>
          {/* Neon border glow effect */}
          <Animated.View style={[styles.playerCardGlow, glowAnimatedStyle, { pointerEvents: "none" }]} />
          
          {/* Glass panel background */}
          <LinearGradient
            colors={["rgba(46, 204, 64, 0.08)", "rgba(0, 212, 255, 0.04)", "rgba(26, 26, 26, 0.95)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.playerCardGradient}
          >
            {/* Top accent line */}
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan, Colors.dark.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.playerCardTopLine}
            />
            
            {/* Main content row */}
            <View style={styles.playerCardContent}>
              {/* Left: Holographic Avatar */}
              <Pressable
                style={styles.holoAvatarContainer}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowStatusPanel(true);
                }}
              >
                {/* Outer glow ring */}
                <Animated.View style={[styles.avatarOuterGlow, avatarGlowStyle]}>
                  <LinearGradient
                    colors={[Colors.dark.primary + "60", Colors.dark.xpCyan + "40", Colors.dark.primary + "60"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarGlowGradient}
                  />
                </Animated.View>
                
                {/* Avatar frame */}
                <View style={styles.avatarFrame}>
                  <LinearGradient
                    colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarBorder}
                  >
                    {coach?.photoUrl ? (
                      Platform.OS === 'web' ? (
                        <RNImage
                          source={{ uri: buildPhotoUrl(coach.photoUrl)! }}
                          style={styles.avatarPhoto}
                          resizeMode="cover"
                        />
                      ) : (
                        <Image
                          source={{ uri: buildPhotoUrl(coach.photoUrl)! }}
                          style={styles.avatarPhoto}
                          contentFit="cover"
                        />
                      )
                    ) : (
                      <View style={styles.avatarInnerBg}>
                        <Ionicons name="person" size={28} color={Colors.dark.primary} />
                      </View>
                    )}
                  </LinearGradient>
                </View>
                
                {/* Level emblem - uses theme gold colors */}
                <Animated.View style={[styles.levelEmblem, avatarGlowStyle]}>
                  <LinearGradient
                    colors={[Colors.dark.gold, Colors.dark.orange, Colors.dark.gold]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.levelEmblemGradient}
                  >
                    <Text style={styles.levelEmblemText}>{coachXP.level}</Text>
                  </LinearGradient>
                </Animated.View>
              </Pressable>
              
              {/* Center: Player Info */}
              <View style={styles.playerInfo}>
                <Text style={styles.playerRank}>{t("coach.dashboard.coachLabel")}</Text>
                <Text style={styles.playerName}>{coach.name}</Text>
                <View style={styles.academyRow}>
                  <Ionicons name="shield" size={12} color={Colors.dark.xpCyan} />
                  <AcademySwitcher />
                </View>
                
                {/* XP Progress Ring */}
                <View style={styles.xpProgressSection}>
                  <View style={styles.xpBarWrapper}>
                    <View style={styles.xpBarTrack}>
                      <LinearGradient
                        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.xpBarProgress, { width: `${coachXP.xpPercent}%` }]}
                      />
                      <Animated.View style={[styles.xpBarShine, glowAnimatedStyle]} />
                    </View>
                    <View style={styles.xpLabels}>
                      <Text style={styles.xpCurrent}>{coachXP.currentXP} XP</Text>
                      <Text style={styles.xpRequired}>/ {coachXP.requiredXP}</Text>
                    </View>
                  </View>
                </View>
              </View>
              
              {/* Right: Quick Actions */}
              <View style={styles.playerActions}>
                <LanguageHeaderButton />
                <Pressable
                  style={styles.actionBtnGlow}
                  onPress={() => handleNavigate("Notifications")}
                  hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                >
                  <View style={styles.actionBtnInner}>
                    <Ionicons name="notifications" size={20} color={Colors.dark.xpCyan} />
                  </View>
                  {unreadNotificationCount > 0 ? (
                    <View style={styles.notifBadge}>
                      <Text style={styles.notifBadgeText}>
                        {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* === BIRTHDAY OVERVIEW === */}
        <BirthdayOverviewCard />

        {/* === ACTION NEEDED - Primary CTA === */}
        {(pendingFeedbackCount > 0 || alerts.length > 0) && (
          <View style={styles.actionNeededSection}>
            <ActionNeededCard
              title={t("coach.dashboard.actionNeeded")}
              actions={[
                ...(pendingFeedbackCount > 0
                  ? [
                      {
                        id: "feedback",
                        label: t("coach.dashboard.playersNeedFeedbackToday"),
                        count: pendingFeedbackCount,
                        icon: "chatbubble-ellipses" as const,
                        priority: "high" as const,
                      },
                    ]
                  : []),
                ...alerts.map((alert) => ({
                  id: alert.id,
                  label: alert.message,
                  count: 1,
                  icon:
                    alert.type === "unpaid"
                      ? ("card" as const)
                      : alert.type === "absent"
                      ? ("person-remove" as const)
                      : ("alert-circle" as const),
                  priority: alert.priority,
                })),
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                navigateToTab("Coaching", { screen: "feedback" });
              }}
              ctaText={t("coach.dashboard.reviewNow")}
            />
          </View>
        )}

        {/* === MY REVIEWS CARD (E1) === */}
        {(coachReviewsData?.stats?.totalReviews ?? 0) > 0 ? (
          <Pressable
            style={dashReviewStyles.reviewsCard}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              navigation.navigate("MyReviews");
            }}
          >
            <View style={dashReviewStyles.reviewsLeft}>
              <View style={dashReviewStyles.reviewsIconRow}>
                <Ionicons name="star" size={18} color={Colors.dark.gold} />
                <Text style={dashReviewStyles.reviewsAvg}>
                  {(coachReviewsData!.stats!.averageOverall ?? 0).toFixed(1)}
                </Text>
              </View>
              <Text style={dashReviewStyles.reviewsCountText}>
                {coachReviewsData!.stats!.totalReviews} player review{coachReviewsData!.stats!.totalReviews !== 1 ? "s" : ""}
              </Text>
              {(coachReviewsData?.reviews ?? []).slice(0, 1).map((r: any) => (
                r.whatDoesWell ? (
                  <Text key={r.id} style={dashReviewStyles.reviewsExcerpt} numberOfLines={1}>
                    "{r.whatDoesWell}"
                  </Text>
                ) : null
              ))}
            </View>
            <View style={dashReviewStyles.reviewsRight}>
              <Text style={dashReviewStyles.reviewsSeeAll}>See all reviews</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.xpCyan} />
            </View>
          </Pressable>
        ) : null}

        {/* === PENDING BOOKING REQUESTS === */}
        {pendingBookingRequests.length > 0 && (
          <View style={styles.bookingRequestsSection}>
            <View style={styles.bookingRequestsHeader}>
              <View style={styles.bookingRequestsTitleRow}>
                <Ionicons name="calendar-number" size={18} color={Colors.dark.primary} />
                <Text style={styles.bookingRequestsTitle}>
                  Booking Requests
                </Text>
                <View style={styles.bookingRequestsBadge}>
                  <Text style={styles.bookingRequestsBadgeText}>{pendingBookingRequests.length}</Text>
                </View>
              </View>
            </View>
            {pendingBookingRequests.slice(0, 3).map((req: any) => {
              const start = new Date(req.requestedStart);
              const end = new Date(req.requestedEnd);
              const dateStr = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              const timeStr = `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
              return (
                <View key={req.id} style={styles.bookingRequestCard}>
                  <View style={styles.bookingRequestCardLeft}>
                    <Text style={styles.bookingRequestSessionType}>
                      {req.sessionType === "private" ? "Private Lesson" : req.sessionType === "semi_private" ? "Semi-Private" : req.sessionType === "group" ? "Group Session" : "Open Play"}
                    </Text>
                    <Text style={styles.bookingRequestDateTime}>{dateStr} · {timeStr}</Text>
                    <Text style={styles.bookingRequestDuration}>{req.duration} min</Text>
                    {!!req.playerNote && (
                      <View style={styles.bookingRequestFocusTag}>
                        <Ionicons name="sparkles" size={12} color={Colors.dark.xpCyan} />
                        <Text style={styles.bookingRequestFocusText} numberOfLines={2}>{req.playerNote}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.bookingRequestActions}>
                    <Pressable
                      style={[styles.bookingRequestBtn, styles.bookingRequestApproveBtn]}
                      onPress={async () => {
                        try {
                          await apiRequest("POST", `/api/coach/booking-requests/${req.id}/approve`, {});
                          queryClient.invalidateQueries({ queryKey: ["/api/coach/booking-requests?status=pending"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
                        } catch (e) {
                          RNAlert.alert("Error", "Failed to approve request");
                        }
                      }}
                    >
                      <Ionicons name="checkmark" size={16} color="#FFF" />
                    </Pressable>
                    <Pressable
                      style={[styles.bookingRequestBtn, styles.bookingRequestDeclineBtn]}
                      onPress={async () => {
                        try {
                          await apiRequest("POST", `/api/coach/booking-requests/${req.id}/decline`, {});
                          queryClient.invalidateQueries({ queryKey: ["/api/coach/booking-requests?status=pending"] });
                        } catch (e) {
                          RNAlert.alert("Error", "Failed to decline request");
                        }
                      }}
                    >
                      <Ionicons name="close" size={16} color="#FFF" />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* === LOCATION DENIED BANNER === */}
        {locationDeniedPermanently && !locationBannerDismissed && Platform.OS === "ios" ? (
          <View style={styles.locationDeniedBanner}>
            <Ionicons name="location-outline" size={18} color="#FFD700" />
            <Pressable
              style={{ flex: 1 }}
              onPress={async () => {
                try { await Linking.openSettings(); } catch {}
              }}
            >
              <Text style={styles.locationDeniedText}>
                Enable location in Settings to get departure alerts between courts
              </Text>
              <Text style={styles.locationDeniedAction}>Open Settings</Text>
            </Pressable>
            <Pressable
              onPress={() => setLocationBannerDismissed(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={16} color="#FFD700" />
            </Pressable>
          </View>
        ) : null}

        {/* === TRAVEL ALERT BANNER === */}
        {nextSessionEta && !nextSessionEta.sameLocation && nextSessionEta.locationName && typeof nextSessionEta.shouldLeaveInMinutes === "number" && nextSessionEta.shouldLeaveInMinutes <= 45 ? (
          <TravelAlertBanner
            locationName={nextSessionEta.locationName}
            shouldLeaveInMinutes={nextSessionEta.shouldLeaveInMinutes}
          />
        ) : null}

        {/* === COURT COMMAND - Tennis Control Centre === */}
        
        <View style={styles.missionConsole}>
          {/* Neon frame */}
          <View style={styles.missionFrame}>
            <LinearGradient
              colors={[Colors.dark.primary + "40", "transparent", Colors.dark.xpCyan + "40"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.missionFrameTop}
            />
          </View>
          
          <LinearGradient
            colors={["rgba(0, 0, 0, 0.6)", "rgba(45, 45, 45, 0.8)"]}
            style={styles.missionGradient}
          >
            {/* Court Command Header */}
            <View style={styles.missionHeader}>
              <View style={styles.missionTitleSection}>
                <View style={styles.missionIconWrapper}>
                  <Ionicons name="tennisball" size={16} color={Colors.dark.xpCyan} />
                </View>
                <Text style={styles.missionTitle}>{t("coach.dashboard.courtCommand")}</Text>
              </View>
              
              {/* Day Navigation Pills + Collapse Toggle */}
              <View style={styles.missionControls}>
                <View style={styles.dayPills}>
                  <Pressable 
                    style={styles.dayPillArrow}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedDayOffset(prev => Math.max(prev - 1, -7));
                    }}
                  >
                    <Ionicons name="caret-back" size={14} color={selectedDayOffset <= -7 ? Colors.dark.tabIconDefault : Colors.dark.primary} />
                  </Pressable>
                  
                  <View style={styles.dayPillCenter}>
                    <Text style={styles.dayPillLabel}>{getDayLabel(selectedDayOffset)}</Text>
                  </View>
                  
                  <Pressable 
                    style={styles.dayPillArrow}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedDayOffset(prev => Math.min(prev + 1, 7));
                    }}
                  >
                    <Ionicons name="caret-forward" size={14} color={selectedDayOffset >= 7 ? Colors.dark.tabIconDefault : Colors.dark.primary} />
                  </Pressable>
                </View>
                
                <Pressable 
                  style={styles.collapseToggle}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFocusCollapsed(!focusCollapsed);
                  }}
                >
                  <Ionicons 
                    name={focusCollapsed ? "chevron-down" : "chevron-up"} 
                    size={16} 
                    color={Colors.dark.tabIconDefault} 
                  />
                </Pressable>
              </View>
            </View>
            
            {/* Date Row */}
            <View style={styles.dateRow}>
              <Text style={styles.dateText}>
                {selectedDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </Text>
              <View style={[styles.intensityChip, { backgroundColor: selectedDayPersonality.color + "25" }]}>
                <View style={[styles.intensityDot, { backgroundColor: selectedDayPersonality.color }]} />
                <Text style={[styles.intensityLabel, { color: selectedDayPersonality.color }]}>
                  {selectedDayPersonality.label.toUpperCase()}
                </Text>
              </View>
            </View>
            
            {/* Back to Today */}
            {selectedDayOffset !== 0 ? (
              <Pressable 
                style={styles.backToTodayChip}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedDayOffset(0);
                }}
              >
                <Ionicons name="return-down-back" size={12} color={Colors.dark.primary} />
                <Text style={styles.backToTodayLabel}>{t("coach.dashboard.returnToToday")}</Text>
              </Pressable>
            ) : null}

            {focusCollapsed ? null : (
              <>
                {/* Main Mission Display */}
                <View style={styles.missionDisplay}>
                  {selectedDayOffset === 0 && currentSession ? (
                    <Pressable 
                      style={styles.liveHud}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setSelectedSessionForDetail(currentSession);
                      }}
                    >
                      <View style={styles.liveHudBgClean}>
                        <View style={styles.liveHudContent}>
                          <View style={styles.liveHudLeft}>
                            <Text style={styles.countdownTimer}>{sessionTimeRemaining}</Text>
                            <Text style={styles.countdownLabel}>{t("coach.dashboard.remaining")}</Text>
                            
                            <View style={styles.sessionMeta}>
                              <Text style={styles.sessionMetaText}>
                                {getSessionTypeLabel(currentSession.sessionType)} {calendarData?.courts?.find(c => c.id === currentSession.courtId)?.name ? `· ${calendarData?.courts?.find(c => c.id === currentSession.courtId)?.name}` : ""}
                              </Text>
                            </View>
                          </View>
                          
                          <View style={styles.liveHudRight}>
                            <Animated.View style={[styles.liveCircleGlow, pulseAnimatedStyle]} />
                            <View style={styles.liveCircleBadge}>
                              <Text style={styles.liveCircleText}>{t("coach.dashboard.live")}</Text>
                              <Text style={styles.liveCircleSubtext}>{t("coach.dashboard.inSessionLabel")}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  ) : selectedDayOffset === 0 && nextSession ? (
                    <Pressable 
                      style={styles.missionContent}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setSelectedSessionForDetail(nextSession);
                      }}
                    >
                      <Text style={styles.missionPrimary}>{focusMessage.primary}</Text>
                      <Text style={styles.missionSecondary}>{focusMessage.secondary}</Text>
                      <View style={styles.tapHint}>
                        <Ionicons name="hand-left-outline" size={14} color={Colors.dark.primary} />
                        <Text style={styles.tapHintText}>TAP FOR OPTIONS</Text>
                      </View>
                    </Pressable>
                  ) : selectedDayOffset === 0 ? (
                    <Pressable
                      style={styles.missionContent}
                      onPress={() => {
                        if (selectedDaySessions.length > 0) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          setShowDaySessions(true);
                        }
                      }}
                    >
                      <Text style={styles.missionPrimary}>{focusMessage.primary}</Text>
                      <Text style={styles.missionSecondary}>{focusMessage.secondary}</Text>
                      {selectedDaySessions.length > 0 ? (
                        <View style={styles.tapHint}>
                          <Ionicons name="list-outline" size={14} color={Colors.dark.primary} />
                          <Text style={styles.tapHintText}>TAP TO VIEW SESSIONS</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.missionContent}
                      onPress={() => {
                        if (selectedDaySessions.length > 0) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          setShowDaySessions(true);
                        }
                      }}
                    >
                      <Text style={styles.missionPrimary}>{getSelectedDayFocusMessage().primary}</Text>
                      <Text style={styles.missionSecondary}>{getSelectedDayFocusMessage().secondary}</Text>
                      {selectedDaySessions.length > 0 ? (
                        <View style={styles.tapHint}>
                          <Ionicons name="list-outline" size={14} color={Colors.dark.primary} />
                          <Text style={styles.tapHintText}>TAP TO VIEW SESSIONS</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  )}
                </View>

                {/* Action Bar */}
                {selectedDayOffset === 0 && currentSession ? (
                  <View style={styles.actionBar}>
                    <Pressable
                      style={styles.actionBarBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setSelectedSessionForAttendance(currentSession);
                      }}
                    >
                      <LinearGradient
                        colors={[Colors.dark.primary, "#7ACC2C"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.gameActionIcon}
                      >
                        <Ionicons name="checkmark-circle" size={24} color={Colors.dark.buttonText} />
                      </LinearGradient>
                      <Text style={styles.actionBtnLabel}>ATTEND</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBarBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setDetailInitialAction("extend");
                        setSelectedSessionForDetail(currentSession);
                      }}
                    >
                      <LinearGradient
                        colors={[Colors.dark.xpCyan, "#1BA8D5"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.gameActionIcon}
                      >
                        <Ionicons name="time" size={24} color={Colors.dark.buttonText} />
                      </LinearGradient>
                      <Text style={styles.actionBtnLabel}>EXTEND</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBarBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedSessionForDetail(currentSession);
                      }}
                    >
                      <LinearGradient
                        colors={[Colors.dark.warning, "#E85C4A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.gameActionIcon}
                      >
                        <Ionicons name="close-circle" size={24} color={Colors.dark.buttonText} />
                      </LinearGradient>
                      <Text style={styles.actionBtnLabel}>CANCEL</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBarBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setDetailInitialAction("end");
                        setSelectedSessionForDetail(currentSession);
                      }}
                    >
                      <LinearGradient
                        colors={[Colors.dark.orange, "#E07B3A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.gameActionIcon}
                      >
                        <Ionicons name="stop-circle" size={24} color={Colors.dark.buttonText} />
                      </LinearGradient>
                      <Text style={styles.actionBtnLabel}>END</Text>
                    </Pressable>
                  </View>
                ) : selectedDaySessions.length > 0 ? (
                  <Pressable
                    style={styles.statsBar}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowDaySessions(true);
                    }}
                  >
                    <View style={styles.statBlock}>
                      <Text style={styles.statValue}>{selectedDaySessions.length}</Text>
                      <Text style={styles.statLabel}>SESSIONS</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBlock}>
                      <Text style={styles.statValue}>
                        {selectedDaySessions.reduce((acc, s) => acc + s.duration, 0)}
                      </Text>
                      <Text style={styles.statLabel}>MINUTES</Text>
                    </View>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.missionCta}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      handleNavigate("Players");
                    }}
                  >
                    <Ionicons name="arrow-forward-circle" size={18} color={Colors.dark.primary} />
                    <Text style={styles.missionCtaText}>REVIEW PLAYER PROGRESS</Text>
                  </Pressable>
                )}
              </>
            )}
          </LinearGradient>
        </View>

        {/* === PENDING ATTENDANCE ALERT === */}
        {pendingAttendanceSessions.length > 0 && (
          <PendingAttendanceCard
            sessions={pendingAttendanceSessions}
            onSessionTap={(sess) => {
              const sessionObj: Session = {
                id: sess.sessionId,
                coachId: coach?.id ?? null,
                courtId: null,
                startTime: sess.startTime,
                endTime: sess.endTime,
                duration: Math.round(
                  (new Date(sess.endTime).getTime() - new Date(sess.startTime).getTime()) / 60000
                ),
                sessionType: sess.sessionType,
                status: "completed",
                players: sess.players.map((p) => ({ id: p.id, name: p.name })),
              };
              setDetailInitialAction("attendance");
              setSelectedSessionForDetail(sessionObj);
            }}
          />
        )}

        {/* === PENDING FEEDBACK CARDS === */}
        {pendingFeedbackSessions.length > 0 && (
          <PendingFeedbackCard
            sessions={pendingFeedbackSessions}
            onSessionTap={(sess) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              openIntake(sess, {
                onSaveOnly: () => {
                  queryClient.invalidateQueries({ queryKey: ["/api/coach/sessions/pending-feedback"] });
                },
                onComplete: (_result: IntakeResult) => {
                  if (sess.players.length > 0) {
                    const [first, ...rest] = sess.players;
                    setTimeout(() => {
                      openAIChat({
                        sessionId: sess.sessionId,
                        playerId: first.id,
                        playerName: first.name,
                        sessionType: sess.sessionType,
                        remainingPlayers: rest,
                      });
                    }, 200);
                  }
                },
              });
            }}
          />
        )}

        {/* === POWER GAUGE - Gaming Energy HUD === */}
        <View style={styles.gamingCard}>
          {/* Neon top accent */}
          <LinearGradient
            colors={[Colors.dark.primary + "60", "transparent", Colors.dark.xpCyan + "60"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gamingCardTopLine}
          />
          
          <LinearGradient
            colors={["rgba(0, 0, 0, 0.7)", "rgba(35, 35, 35, 0.9)"]}
            style={styles.gamingCardGradient}
          >
            <Pressable 
              style={styles.gamingCardHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEnergyCollapsed(!energyCollapsed);
              }}
            >
              <View style={styles.gamingCardTitleRow}>
                <View style={styles.gamingIconWrapper}>
                  <Ionicons name="flash" size={14} color={Colors.dark.primary} />
                </View>
                <Text style={styles.gamingCardTitle}>POWER GAUGE</Text>
              </View>
              <View style={styles.gamingCardControls}>
                <View
                  style={[
                    styles.gamingStateBadge,
                    {
                      borderColor:
                        coachStats.energyState === "depleted"
                          ? Colors.dark.error
                          : coachStats.energyState === "draining"
                          ? Colors.dark.orange
                          : coachStats.energyState === "charged"
                          ? Colors.dark.gold
                          : Colors.dark.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.gamingStateText,
                      {
                        color:
                          coachStats.energyState === "depleted"
                            ? Colors.dark.error
                            : coachStats.energyState === "draining"
                            ? Colors.dark.orange
                            : coachStats.energyState === "charged"
                            ? Colors.dark.gold
                            : Colors.dark.primary,
                      },
                    ]}
                  >
                    {coachStats.energyState === "fullpower" 
                      ? "FULL POWER" 
                      : coachStats.energyState.toUpperCase()}
                  </Text>
                </View>
                <Pressable style={styles.gamingCollapseBtn}>
                  <Ionicons 
                    name={energyCollapsed ? "chevron-down" : "chevron-up"} 
                    size={16} 
                    color={Colors.dark.textSecondary} 
                  />
                </Pressable>
              </View>
            </Pressable>

            {energyCollapsed ? (
              <View style={styles.gamingCollapsedPreview}>
                <Text style={styles.gamingCollapsedText}>
                  STM {recoveryAwareStamina !== null ? recoveryAwareStamina : (todaysSessions.length === 0 ? "100" : coachStats.staminaPercent)}% | IMP {todaysSessions.length === 0 ? "100" : coachStats.impactPercent}%
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.gamingBarsContainer}>
                  {/* Stamina Power Bar */}
                  <View style={styles.gamingBarRow}>
                    <View style={styles.gamingBarLabelRow}>
                      <Text style={styles.gamingBarLabel}>STAMINA</Text>
                      <Text style={styles.gamingBarValue}>{recoveryAwareStamina !== null ? recoveryAwareStamina : (todaysSessions.length === 0 ? "100" : coachStats.staminaPercent)}%</Text>
                    </View>
                    <View style={styles.gamingBarTrack}>
                      <LinearGradient
                        colors={
                          coachStats.energyState === "depleted"
                            ? [Colors.dark.error, Colors.dark.orange]
                            : coachStats.energyState === "draining"
                            ? [Colors.dark.orange, Colors.dark.gold]
                            : [Colors.dark.primary, Colors.dark.xpCyan]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.gamingBarFill, { width: recoveryAwareStamina !== null ? `${recoveryAwareStamina}%` : (todaysSessions.length === 0 ? "100%" : `${coachStats.staminaPercent}%`) }]}
                      />
                      <View style={styles.gamingBarGlow} />
                    </View>
                  </View>

                  {/* Impact Power Bar */}
                  <View style={styles.gamingBarRow}>
                    <View style={styles.gamingBarLabelRow}>
                      <Text style={styles.gamingBarLabel}>IMPACT</Text>
                      <Text style={styles.gamingBarValue}>
                        {todaysSessions.length === 0 
                          ? "100%" 
                          : coachStats.completedMinutes === 0 
                            ? "---" 
                            : `${coachStats.impactPercent}%`}
                      </Text>
                    </View>
                    <View style={styles.gamingBarTrack}>
                      {todaysSessions.length > 0 && coachStats.completedMinutes === 0 ? (
                        <View style={[styles.gamingBarFill, { width: "100%", backgroundColor: Colors.dark.disabled + "40" }]} />
                      ) : (
                        <LinearGradient
                          colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.gamingBarFill, { width: todaysSessions.length === 0 ? "100%" : `${coachStats.impactPercent}%` }]}
                        />
                      )}
                      <View style={styles.gamingBarGlow} />
                    </View>
                  </View>
                </View>

                <View style={styles.gamingSubtextRow}>
                  <Ionicons name="information-circle" size={12} color={Colors.dark.textSecondary} />
                  <Text style={styles.gamingSubtext}>
                    {todaysSessions.length === 0
                      ? "Fully recharged - ready for court"
                      : coachStats.impactPercent === 100
                      ? "Max impact unlocks bonus XP"
                      : coachStats.completedMinutes > 0
                      ? `${coachStats.completedMinutes}m played | ${coachStats.remainingMinutes}m remaining`
                      : coachStats.totalMinutes > 0
                      ? `${coachStats.totalMinutes}m scheduled today`
                      : "Ready for action"}
                  </Text>
                </View>
              </>
            )}
          </LinearGradient>
        </View>

        {/* === SMART INSIGHTS - Quick contextual tips === */}
        
        <CoachInsightsPanel 
          insights={coachInsights}
          onInsightPress={(insight) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        />
        

        {/* === COACH ANALYTICS - Gaming Insights HUD === */}
        <View style={styles.gamingCard}>
          <LinearGradient
            colors={[Colors.dark.xpCyan + "60", "transparent", Colors.dark.primary + "60"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gamingCardTopLine}
          />
          
          <LinearGradient
            colors={["rgba(0, 0, 0, 0.7)", "rgba(35, 35, 35, 0.9)"]}
            style={styles.gamingCardGradient}
          >
            <Pressable 
              style={styles.gamingCardHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setInsightsCollapsed(!insightsCollapsed);
              }}
            >
              <View style={styles.gamingCardTitleRow}>
                <View style={[styles.gamingIconWrapper, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                  <Ionicons name="stats-chart" size={14} color={Colors.dark.xpCyan} />
                </View>
                <Text style={styles.gamingCardTitle}>COACH ANALYTICS</Text>
              </View>
              <Pressable style={styles.gamingCollapseBtn}>
                <Ionicons 
                  name={insightsCollapsed ? "chevron-down" : "chevron-up"} 
                  size={16} 
                  color={Colors.dark.textSecondary} 
                />
              </Pressable>
            </Pressable>
            
            {insightsCollapsed ? (
              <View style={styles.gamingCollapsedPreview}>
                <Text style={styles.gamingCollapsedText}>
                  Load forecast & performance metrics
                </Text>
              </View>
            ) : (
              <View style={styles.gamingInsightsContent}>
                
                <CoachEarningsCard 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate("CoachEarnings" as never);
                  }}
                />
                
                
                <BurnoutRiskCard 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate("WellbeingDetail" as never);
                  }}
                />
                
                <LoadForecastCard 
                  onDayPress={(date) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleNavigate("Calendar");
                  }}
                />
              </View>
            )}
          </LinearGradient>
        </View>

        {/* === MATCH REVIEWS === */}
        <CoachMatchReviewsCard coachId={coach?.id || null} navigation={navigation as any} />

        {/* === ROSTER INSIGHTS === */}
        <RosterInsightsCard />

        {/* === ACTION QUEUE - Gaming Alerts HUD === */}
        {alerts.length > 0 ? (
          <View style={styles.gamingCard}>
            <LinearGradient
              colors={[Colors.dark.orange + "60", "transparent", Colors.dark.gold + "60"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gamingCardTopLine}
            />
            
            <LinearGradient
              colors={["rgba(0, 0, 0, 0.7)", "rgba(35, 35, 35, 0.9)"]}
              style={styles.gamingCardGradient}
            >
              <Pressable 
                style={styles.gamingCardHeader}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAlertsCollapsed(!alertsCollapsed);
                }}
              >
                <View style={styles.gamingCardTitleRow}>
                  <View style={[styles.gamingIconWrapper, { backgroundColor: Colors.dark.orange + "20" }]}>
                    <Ionicons name="warning" size={14} color={Colors.dark.orange} />
                  </View>
                  <Text style={styles.gamingCardTitle}>ACTION QUEUE</Text>
                </View>
                <View style={styles.gamingCardControls}>
                  <View style={styles.gamingAlertBadge}>
                    <Text style={styles.gamingAlertBadgeText}>{alerts.length}</Text>
                  </View>
                  <Pressable style={styles.gamingCollapseBtn}>
                    <Ionicons 
                      name={alertsCollapsed ? "chevron-down" : "chevron-up"} 
                      size={16} 
                      color={Colors.dark.textSecondary} 
                    />
                  </Pressable>
                </View>
              </Pressable>
              
              {alertsCollapsed ? null : alerts.map((alert) => (
                <Pressable 
                  key={alert.id} 
                  style={styles.gamingAlertCard}
                  onPress={() => handleNavigate("Coaching")}
                >
                  <View
                    style={[
                      styles.gamingAlertIcon,
                      {
                        borderColor:
                          alert.priority === "high"
                            ? Colors.dark.error
                            : Colors.dark.orange,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        alert.type === "feedback"
                          ? "document-text"
                          : alert.type === "holiday"
                          ? "airplane"
                          : "alert-circle"
                      }
                      size={18}
                      color={alert.priority === "high" ? Colors.dark.error : Colors.dark.orange}
                    />
                  </View>
                  <Text style={styles.gamingAlertText}>{alert.message}</Text>
                  <View style={styles.gamingXpBadge}>
                    <Text style={styles.gamingXpText}>+{pendingFeedbackCount * 15} XP</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.dark.primary} />
                </Pressable>
              ))}
            </LinearGradient>
          </View>
        ) : null}

      </ScrollView>

      <CoachStatusPanel
        visible={showStatusPanel}
        onClose={() => setShowStatusPanel(false)}
        onNavigate={(screen) => {
          if (screen === "Logout") {
            RNAlert.alert(
              "Sign Out",
              "Are you sure you want to sign out?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign Out",
                  style: "destructive",
                  onPress: () => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    logout();
                  },
                },
              ]
            );
            return;
          }
          if (screen === "FreelanceLicense") {
            setShowFreelanceWizard(true);
            return;
          }
          handleNavigate(screen);
        }}
      />

      <FreelanceLicenseWizard
        visible={showFreelanceWizard}
        onClose={() => setShowFreelanceWizard(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/coach/freelance-profile"] });
          queryClient.invalidateQueries({ queryKey: ["/api/coach/academies"] });
        }}
      />

      {/* Session Detail Drawer - Cancel session, attendance, etc. */}
      <SessionDetailDrawer
        visible={!!selectedSessionForDetail}
        session={selectedSessionForDetail}
        courts={calendarData?.courts || []}
        initialAction={detailInitialAction}
        onClose={() => { setSelectedSessionForDetail(null); setDetailInitialAction(undefined); }}
        onAttendance={() => {
          if (selectedSessionForDetail) {
            const sess = selectedSessionForDetail;
            setSelectedSessionForDetail(null);
            setDetailInitialAction(undefined);
            setTimeout(() => {
              setSelectedSessionForAttendance(sess);
            }, 300);
          }
        }}
      />

      <AttendanceDrawer
        visible={!!selectedSessionForAttendance}
        session={selectedSessionForAttendance}
        onClose={() => setSelectedSessionForAttendance(null)}
        onSave={() => {
          setSelectedSessionForAttendance(null);
          queryClient.invalidateQueries({ queryKey: ["/api/coach/me/pending-attendance"] });
        }}
      />


      <DaySessionsDrawer
        visible={showDaySessions}
        sessions={selectedDaySessions}
        dateLabel={selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        onClose={() => setShowDaySessions(false)}
        onSelectSession={(session) => {
          setShowDaySessions(false);
          setTimeout(() => {
            setSelectedSessionForDetail(session);
          }, 300);
        }}
      />

      <WelcomeIntroModal
        role="coach"
        slides={coachWelcomeSlides}
        onComplete={() => {}}
      />
      
      <HelpButton
        role="coach"
        faqs={coachFAQs}
        supportEmail="support@glowupsports.com"
        bottomOffset={120}
      />
      
      <RoleSwitchingGuide
        visible={showRoleSwitchGuide}
        onClose={() => setShowRoleSwitchGuide(false)}
        availableRoles={["coach", "player"]}
      />
      <NotificationGuideModal
        visible={showNotificationGuide}
        onClose={() => setShowNotificationGuide(false)}
        role="coach"
      />
      <FirstActionCelebration
        visible={showFirstCelebration}
        onClose={() => setShowFirstCelebration(false)}
        title={celebrationData.title}
        description={celebrationData.description}
        icon={celebrationData.icon}
        xpReward={celebrationData.xpReward}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  locationDeniedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#FFD70018",
    borderColor: "#FFD70050",
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  locationDeniedText: {
    flex: 1,
    ...Typography.caption,
    color: "#FFD700",
    lineHeight: 16,
  },
  locationDeniedAction: {
    ...Typography.caption,
    color: "#FFD700",
    fontWeight: "700",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.md,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  actionNeededSection: {
    marginBottom: Spacing.lg,
  },

  bookingRequestsSection: {
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  bookingRequestsHeader: {
    marginBottom: Spacing.md,
  },
  bookingRequestsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  bookingRequestsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    flex: 1,
  },
  bookingRequestsBadge: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: "center",
  },
  bookingRequestsBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
  },
  bookingRequestCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  bookingRequestCardLeft: {
    flex: 1,
    gap: 3,
  },
  bookingRequestSessionType: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  bookingRequestDateTime: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  bookingRequestDuration: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  bookingRequestFocusTag: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginTop: 4,
    backgroundColor: Colors.dark.xpCyan + "15",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  bookingRequestFocusText: {
    fontSize: 12,
    color: Colors.dark.xpCyan,
    flex: 1,
    lineHeight: 16,
  },
  bookingRequestActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "flex-start",
    marginLeft: Spacing.md,
  },
  bookingRequestBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  bookingRequestApproveBtn: {
    backgroundColor: GlowColors.primary,
  },
  bookingRequestDeclineBtn: {
    backgroundColor: Colors.dark.error || "#FF3B30",
  },

  // Header
  modeSwitcherContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  greeting: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    fontWeight: "400",
    letterSpacing: 0.3,
  },
  coachName: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  academyName: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
    fontWeight: "500",
  },
  
  // Coach XP
  xpContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  levelBadgeContainer: {
    overflow: "hidden",
    borderRadius: 12,
  },
  levelBadgeGradient: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  levelBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  xpBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: Backgrounds.elevated,
    borderRadius: 3,
    overflow: "hidden",
    position: "relative" as const,
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  xpBarGlow: {
    position: "absolute" as const,
    top: -2,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: "transparent",
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  xpText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  
  // === GAMING PLAYER CARD STYLES ===
  playerCard: {
    position: "relative" as const,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  playerCardGlow: {
    position: "absolute" as const,
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: BorderRadius.lg + 2,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    opacity: 0.5,
  },
  playerCardGradient: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    overflow: "hidden",
  },
  playerCardTopLine: {
    height: 3,
    width: "100%",
  },
  playerCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  holoAvatarContainer: {
    position: "relative" as const,
    width: 70,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOuterGlow: {
    position: "absolute" as const,
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: "hidden",
  },
  avatarGlowGradient: {
    width: "100%",
    height: "100%",
  },
  avatarFrame: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
  },
  avatarBorder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInnerBg: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPhoto: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  levelEmblem: {
    position: "absolute" as const,
    bottom: -4,
    right: -4,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  levelEmblemGradient: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelEmblemText: {
    fontSize: 12,
    fontWeight: "900",
    color: Colors.dark.backgroundRoot,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  playerInfo: {
    flex: 1,
    gap: 2,
  },
  playerRank: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    letterSpacing: 2,
  },
  playerName: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: -0.5,
  },
  academyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  xpProgressSection: {
    marginTop: Spacing.sm,
  },
  xpBarWrapper: {
    gap: 4,
  },
  xpBarTrack: {
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    overflow: "hidden",
    position: "relative" as const,
  },
  xpBarProgress: {
    height: "100%",
    borderRadius: 4,
  },
  xpBarShine: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 4,
  },
  xpLabels: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  xpCurrent: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  xpRequired: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  playerActions: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionBtnGlow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  actionBtnInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadge: {
    position: "absolute" as const,
    top: -2,
    right: -2,
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#1a1a1a",
  },
  notifBadgeText: {
    fontSize: 9,
    fontWeight: "800" as const,
    color: "#FFFFFF",
  },
  
  // === MISSION CONSOLE STYLES ===
  missionConsole: {
    position: "relative" as const,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  missionFrame: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  missionFrameTop: {
    height: 2,
  },
  missionGradient: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: Spacing.md,
  },
  missionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  missionTitleSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  missionIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.dark.xpCyan + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  missionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.xpCyan,
    letterSpacing: 2,
  },
  missionControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  collapseToggle: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
  },
  dayPills: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  dayPillArrow: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  dayPillCenter: {
    paddingHorizontal: Spacing.md,
  },
  dayPillLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  dateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  dateText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  intensityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  intensityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  intensityLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  backToTodayChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  backToTodayLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  missionDisplay: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  missionContent: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  missionPrimary: {
    fontSize: 32,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: -1,
  },
  missionSecondary: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  tapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  tapHintText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  liveHud: {
    position: "relative" as const,
    width: "100%",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  liveHudGlow: {
    position: "absolute" as const,
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    backgroundColor: Colors.dark.primary,
    opacity: 0.2,
    borderRadius: BorderRadius.md + 4,
  },
  liveHudBg: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  liveHudBgClean: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  liveHudContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  liveHudLeft: {
    flex: 1,
  },
  liveHudRight: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative" as const,
    marginLeft: Spacing.md,
  },
  liveCircleGlow: {
    position: "absolute" as const,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.dark.error,
  },
  liveCircleBadge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  liveCircleText: {
    fontSize: 24,
    fontWeight: "900",
    color: Colors.dark.text,
    letterSpacing: 2,
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  liveCircleSubtext: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 0.5,
    marginTop: 2,
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  liveHudHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  liveIndicatorNew: {
    position: "relative" as const,
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  livePulseRing: {
    position: "absolute" as const,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary,
  },
  liveDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
  liveStatusText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.primary,
    letterSpacing: 2,
  },
  countdownTimer: {
    fontSize: 56,
    fontWeight: "900",
    color: Colors.dark.text,
    letterSpacing: -2,
    textShadowColor: Colors.dark.primary + "40",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  countdownLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 2,
    marginTop: -4,
  },
  sessionMeta: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.primary + "20",
  },
  sessionMetaText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
    textAlign: "center",
  },
  actionBar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    marginTop: Spacing.sm,
  },
  actionBarBtn: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  actionBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  gameActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.4)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  actionBtnLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 1,
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  statsBar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    marginTop: Spacing.sm,
  },
  statBlock: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  missionCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    marginTop: Spacing.sm,
  },
  missionCtaText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  
  // Avatar with Glow Ring (legacy)
  avatarGlowRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.primary + "30",
  },
  avatarInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  
  // Quick Nav Menu
  quickNavScroll: {
    marginHorizontal: -Spacing.lg,
    marginBottom: Spacing.lg,
  },
  quickNavContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  quickNavChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  quickNavChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  quickNavChipText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  quickNavChipTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  quickNavBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  quickNavBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  
  // Focus Card (formerly TODAY)
  focusCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  focusGradient: {
    padding: Spacing.lg,
  },
  focusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  dayNavHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  dayNavArrow: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNavCollapseBtn: {
    marginLeft: Spacing.xs,
    padding: Spacing.xs,
  },
  focusHeaderCenter: {
    flex: 1,
    alignItems: "center",
  },
  backToTodayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  backToTodayText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  focusLabel: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1.5,
    opacity: 0.9,
  },
  focusDate: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    marginTop: 2,
    opacity: 0.8,
    textTransform: "capitalize",
  },
  focusHeaderLeft: {
    flex: 1,
  },
  focusTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dayIntensityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  dayIntensityText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  focusMain: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  liveDotPulse: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary,
    opacity: 0.3,
    left: -4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
  liveText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  focusPrimaryLarge: {
    fontSize: 48,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: -1,
  },
  focusSecondaryMuted: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    marginTop: -Spacing.xs,
    opacity: 0.7,
  },
  focusContext: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.primary,
    textAlign: "center",
    marginTop: Spacing.sm,
    fontWeight: "500",
  },
  sessionActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    marginTop: Spacing.md,
  },
  sessionActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
  },
  sessionActionText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  focusPrimary: {
    fontSize: 36,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  focusSecondary: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  focusStats: {
    flexDirection: "row",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    marginTop: Spacing.md,
  },
  focusStatItem: {
    flex: 1,
    alignItems: "center",
  },
  focusStatNumber: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  focusStatLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    opacity: 0.8,
  },
  focusStatDivider: {
    width: 1,
    backgroundColor: Backgrounds.elevated,
  },
  focusCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    marginTop: Spacing.md,
  },
  focusCtaText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  
  // Energy Card
  energyCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  energyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  energyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  energyTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  energyStateBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  energyStateText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
  },
  energyBarsContainer: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  energyBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  energyBarLabel: {
    width: 55,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  energyBarBackground: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 3,
    overflow: "hidden",
  },
  energyBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  energyBarValue: {
    width: 35,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.text,
    textAlign: "right",
    opacity: 0.8,
  },
  energySubtext: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.xs,
    opacity: 0.7,
  },
  
  // Collapsible Cards
  collapsibleCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  collapsibleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  collapsibleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  collapsibleTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  collapsibleToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  collapsibleBadge: {
    backgroundColor: Colors.dark.backgroundTertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: "center",
  },
  collapsibleBadgeText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  collapsedPreview: {
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.04)",
    marginTop: Spacing.sm,
  },
  collapsedPreviewText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  insightsSection: {
    marginBottom: Spacing.lg,
  },
  alertsSection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
    opacity: 0.9,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  alertIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  alertText: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  alertXP: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  
  // Quick Actions
  quickActions: {
    marginBottom: Spacing.lg,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  actionCard: {
    width: "48%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionCardActive: {
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  actionIconContainer: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconActive: {
    backgroundColor: Colors.dark.primary + "15",
  },
  actionText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
    opacity: 0.9,
  },
  
  // Sessions
  sessionsSection: {
    marginBottom: Spacing.lg,
  },
  timelineCard: {
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.04)",
    paddingTop: Spacing.sm,
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  sessionCardPast: {
    opacity: 0.5,
  },
  sessionCardCurrent: {
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
  },
  sessionTime: {
    alignItems: "center",
    minWidth: 50,
  },
  sessionTimeText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  sessionTimePast: {
    color: Colors.dark.tabIconDefault,
  },
  sessionDuration: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  sessionInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sessionType: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  sessionTypePast: {
    color: Colors.dark.tabIconDefault,
  },
  currentBadge: {
    backgroundColor: Colors.dark.primary + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  currentBadgeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  pastBadge: {
    backgroundColor: Colors.dark.tabIconDefault + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  pastBadgeText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  
  // === GAMING CARD STYLES ===
  gamingCard: {
    position: "relative" as const,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  gamingCardTopLine: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 1,
  },
  gamingCardGradient: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  gamingCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gamingCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  gamingIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  gamingCardTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 2,
  },
  gamingCardControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  gamingStateBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  gamingStateText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  gamingCollapseBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
  },
  gamingCollapsedPreview: {
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    marginTop: Spacing.sm,
  },
  gamingCollapsedText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
  },
  
  // Gaming Power Bars
  gamingBarsContainer: {
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  gamingBarRow: {
    gap: 6,
  },
  gamingBarLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  gamingBarLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
  },
  gamingBarValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  gamingBarTrack: {
    height: 8,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 4,
    overflow: "hidden",
    position: "relative" as const,
  },
  gamingBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  gamingBarGlow: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    width: 20,
    height: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  gamingSubtextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  gamingSubtext: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  gamingInsightsContent: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  
  // Gaming Alerts
  gamingAlertBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.orange + "20",
    borderWidth: 1,
    borderColor: Colors.dark.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  gamingAlertBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.orange,
  },
  gamingAlertCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  gamingAlertIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gamingAlertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  gamingXpBadge: {
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  gamingXpText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 0.5,
  },
  gamingTimelineContent: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  
  // Gaming Session Cards
  gamingSessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  gamingSessionCardLive: {
    borderColor: Colors.dark.primary + "60",
    backgroundColor: Colors.dark.primary + "08",
  },
  gamingSessionTime: {
    alignItems: "center",
    minWidth: 50,
  },
  gamingSessionTimeText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  gamingSessionTimePast: {
    color: Colors.dark.textMuted,
  },
  gamingSessionDuration: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
  },
  gamingSessionInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  gamingSessionType: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  gamingSessionTypePast: {
    color: Colors.dark.textMuted,
  },
  gamingLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  gamingLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },
  gamingLiveText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  gamingDoneBadge: {
    backgroundColor: Colors.dark.disabled + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  gamingDoneText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.5,
  },
  
  // === TODAY'S SCHEDULE - Unified Gaming HUD ===
  todayScheduleCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  todayScheduleTopLine: {
    height: 3,
  },
  todayScheduleGradient: {
    padding: Spacing.md,
  },
  todayScheduleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  todayScheduleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  todayScheduleIconStack: {
    position: "relative" as const,
  },
  todayScheduleIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  todayScheduleTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1.8,
    textTransform: "uppercase" as const,
  },
  todayScheduleSubtitle: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  todayScheduleStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  todayScheduleStatBadge: {
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.25)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  todayScheduleStatValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  todayScheduleStatLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.dark.primary + "80",
    letterSpacing: 0.5,
  },
  todayScheduleCollapseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.xs,
  },
  todayScheduleCollapsed: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  todayScheduleTimelinePreview: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  todayScheduleTimelineDot: {
    alignItems: "center",
    gap: 6,
  },
  todayScheduleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.dark.textSecondary,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundDefault,
  },
  todayScheduleDotDone: {
    backgroundColor: Colors.dark.disabled,
    borderColor: Colors.dark.disabled + "40",
  },
  todayScheduleDotLive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary + "40",
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  todayScheduleDotPulse: {
    position: "absolute" as const,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary + "30",
    top: -6,
    left: -6,
  },
  todayScheduleDotTime: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  todayScheduleMoreText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  todayScheduleExpanded: {
    marginTop: Spacing.md,
  },
  todayScheduleTimeline: {
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  todayScheduleDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  todayScheduleDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Backgrounds.elevated,
  },
  todayScheduleDividerText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 1,
  },
  todayScheduleSession: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  todayScheduleSessionLive: {
    borderColor: GlowColors.primary + "60",
    backgroundColor: GlowColors.primary + "10",
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  todayScheduleSessionNext: {
    borderColor: Colors.dark.gold + "40",
    backgroundColor: Colors.dark.gold + "05",
  },
  todayScheduleSessionPast: {
    opacity: 0.6,
  },
  todayScheduleTimeBlock: {
    alignItems: "center",
    minWidth: 50,
    marginRight: Spacing.xs,
  },
  todayScheduleTimeText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  todayScheduleDurationBadge: {
    backgroundColor: Backgrounds.elevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  todayScheduleDurationText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  todayScheduleConnector: {
    width: 24,
    alignItems: "center",
    alignSelf: "stretch",
    paddingVertical: 4,
  },
  todayScheduleConnectorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.textSecondary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 4,
  },
  todayScheduleConnectorLine: {
    flex: 1,
    width: 2,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    marginTop: 4,
  },
  todayScheduleSessionInfo: {
    flex: 1,
    paddingLeft: Spacing.xs,
  },
  todayScheduleSessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  todayScheduleSessionType: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  todayScheduleSessionTime: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  todayScheduleLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary + "25",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: GlowColors.primary + "60",
    position: "relative" as const,
    overflow: "hidden" as const,
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  todayScheduleLivePulse: {
    position: "absolute" as const,
    width: "100%",
    height: "100%",
    backgroundColor: Colors.dark.primary + "30",
    borderRadius: BorderRadius.sm,
  },
  todayScheduleLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },
  todayScheduleLiveText: {
    fontSize: 10,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 1.2,
    textShadowColor: GlowColors.shadow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  todayScheduleNextBadge: {
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
  },
  todayScheduleNextText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.gold,
    letterSpacing: 0.5,
  },
  todayScheduleDoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.disabled + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  todayScheduleDoneText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.disabled,
  },
});

const dashReviewStyles = StyleSheet.create({
  reviewsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
  },
  reviewsLeft: {
    flex: 1,
    gap: 4,
  },
  reviewsIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reviewsAvg: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.dark.gold,
  },
  reviewsCountText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  reviewsExcerpt: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
    marginTop: 2,
  },
  reviewsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reviewsSeeAll: {
    fontSize: 12,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
});
