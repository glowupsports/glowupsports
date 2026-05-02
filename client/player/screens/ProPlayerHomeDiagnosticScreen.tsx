/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║          CANONICAL PLAYER HOME SCREEN  —  DO NOT REPLACE THIS FILE          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  This is the ONE AND ONLY authoritative Home tab screen for the V2 Player   ║
 * ║  surface.  It is mounted by PlayerV2Navigator.tsx and is the file that      ║
 * ║  ALL future player-home work must happen in.                                ║
 * ║                                                                              ║
 * ║  Navigator wiring (PlayerV2Navigator.tsx):                                  ║
 * ║    Home tab  →  ProPlayerHomeDiagnosticScreen   ← YOU ARE HERE              ║
 * ║                                                                              ║
 * ║  Why "Diagnostic" in the name?                                               ║
 * ║    The screen started life as a V2 diagnostic/test harness alongside the    ║
 * ║    legacy ProPlayerHomeScreen.  It has since been fully promoted to the      ║
 * ║    production home screen.  The name is kept for continuity; ignore it.     ║
 * ║                                                                              ║
 * ║  What lives here (as of Task #1538):                                        ║
 * ║    • ProPlayerCard (hero stats card)                                        ║
 * ║    • PrimaryActionsRow (book / schedule / etc.)                             ║
 * ║    • HeroCarousel (upcoming sessions / announcements)                       ║
 * ║    • AICoachHomeCard (inline AI coach prompt)                               ║
 * ║    • PlayerOfTheWeekCard (spotlight)                                        ║
 * ║    • QuestsCard (daily / weekly quests)                                     ║
 * ║    • CoachesRail, Discovery rows, Booking wizard, modals …                 ║
 * ║                                                                              ║
 * ║  What does NOT live here (removed in Tasks #1537 / #1538):                  ║
 * ║    ✗  Tennis IQ / IQQuizModal                                               ║
 * ║    ✗  StreakRail                                                             ║
 * ║    ✗  UnifiedImproveCard                                                    ║
 * ║    ✗  Spotlight mini-tiles (SpotlightNomineeMini, etc.)                     ║
 * ║                                                                              ║
 * ║  LEGACY FILE (do not edit for new features):                                ║
 * ║    client/player/screens/ProPlayerHomeScreen.tsx                            ║
 * ║    → kept only for reference / V1 navigator fallback.                       ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Modal,
  DimensionValue,
  NativeScrollEvent,
  NativeSyntheticEvent} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

import { useAuth } from "@/coach/context/AuthContext";
import type { AuthPlayer } from "@/coach/context/AuthContext";
import { usePlayer } from "@/player/context/PlayerContext";
import { usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { PlayerStateProvider } from "@/player/context/PlayerStateContext";
import {
  useSport,
  SPORT_DEFINITIONS,
  getSportColor,
  getSportLabel,
} from "@/player/context/SportContext";
import { GuestPromptModal, useGuestGuard } from "@/components/GuestPromptModal";
import PinEntryModal from "@/components/PinEntryModal";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { Spacing, GlowColors, Backgrounds, BorderRadius, Colors } from "@/constants/theme";
import { ProPlayerCard } from "@/player/components/ProPlayerCard";
import { TodaysFocusCard } from "@/player/components/TodaysFocusCard";
import type { FocusCard } from "@/player/components/TodaysFocusCard";
import { StreakMilestoneBanner } from "@/player/components/StreakMilestoneBanner";
import { NewPlayerGuideCard } from "@/player/components/NewPlayerGuideCard";
import { HeroCarousel } from "@/player/components/HeroCarousel";
import PlayerBookingWizard from "@/player/components/PlayerBookingWizard";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import {
  LazyOnScroll,
  ScrollPositionContext,
  useScrollPositionController,
} from "@/player/components/LazyOnScroll";
import {
  BirthdayBanner,
  BirthdayXPBonusCard,
} from "@/player/components/BirthdayThemeOverlay";
import {
  RamadanBanner,
  RamadanBonusCard,
} from "@/player/components/RamadanCelebrationOverlay";
import { UpcomingProviderSessionCard } from "@/player/components/UpcomingProviderSessionCard";
import { WelcomeGuideCard } from "@/player/components/WelcomeGuideCard";
import { CoachesRail, JoinAcademySoftCard } from "@/player/components/CoachesRail";
import { PlayersNearYouRow, CountryLeaderboardsEntry } from "@/player/components/DiscoveryRows";
import { useQuests, Quest } from "@/player/hooks/useQuests";
import SpotlightNominationModal from "@/player/components/SpotlightNominationModal";
import { useTabNavigation } from "@/components/TabNavigationContext";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { RecentFeedbackCard } from "@/player/components/RecentFeedbackCard";
import { UpcomingAppointmentCard } from "@/player/components/UpcomingAppointmentCard";
import { TrainingLoadCard } from "@/player/components/TrainingLoadCard";
import SquadVsSquadWidget from "@/components/SquadVsSquadWidget";
import { AICoachHomeCard } from "@/player/components/AICoachHomeCard";
import { PostSessionCheckInModal } from "@/player/components/PostSessionCheckInModal";
import { PlayerOfTheWeekCard } from "@/player/components/PlayerOfTheWeekCard";
import { MiniFeed } from "@/player/components/MiniFeed";
import { GlowMarketSpotlight } from "@/player/components/GlowMarketSpotlight";
import { BetaFeedbackButton } from "@/player/components/BetaFeedbackButton";
import { GlowAssessmentCard } from "@/player/components/GlowAssessmentCard";
import AchievementCelebrationModal from "@/player/components/AchievementCelebrationModal";
import { useAchievementCelebration } from "@/player/hooks/useAchievementCelebration";

// ─── Types (exact from ProPlayerHomeScreen) ────────────────────────────────
interface DashboardData {
  player: {
    id: string;
    name: string;
    level: number;
    xp: number;
    glowScore: number;
    ballLevel: string | null;
    streak: number;
    profilePhotoUrl?: string | null;
    dateOfBirth?: string | null;
    playStyle?: string | null;
  };
  coach: { id: string; name: string } | null;
  academy: { id: string; name: string } | null;
  credits?: {
    total: number;
    group: number;
    private: number;
    semi_private: number;
  };
  nextSession?: {
    id: string;
    date: string;
    type: string;
    endTime?: string;
  } | null;
  isFreePlayer?: boolean;
}

// ─── QuestsCard ───────────────────────────────────────────────────────────
const QuestsCard = React.memo(function QuestsCard({ onQuestPress }: { onQuestPress: () => void }) {
  const { user } = useAuth();
  const { data: questsData } = useQuests(!!user?.playerId);
  const { quest, questType } = useMemo(() => {
    if (!questsData) return { quest: null as Quest | null, questType: null as "daily" | null };
    const dailyActive = questsData.daily.filter((q) => q.status === "active" || q.status === "in_progress");
    const tagged: { quest: Quest; type: "daily" }[] = [
      ...dailyActive.map((q) => ({ quest: q, type: "daily" as const })),
    ];
    if (tagged.length === 0) return { quest: null as Quest | null, questType: null as "daily" | null };
    const sorted = tagged.sort((a, b) => {
      const aRatio = a.quest.targetProgress > 0 ? a.quest.currentProgress / a.quest.targetProgress : 0;
      const bRatio = b.quest.targetProgress > 0 ? b.quest.currentProgress / b.quest.targetProgress : 0;
      return bRatio - aRatio;
    });
    return { quest: sorted[0].quest as Quest | null, questType: sorted[0].type as "daily" | null };
  }, [questsData]);

  const questProgress = quest && quest.targetProgress > 0 ? Math.min(quest.currentProgress / quest.targetProgress, 1) : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={quest ? `Quest: ${quest.name}` : "View quests"}
      style={({ pressed }) => [qc.card, pressed && qc.pressed]}
      onPress={onQuestPress}
    >
      <View style={qc.header}>
        <View style={qc.headerLeft}>
          <Ionicons name={quest ? "flame" : "flame-outline"} size={14} color={GlowColors.orange} />
          <Text style={qc.label} numberOfLines={1}>
            {quest ? "DAILY QUEST" : "QUESTS"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color={Colors.dark.textMuted} />
      </View>
      {quest ? (
        <>
          <Text style={qc.questName} numberOfLines={2}>{quest.name}</Text>
          <View style={qc.progressBar}>
            <View style={[qc.progressFill, { width: `${Math.max(questProgress * 100, 2)}%` as DimensionValue, backgroundColor: quest.iconColor || GlowColors.primary }]} />
          </View>
          <View style={qc.footer}>
            <Text style={qc.progressText}>{quest.currentProgress}/{quest.targetProgress}</Text>
            <View style={qc.xpRow}>
              <Ionicons name="flash" size={11} color={Colors.dark.gold} />
              <Text style={qc.xpText}>+{quest.xpReward ?? 0} XP</Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={qc.emptyText}>No active quest — tap to view all</Text>
      )}
    </Pressable>
  );
});

const qc = StyleSheet.create({
  card: { marginHorizontal: Spacing.lg, backgroundColor: "rgba(255,133,27,0.06)", borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: "rgba(255,133,27,0.18)", padding: Spacing.md, gap: 8 },
  pressed: { opacity: 0.82 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 5 },
  label: { fontSize: 10, fontWeight: "800", color: GlowColors.orange, letterSpacing: 1.2 },
  questName: { fontSize: 14, fontWeight: "700", color: Colors.dark.text, lineHeight: 18 },
  emptyText: { fontSize: 13, color: Colors.dark.textMuted },
  progressBar: { height: 4, backgroundColor: Colors.dark.chipBackgroundStrong, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressText: { fontSize: 11, color: Colors.dark.textSubtle, fontWeight: "700" },
  xpRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  xpText: { fontSize: 11, color: Colors.dark.gold, fontWeight: "700" },
});

// ─── PlayerDNABanner (exact copy from ProPlayerHomeScreen) ─────────────────
const PlayerDNABanner = React.memo(function PlayerDNABanner({ playerId }: { playerId: string }) {
  const navigation = useNavigation<NavigationProp<PlayerStackParamList>>();

  const { data: profileData } = useQuery<{ player: Record<string, unknown> | null }>({
    queryKey: ["/api/player/me/profile"],
    enabled: !!playerId,
    staleTime: 60000,
  });

  const p = profileData?.player as Record<string, unknown> | null | undefined;
  if (!p) return null;

  const DNA_FIELDS = [
    !!p.dominantHand,
    !!p.backhandType,
    !!p.height,
    !!p.tshirtSize,
    !!p.playStyle,
    !!p.tennisIdol,
    Array.isArray(p.enjoymentTags) && (p.enjoymentTags as unknown[]).length > 0,
    !!p.shortTermGoal,
    !!p.longTermDream,
    Array.isArray(p.typicalPlayTimes) && (p.typicalPlayTimes as unknown[]).length > 0,
    !!p.profilePhotoUrl,
  ];
  const filled = DNA_FIELDS.filter(Boolean).length;
  const total = DNA_FIELDS.length;
  const pct = Math.round((filled / total) * 100);

  if (pct >= 100) return null;

  const fillWidth: DimensionValue = `${pct}%`;

  return (
    <Pressable
      style={dnaBannerStyles.card}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        (navigation as any).navigate("PlayerDNAWizard");
      }}
      accessibilityLabel="Complete your player DNA profile"
    >
      <View style={dnaBannerStyles.row}>
        <View style={dnaBannerStyles.iconWrap}>
          <Ionicons name="analytics-outline" size={20} color={Colors.dark.accentText} />
        </View>
        <View style={dnaBannerStyles.textWrap}>
          <Text style={dnaBannerStyles.title}>Complete Your Player DNA</Text>
          <Text style={dnaBannerStyles.sub}>{filled}/{total} fields complete — {pct}%</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.dark.accentText} />
      </View>
      <View style={dnaBannerStyles.progressTrack}>
        <View style={[dnaBannerStyles.progressFill, { width: fillWidth }]} />
      </View>
      <Text style={dnaBannerStyles.cta}>Tap to build your profile</Text>
    </Pressable>
  );
});

const dnaBannerStyles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.dark.accentTextSoft,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.accentTextSoft,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.accentTextSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  textWrap: { flex: 1 },
  title: { fontSize: 13, fontWeight: "700", color: Colors.dark.text },
  sub: { fontSize: 11, color: Colors.dark.textMuted, marginTop: 2 },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: GlowColors.primary, borderRadius: 2 },
  cta: { fontSize: 12, fontWeight: "600", color: Colors.dark.accentText },
});

// ─── Inner content — wrapped by PlayerStateProvider below ─────────────────
const DiagnosticHomeContent = React.memo(function DiagnosticHomeContent() {
  const { user, isGuest, patchPlayer } = useAuth();
  const playerCtx = usePlayer();
  const { openDrawer } = usePlayerDrawer();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const track = useTrackFeature();
  const { guardAction, promptProps } = useGuestGuard();
  const { isMultiSport, activeSports, activeSport } = useSport();
  const { navigateToTab } = useTabNavigation();

  // ── State (exact from ProPlayerHomeScreen) ────────────────────────────────
  const [showPinModal, setShowPinModal] = useState(false);
  const [showBookingWizard, setShowBookingWizard] = useState(false);
  const [bookingWizardSport, setBookingWizardSport] = useState<string | undefined>(undefined);
  const [showBookingSportPicker, setShowBookingSportPicker] = useState(false);
  const [ramadanDismissed, setRamadanDismissed] = useState(false);
  const [showSpotlightNomination, setShowSpotlightNomination] = useState(false);
  const [checkinModalSession, setCheckinModalSession] = useState<{ sessionId: string; sessionTitle?: string; coachName?: string } | null>(null);
  const checkinTriggeredRef = useRef(false);

  // ── Scroll position controller (drives LazyOnScroll) ─────────────────────
  const scrollController = useScrollPositionController();
  const onHomeScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollController.emit(
        e.nativeEvent.contentOffset.y,
        e.nativeEvent.layoutMeasurement.height,
      );
    },
    [scrollController],
  );

  // ── God-route query (exact from ProPlayerHomeScreen) ─────────────────────
  const { data: homeData, refetch } = useQuery<{
    dashboard: DashboardData | null;
    profile: Record<string, unknown> | null;
    unreadCount: { count: number };
    weeklyDigest: Record<string, unknown> | null;
    aiCoachContext: Record<string, unknown> | null;
    spotlightCurrentWeek: Record<string, unknown> | null;
    spotlightWeeklyWinner: { winner: Record<string, unknown> | null };
    tennisIq: { score: number | null; lastQuizAt: string | null } | null;
    aiProStatus: { isPro: boolean; isCoach: boolean; callCount: number; limit: number } | null;
    dailyFocus: FocusCard | null;
  }>({
    queryKey: ["/api/player/me/home-data"],
    enabled: !!user?.playerId && !isGuest,
    staleTime: 0,
    refetchInterval: 120 * 1000,
  });

  const { data: checkinInsightData } = useQuery<{ insight: string | null }>({
    queryKey: ["/api/player/me/checkin-insight"],
    enabled: !!user?.playerId && !isGuest,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sessionHistoryForTrigger } = useQuery<{ sessions: Array<{ sessionId: string; sessionType: string; startTime: string; endTime: string | null; status: string; coachName: string | null; checkin: null | object }> }>({
    queryKey: ["/api/player/me/session-history"],
    enabled: !!user?.playerId && !isGuest,
    staleTime: 60 * 1000,
  });

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  };

  // ── Achievement nudge query ────────────────────────────────────────────────
  const { data: achievementNudge } = useQuery<{
    achievementId: string;
    name: string;
    sessionsAway: number;
    iconName: string;
    iconColor: string;
    currentProgress: number;
    triggerThreshold: number;
  } | null>({
    queryKey: ["/api/player/me/achievements/nudge"],
    enabled: !!user?.playerId && !isGuest,
    staleTime: 120000,
    refetchInterval: 300000,
  });

  // ── Achievement celebration (global — fires from home tab on milestone hit) ─
  // Uses the same AsyncStorage-backed hook as PlayerProfileScreen so each
  // achievement triggers the celebration modal at most once, regardless of
  // which screen evaluates the milestone first.
  const { celebrationAchievement, onCloseCelebration, enqueueNewlyEarned } = useAchievementCelebration(user?.playerId ?? "");
  const { data: achievementsHomeData } = useQuery<{
    achievements: { id: string; name: string; description: string; iconName: string; iconColor: string; rewardLabel: string; rewardType: string; rarity: string; earned: boolean }[];
    newlyEarned: string[];
  } | null>({
    queryKey: ["/api/player/me/achievements"],
    enabled: !!user?.playerId && !isGuest,
    staleTime: 60000,
    refetchInterval: 120000,
  });
  useEffect(() => {
    const newlyEarned = achievementsHomeData?.newlyEarned ?? [];
    enqueueNewlyEarned(newlyEarned, achievementsHomeData?.achievements ?? []);
  }, [achievementsHomeData?.newlyEarned]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data (exact from ProPlayerHomeScreen) ─────────────────────────
  const dashboardData = homeData?.dashboard ?? undefined;
  const unreadCount = homeData?.unreadCount?.count ?? 0;
  const effectiveData = dashboardData;

  // ── Player shape (exact from ProPlayerHomeScreen) ─────────────────────────
  const dashboardPlayer = effectiveData?.player;
  const player = useMemo(() => ({
    id: dashboardPlayer?.id ?? user?.playerId ?? "",
    name: dashboardPlayer?.name ?? user?.displayName ?? user?.username ?? "",
    level: dashboardPlayer?.level ?? playerCtx.level ?? 1,
    xp: dashboardPlayer?.xp ?? playerCtx.xp ?? 0,
    glowScore: dashboardPlayer?.glowScore ?? playerCtx.glowScore ?? 0,
    ballLevel: dashboardPlayer?.ballLevel ?? playerCtx.ballLevel ?? null,
    streak: dashboardPlayer?.streak ?? 0,
    checkinStreak: dashboardPlayer?.checkinStreak ?? 0,
    profilePhotoUrl: dashboardPlayer?.profilePhotoUrl ?? user?.profilePhotoUrl ?? null,
    dateOfBirth: dashboardPlayer?.dateOfBirth ?? null,
    playStyle: dashboardPlayer?.playStyle ?? null,
  }), [
    dashboardPlayer?.id, dashboardPlayer?.name, dashboardPlayer?.level,
    dashboardPlayer?.xp, dashboardPlayer?.glowScore, dashboardPlayer?.ballLevel,
    dashboardPlayer?.streak, dashboardPlayer?.checkinStreak, dashboardPlayer?.profilePhotoUrl,
    dashboardPlayer?.dateOfBirth, dashboardPlayer?.playStyle,
    user?.playerId, user?.displayName, user?.username, user?.profilePhotoUrl,
    playerCtx.level, playerCtx.xp, playerCtx.glowScore, playerCtx.ballLevel,
  ]);
  const credits = effectiveData?.credits;
  const isFreePlayer = effectiveData?.isFreePlayer ?? !effectiveData?.academy;

  // ── Birthday detection (exact from ProPlayerHomeScreen) ───────────────────
  const isBirthday = useMemo(() => {
    const dateOfBirth = effectiveData?.player?.dateOfBirth;
    if (!dateOfBirth) return false;
    const today = new Date();
    const dob = new Date(dateOfBirth);
    return today.getMonth() === dob.getMonth() && today.getDate() === dob.getDate();
  }, [effectiveData?.player?.dateOfBirth]);

  const playerAge = useMemo(() => {
    const dateOfBirth = effectiveData?.player?.dateOfBirth;
    if (!dateOfBirth) return undefined;
    const today = new Date();
    const dob = new Date(dateOfBirth);
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }, [effectiveData?.player?.dateOfBirth]);

  // ── Ramadan detection (exact from ProPlayerHomeScreen) ────────────────────
  const isRamadan = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const ramadanDates: Record<number, { start: [number, number]; end: [number, number] }> = {
      2025: { start: [2, 1], end: [2, 30] },
      2026: { start: [1, 18], end: [2, 19] },
      2027: { start: [1, 8], end: [1, 6] },
      2028: { start: [11, 27], end: [0, 25] },
    };
    const dates = ramadanDates[year];
    if (!dates) return false;
    const start = new Date(year, dates.start[0], dates.start[1]);
    const end = new Date(year, dates.end[0], dates.end[1]);
    if (end < start) return today >= start || today <= end;
    return today >= start && today <= end;
  }, []);

  useEffect(() => {
    if (isRamadan) {
      const key = `@glow_ramadan_dismissed_${new Date().getFullYear()}`;
      AsyncStorage.getItem(key).then((val) => {
        if (val === "true") setRamadanDismissed(true);
      });
    }
  }, [isRamadan]);

  const handleDismissRamadan = useCallback(() => {
    setRamadanDismissed(true);
    const key = `@glow_ramadan_dismissed_${new Date().getFullYear()}`;
    AsyncStorage.setItem(key, "true");
  }, []);

  // ── Post-session check-in trigger ─────────────────────────────────────────
  // Fires once per screen visit: finds the most recent ended session (2–4 hrs ago)
  // that has no check-in recorded, then shows the modal after a 2 s delay.
  useEffect(() => {
    if (isGuest || !sessionHistoryForTrigger?.sessions?.length) return;
    if (checkinTriggeredRef.current) return;

    const now = Date.now();
    const FOUR_HRS = 4 * 60 * 60 * 1000;

    const candidate = sessionHistoryForTrigger.sessions.find((s) => {
      if (s.checkin != null) return false;
      const endTime = s.endTime ? new Date(s.endTime).getTime() : new Date(s.startTime).getTime() + 60 * 60 * 1000;
      const elapsed = now - endTime;
      return elapsed >= 0 && elapsed <= FOUR_HRS;
    });

    if (!candidate) return;
    checkinTriggeredRef.current = true;
    const timer = setTimeout(() => {
      setCheckinModalSession({
        sessionId: candidate.sessionId,
        sessionTitle: candidate.sessionType
          ? candidate.sessionType.charAt(0).toUpperCase() + candidate.sessionType.slice(1).replace(/_/g, " ") + " Session"
          : "Session",
        coachName: candidate.coachName ?? undefined,
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [sessionHistoryForTrigger, isGuest]);

  // ── Seed legacy query keys (exact from ProPlayerHomeScreen) ───────────────
  const seedQueryCache = useCallback(() => {
    if (!homeData) return;
    if (homeData.dashboard) {
      queryClient.setQueryData(["/api/player/me/dashboard"], homeData.dashboard);
    }
    if (homeData.profile) {
      queryClient.setQueryData(["/api/player/me/profile"], homeData.profile);
    }
    queryClient.setQueryData(
      ["/api/player/me/notifications/unread-count"],
      homeData.unreadCount ?? { count: 0 },
    );
    queryClient.setQueryData(["/api/player/me/weekly-digest"], homeData.weeklyDigest ?? null);
    queryClient.setQueryData(["/api/player/me/ai-coach/context"], homeData.aiCoachContext ?? null);
    queryClient.setQueryData(
      ["/api/player/spotlight/current-week"],
      homeData.spotlightCurrentWeek ?? null,
    );
    queryClient.setQueryData(
      ["/api/player/spotlight/weekly-winner"],
      homeData.spotlightWeeklyWinner ?? { winner: null },
    );
    queryClient.setQueryData(["/api/player/me/tennis-iq"], homeData.tennisIq ?? null);
    queryClient.setQueryData(
      ["/api/ai-pro/status"],
      homeData.aiProStatus ?? { isPro: false, isCoach: false, callCount: 0, limit: 5 },
    );
    // Mirror player numbers back into AuthContext
    const dp = homeData.dashboard?.player as
      | {
          level?: number; xp?: number; glowScore?: number; ballLevel?: string | null;
          dateOfBirth?: string | null; profilePhotoUrl?: string | null;
          glowMmr?: number; glowRank?: number; totalMatchesPlayed?: number;
        }
      | null | undefined;
    if (dp) {
      const patch: Partial<AuthPlayer> = {};
      if (typeof dp.level === "number") patch.level = dp.level;
      if (typeof dp.xp === "number") patch.xp = dp.xp;
      if (typeof dp.glowScore === "number") patch.glowScore = dp.glowScore;
      if (typeof dp.glowMmr === "number") patch.glowMmr = dp.glowMmr;
      if (typeof dp.glowRank === "number") patch.glowRank = dp.glowRank;
      if (typeof dp.totalMatchesPlayed === "number") patch.totalMatchesPlayed = dp.totalMatchesPlayed;
      if (dp.ballLevel !== undefined) patch.ballLevel = dp.ballLevel ?? null;
      if (dp.dateOfBirth !== undefined) patch.dateOfBirth = dp.dateOfBirth ?? null;
      if (dp.profilePhotoUrl !== undefined) patch.profilePhotoUrl = dp.profilePhotoUrl ?? null;
      if (Object.keys(patch).length > 0) patchPlayer(patch);
    }
  }, [homeData, queryClient, patchPlayer]);
  useEffect(() => { seedQueryCache(); }, [seedQueryCache]);

  // ── Prefetch other tabs (exact from ProPlayerHomeScreen) ──────────────────
  useEffect(() => {
    if (!homeData || !user?.id) return;
    let cancelled = false;
    const handle = requestAnimationFrame(() => {
      if (cancelled) return;
      const queries = [
        ["/api/player/me/progress-data", "tennis"],
        ["/api/player/me/community-data"],
        ["/api/player/me/ai-coach-data"],
      ];
      for (const queryKey of queries) {
        queryClient.prefetchQuery({ queryKey }).catch(() => {});
      }
    });
    return () => { cancelled = true; cancelAnimationFrame(handle); };
  }, [homeData, queryClient, user?.id]);

  // ── Focus invalidation (exact from ProPlayerHomeScreen) ──────────────────
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
    }, [queryClient]),
  );

  // ── Auth-ready watcher (exact from ProPlayerHomeScreen #1495) ─────────────
  const homeDataFetchedOnAuthRef = useRef(false);
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  useEffect(() => {
    if (!user?.playerId || isGuest) return;
    if (homeDataFetchedOnAuthRef.current) return;
    homeDataFetchedOnAuthRef.current = true;
    queryClientRef.current.refetchQueries({
      queryKey: ["/api/player/me/home-data"],
      type: "active",
    });
  }, [user?.playerId, isGuest]);


  // ── Handlers (exact from ProPlayerHomeScreen) ─────────────────────────────
  const handleAvatarPress = () => { guardAction(() => openDrawer()); };
  const handleWalletPress = () => { guardAction(() => setShowPinModal(true)); };
  const handleSquadPress = () => {
    guardAction(() => { track("home:family_lobby"); (navigation as any).navigate("FamilyLobby"); });
  };

  const handleBookLesson = () => {
    guardAction(() => {
      if (isMultiSport && activeSports.length > 1) {
        setShowBookingSportPicker(true);
      } else {
        setBookingWizardSport(activeSport);
        setShowBookingWizard(true);
      }
    });
  };

  const handleRateEndedSession = useCallback(() => {
    const now = Date.now();
    // Only surface ended sessions (endTime or computed end <= now), most recent first
    const candidate = sessionHistoryForTrigger?.sessions?.find((s) => {
      if (s.checkin != null) return false;
      const endMs = s.endTime
        ? new Date(s.endTime).getTime()
        : new Date(s.startTime).getTime() + 60 * 60 * 1000;
      return endMs <= now;
    });
    if (candidate) {
      setCheckinModalSession({
        sessionId: candidate.sessionId,
        sessionTitle: candidate.sessionType
          ? candidate.sessionType.charAt(0).toUpperCase() + candidate.sessionType.slice(1).replace(/_/g, " ") + " Session"
          : "Session",
        coachName: candidate.coachName ?? undefined,
      });
    }
    // No fallback to nextSession — future sessions cannot be checked in
  }, [sessionHistoryForTrigger]);

  const handleBookingSuccess = () => {
    setShowBookingWizard(false);
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
  };

  // ── Memoized style objects ─────────────────────────────────────────────────
  const scrollContentStyle = useMemo(
    () => [styles.scrollContent, { paddingTop: insets.top, paddingBottom: insets.bottom + 180 }],
    [insets.top, insets.bottom],
  );

  const handleFocusCTA = useCallback((action: string) => {
    if (action === "view_session" || action === "book_session") {
      handleBookLesson();
    } else if (action === "open_quests") {
      track("home:focus_cta_quests");
      navigateToTab("Growth", { screen: "QuestsMain" });
    }
  }, [handleBookLesson, navigateToTab, track]);

  // ── DNA completion for NewPlayerGuideCard ─────────────────────────────────
  const dnaPct = useMemo(() => {
    const p = homeData?.profile as Record<string, unknown> | null | undefined;
    if (!p?.player) return 0;
    const pp = p.player as Record<string, unknown>;
    const DNA_FIELDS = [
      !!pp.dominantHand, !!pp.backhandType, !!pp.height, !!pp.tshirtSize,
      !!pp.playStyle, !!pp.tennisIdol,
      Array.isArray(pp.enjoymentTags) && (pp.enjoymentTags as unknown[]).length > 0,
      !!pp.shortTermGoal, !!pp.longTermDream,
      Array.isArray(pp.typicalPlayTimes) && (pp.typicalPlayTimes as unknown[]).length > 0,
      !!pp.profilePhotoUrl,
    ];
    const filled = DNA_FIELDS.filter(Boolean).length;
    return Math.round((filled / DNA_FIELDS.length) * 100);
  }, [homeData?.profile]);

  const hasGoal = useMemo(() => {
    const p = homeData?.profile as Record<string, unknown> | null | undefined;
    if (!p?.player) return false;
    const pp = p.player as Record<string, unknown>;
    return !!pp.shortTermGoal;
  }, [homeData?.profile]);

  const sessionCount = useMemo(() => {
    const ns = effectiveData?.nextSession;
    return ns ? 1 : 0;
  }, [effectiveData?.nextSession]);

  const isNewPlayer = useMemo(() => {
    return !effectiveData?.academy || (player.level <= 2 && dnaPct < 40 && sessionCount === 0);
  }, [effectiveData?.academy, player.level, dnaPct, sessionCount]);

  return (
    <ScrollPositionContext.Provider value={scrollController.contextValue}>
      <View style={styles.root}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={scrollContentStyle}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          removeClippedSubviews={true}
          onScroll={onHomeScroll}
          refreshControl={
            <RefreshControl
              refreshing={isManualRefreshing}
              onRefresh={handleManualRefresh}
              tintColor={Colors.dark.accentText}
              colors={[GlowColors.primary]}
            />
          }
        >
          {/* PLAYER HEADER */}
          <View style={styles.headerSection}>
            <ProPlayerCard
              player={player}
              credits={credits}
              academyName={effectiveData?.academy?.name}
              onAvatarPress={handleAvatarPress}
              onWalletPress={handleWalletPress}
              onSquadPress={handleSquadPress}
              showSquadSwitch={true}
              onNotificationPress={() => {
                guardAction(() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  (navigation as any).navigate("PlayerNotifications");
                });
              }}
              unreadNotificationCount={unreadCount}
              accessibilityLabel={`Player card for ${player.name}, level ${player.level}, ${player.xp} XP`}
            />
          </View>

          {/* ACHIEVEMENT NUDGE STRIP */}
          {!isGuest && achievementNudge ? (
            <Pressable
              style={styles.nudgeStrip}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                (navigation as any).navigate("PlayerProfile");
              }}
            >
              <View style={[styles.nudgeIconWrap, { backgroundColor: achievementNudge.iconColor + "20" }]}>
                <Ionicons name={achievementNudge.iconName as IoniconsName} size={18} color={achievementNudge.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nudgeTitle} numberOfLines={1}>
                  {achievementNudge.sessionsAway === 1
                    ? `1 session away from "${achievementNudge.name}"`
                    : `${achievementNudge.sessionsAway} sessions away from "${achievementNudge.name}"`}
                </Text>
                <View style={styles.nudgeBarTrack}>
                  <View
                    style={[
                      styles.nudgeBarFill,
                      {
                        width: `${Math.min(
                          (achievementNudge.currentProgress / achievementNudge.triggerThreshold) * 100,
                          100,
                        )}%` as DimensionValue,
                        backgroundColor: achievementNudge.iconColor,
                      },
                    ]}
                  />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={14} color={achievementNudge.iconColor} />
            </Pressable>
          ) : null}

          {/* PLAYER DNA BANNER */}
          {!isGuest && player?.id ? <PlayerDNABanner playerId={player.id} /> : null}

          {/* STREAK MILESTONE BANNER */}
          {!isGuest && player.streak > 0 ? (
            <StreakMilestoneBanner streak={player.streak} />
          ) : null}

          {/* TODAY'S FOCUS CARD */}
          {!isGuest && homeData?.dailyFocus ? (
            <TodaysFocusCard
              focus={homeData.dailyFocus}
              onCTA={handleFocusCTA}
            />
          ) : null}

          {/* NEW PLAYER ONBOARDING GUIDE */}
          {!isGuest && isNewPlayer ? (
            <NewPlayerGuideCard
              dnaPct={dnaPct}
              sessionCount={sessionCount}
              hasGoal={hasGoal}
              onBookSession={handleBookLesson}
            />
          ) : null}

          {/* BIRTHDAY BANNER */}
          {isBirthday ? (
            <BirthdayBanner playerName={player.name || "Champion"} playerAge={playerAge} />
          ) : null}

          {/* BIRTHDAY XP BONUS */}
          {isBirthday ? <BirthdayXPBonusCard /> : null}

          {/* RAMADAN BANNER */}
          {isRamadan && !isBirthday && !ramadanDismissed ? (
            <RamadanBanner playerName={player.name || "Champion"} onDismiss={handleDismissRamadan} />
          ) : null}

          {/* RAMADAN BONUS CARD */}
          {isRamadan && !isBirthday && !ramadanDismissed ? (
            <RamadanBonusCard onDismiss={handleDismissRamadan} />
          ) : null}

          {/* HERO CAROUSEL */}
          <HeroCarousel onBookSession={handleBookLesson} onRateSession={handleRateEndedSession} />

          {/* UPCOMING PROVIDER SESSION */}
          {!isGuest ? (
            <LazyOnScroll prefetchOffset={400} minHeight={1}>
              <UpcomingProviderSessionCard />
            </LazyOnScroll>
          ) : null}

          {/* WELCOME / GUIDE */}
          <WelcomeGuideCard />

          {/* TRAINING LOAD */}
          <LazyOnScroll prefetchOffset={300} minHeight={130}>
            <TrainingLoadCard />
          </LazyOnScroll>

          {/* COACHES RAIL */}
          {!isGuest ? (
            <LazyOnScroll prefetchOffset={400} minHeight={180}>
              <CoachesRail />
            </LazyOnScroll>
          ) : null}

          {/* PLAYERS NEAR YOU */}
          {!isFreePlayer && !isGuest ? (
            <LazyOnScroll minHeight={160}>
              <PlayersNearYouRow />
            </LazyOnScroll>
          ) : null}

          {/* COUNTRY LEADERBOARDS */}
          {!isGuest ? (
            <LazyOnScroll minHeight={120}>
              <CountryLeaderboardsEntry />
            </LazyOnScroll>
          ) : null}

          {/* IMPROVE SECTION — AI Coach + Player of the Week + Quests */}
          {!isGuest ? (
            <LazyOnScroll minHeight={240}>
              <View style={styles.sectionDivider}>
                <Ionicons name="trending-up" size={12} color={Colors.dark.accentText} />
                <Text style={styles.sectionDividerText}>IMPROVE</Text>
              </View>

              {/* GLOW ASSESSMENT CARD — shown for beginner/default rank players */}
              <GlowAssessmentCard
                glowRank={playerCtx.glowRank ?? 9}
                playerId={player.id}
              />

              <View style={styles.improveCardGap} />

              <AICoachHomeCard
                aiStatus={homeData?.aiProStatus ?? null}
                aiCoachContext={homeData?.aiCoachContext ?? null}
                weeklyDigest={(homeData?.weeklyDigest ?? null) as any}
                energyInsight={checkinInsightData?.insight ?? null}
              />

              <View style={styles.improveCardGap} />

              <PlayerOfTheWeekCard
                currentWeek={(homeData?.spotlightCurrentWeek ?? null) as any}
                weeklyWinner={(homeData?.spotlightWeeklyWinner ?? { winner: null }) as any}
                onNominate={() => setShowSpotlightNomination(true)}
                onViewDetails={() => navigation.navigate("SpotlightDetail" as never)}
              />

              <View style={styles.improveCardGap} />

              <QuestsCard
                onQuestPress={() => {
                  track("home:quest_tracker");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigateToTab("Growth", { screen: "QuestsMain" });
                }}
              />

              {/* RecentFeedback & UpcomingAppointment — academy-only */}
              {!isFreePlayer ? (
                <>
                  <RecentFeedbackCard />
                  <UpcomingAppointmentCard />
                </>
              ) : null}
            </LazyOnScroll>
          ) : null}

          {/* SQUAD VS SQUAD */}
          {!isGuest && !isFreePlayer ? (
            <LazyOnScroll minHeight={180}>
              <SquadVsSquadWidget />
            </LazyOnScroll>
          ) : null}

          {/* COMMUNITY */}
          {!isGuest ? (
            <LazyOnScroll>
              <MiniFeed />
            </LazyOnScroll>
          ) : null}

          {/* SHOP */}
          {!isGuest ? (
            <LazyOnScroll>
              <GlowMarketSpotlight />
            </LazyOnScroll>
          ) : null}

          {/* JOIN ACADEMY — free players only */}
          {isFreePlayer && !isGuest ? <JoinAcademySoftCard /> : null}
        </ScrollView>

        {/* MODE SWITCHER */}
        <CollapsibleModeSwitcher />

        {/* SPORT PICKER MODAL */}
        <Modal
          visible={showBookingSportPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowBookingSportPicker(false)}
        >
          <Pressable
            style={styles.sportPickerScrim}
            onPress={() => setShowBookingSportPicker(false)}
          >
            <View style={styles.sportPickerSheet}>
              <Text style={styles.sportPickerTitle}>Book Lesson In</Text>
              {SPORT_DEFINITIONS.filter((s) => activeSports.includes(s.key)).map((sportDef) => {
                const isSelected = bookingWizardSport === sportDef.key;
                return (
                  <Pressable
                    key={sportDef.key}
                    style={[
                      styles.sportPickerRow,
                      {
                        borderColor: isSelected
                          ? getSportColor(sportDef.key)
                          : Colors.dark.chipBackgroundStrong,
                        backgroundColor: isSelected
                          ? getSportColor(sportDef.key) + "15"
                          : "transparent",
                      },
                    ]}
                    onPress={() => {
                      setBookingWizardSport(sportDef.key);
                      setShowBookingSportPicker(false);
                      setTimeout(() => setShowBookingWizard(true), 350);
                    }}
                  >
                    <View
                      style={[
                        styles.sportDot,
                        { backgroundColor: getSportColor(sportDef.key) },
                      ]}
                    />
                    <Text
                      style={[
                        styles.sportPickerLabel,
                        isSelected ? { color: getSportColor(sportDef.key) } : null,
                      ]}
                    >
                      {getSportLabel(sportDef.key)}
                    </Text>
                    {isSelected ? (
                      <Ionicons name="checkmark" size={18} color={getSportColor(sportDef.key)} />
                    ) : null}
                  </Pressable>
                );
              })}
              <Pressable
                style={styles.sportPickerCancel}
                onPress={() => setShowBookingSportPicker(false)}
              >
                <Text style={styles.sportPickerCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* BOOKING WIZARD */}
        <PlayerBookingWizard
          visible={showBookingWizard}
          onClose={() => setShowBookingWizard(false)}
          onBookingSuccess={handleBookingSuccess}
          sport={bookingWizardSport}
        />

        {/* PIN MODAL */}
        <PinEntryModal
          visible={showPinModal}
          onClose={() => setShowPinModal(false)}
          onSuccess={() => {
            setShowPinModal(false);
            (navigation as any).navigate("ParentCreditStore", { playerId: player?.id });
          }}
        />

        {/* GUEST PROMPT */}
        <GuestPromptModal {...promptProps} />

        {/* SPOTLIGHT NOMINATION */}
        <SpotlightNominationModal
          visible={showSpotlightNomination}
          onClose={() => setShowSpotlightNomination(false)}
        />

        {/* POST-SESSION CHECK-IN */}
        {checkinModalSession ? (
          <PostSessionCheckInModal
            visible={checkinModalSession != null}
            sessionId={checkinModalSession.sessionId}
            sessionTitle={checkinModalSession.sessionTitle}
            coachName={checkinModalSession.coachName}
            onClose={() => setCheckinModalSession(null)}
          />
        ) : null}

        {/* BETA FEEDBACK */}
        <BetaFeedbackButton
          playerId={player?.id}
          playerName={player?.name}
          bottomOffset={145}
        />

      </View>

      {/* ACHIEVEMENT CELEBRATION — fires from home when a milestone is hit */}
      {celebrationAchievement ? (
        <AchievementCelebrationModal
          achievement={celebrationAchievement}
          onClose={onCloseCelebration}
        />
      ) : null}

    </ScrollPositionContext.Provider>
  );
});

// ─── Root — wraps content in PlayerStateProvider ───────────────────────────
export default function ProPlayerHomeDiagnosticScreen() {
  return (
    <PlayerStateProvider>
      <DiagnosticHomeContent />
    </PlayerStateProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollView: { flex: 1 },
  scrollContent: { gap: 0 },
  headerSection: { paddingHorizontal: 0 },
  // Sport picker modal
  sportPickerScrim: {
    flex: 1,
    backgroundColor: Colors.dark.modalScrim,
  },
  sportPickerSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  sportPickerTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  sportPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
  },
  sportDot: { width: 10, height: 10, borderRadius: 5 },
  sportPickerLabel: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  sportPickerCancel: {
    marginTop: Spacing.xs,
    padding: Spacing.sm,
    alignItems: "center",
  },
  sportPickerCancelText: {
    color: Colors.dark.textMuted,
    fontSize: 15,
  },
  // Section divider (IMPROVE heading)
  sectionDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionDividerText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: Colors.dark.accentText,
  },
  improveCardGap: {
    height: Spacing.sm,
  },
  nudgeStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  nudgeIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  nudgeTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  nudgeBarTrack: {
    height: 3,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: 2,
    overflow: "hidden",
  },
  nudgeBarFill: {
    height: 3,
    borderRadius: 2,
  },
});

