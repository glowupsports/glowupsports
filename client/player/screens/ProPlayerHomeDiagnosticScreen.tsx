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
  Platform,
  NativeScrollEvent,
  NativeSyntheticEvent} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

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
import { PrimaryActionsRow } from "@/player/components/PrimaryActionsRow";
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
import SquadVsSquadWidget from "@/components/SquadVsSquadWidget";
import { AICoachHomeCard } from "@/player/components/AICoachHomeCard";
import { PlayerOfTheWeekCard } from "@/player/components/PlayerOfTheWeekCard";
import { MiniFeed } from "@/player/components/MiniFeed";
import { GlowMarketSpotlight } from "@/player/components/GlowMarketSpotlight";
import { BetaFeedbackButton } from "@/player/components/BetaFeedbackButton";

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
function QuestsCard({ onQuestPress }: { onQuestPress: () => void }) {
  const { user } = useAuth();
  const { data: questsData } = useQuests(!!user?.playerId);
  const { quest, questType } = useMemo(() => {
    if (!questsData) return { quest: null as Quest | null, questType: null as "daily" | "weekly" | null };
    const dailyActive = questsData.daily.filter((q) => q.status === "active" || q.status === "in_progress");
    const weeklyActive = questsData.weekly.filter((q) => q.status === "active" || q.status === "in_progress");
    const tagged: { quest: Quest; type: "daily" | "weekly" }[] = [
      ...dailyActive.map((q) => ({ quest: q, type: "daily" as const })),
      ...weeklyActive.map((q) => ({ quest: q, type: "weekly" as const })),
    ];
    if (tagged.length === 0) return { quest: null as Quest | null, questType: null as "daily" | "weekly" | null };
    const sorted = tagged.sort((a, b) => {
      const aRatio = a.quest.targetProgress > 0 ? a.quest.currentProgress / a.quest.targetProgress : 0;
      const bRatio = b.quest.targetProgress > 0 ? b.quest.currentProgress / b.quest.targetProgress : 0;
      return bRatio - aRatio;
    });
    return { quest: sorted[0].quest as Quest | null, questType: sorted[0].type as "daily" | "weekly" | null };
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
            {quest ? (questType === "weekly" ? "WEEKLY QUEST" : "DAILY QUEST") : "QUESTS"}
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
}

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
function PlayerDNABanner({ playerId }: { playerId: string }) {
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
        navigation.navigate("PlayerDNAWizard");
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
}

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
function DiagnosticHomeContent() {
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
  }>({
    queryKey: ["/api/player/me/home-data"],
    enabled: !!user?.playerId && !isGuest,
    staleTime: 0,
    refetchInterval: 120 * 1000,
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

  // ── Derived data (exact from ProPlayerHomeScreen) ─────────────────────────
  const dashboardData = homeData?.dashboard ?? undefined;
  const unreadCount = homeData?.unreadCount?.count ?? 0;
  const effectiveData = dashboardData;

  // ── Player shape (exact from ProPlayerHomeScreen) ─────────────────────────
  const dashboardPlayer = effectiveData?.player;
  const player = {
    id: dashboardPlayer?.id ?? user?.playerId ?? "",
    name: dashboardPlayer?.name ?? user?.displayName ?? user?.username ?? "",
    level: dashboardPlayer?.level ?? playerCtx.level ?? 1,
    xp: dashboardPlayer?.xp ?? playerCtx.xp ?? 0,
    glowScore: dashboardPlayer?.glowScore ?? playerCtx.glowScore ?? 0,
    ballLevel: dashboardPlayer?.ballLevel ?? playerCtx.ballLevel ?? null,
    streak: dashboardPlayer?.streak ?? 0,
    profilePhotoUrl: dashboardPlayer?.profilePhotoUrl ?? user?.profilePhotoUrl ?? null,
    dateOfBirth: dashboardPlayer?.dateOfBirth ?? null,
    playStyle: dashboardPlayer?.playStyle ?? null,
  };
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

  // ── Seed legacy query keys (exact from ProPlayerHomeScreen) ───────────────
  useEffect(() => {
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

  // ── iOS cold-start retry timers (exact from ProPlayerHomeScreen #1491) ────
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const t1 = setTimeout(() => { queryClient.refetchQueries({ queryKey: ["/api/player/me/home-data"], type: "active" }); }, 800);
    const t2 = setTimeout(() => { queryClient.refetchQueries({ queryKey: ["/api/player/me/home-data"], type: "active" }); }, 1800);
    const t3 = setTimeout(() => { queryClient.refetchQueries({ queryKey: ["/api/player/me/home-data"], type: "active" }); }, 3000);
    const t4 = setTimeout(() => { queryClient.refetchQueries({ queryKey: ["/api/player/me/home-data"], type: "active" }); }, 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [queryClient]);

  // ── Handlers (exact from ProPlayerHomeScreen) ─────────────────────────────
  const handleAvatarPress = () => { guardAction(() => openDrawer()); };
  const handleWalletPress = () => { guardAction(() => setShowPinModal(true)); };
  const handleSquadPress = () => {
    guardAction(() => { track("home:family_lobby"); navigation.navigate("FamilyLobby"); });
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

  const handleBookingSuccess = () => {
    setShowBookingWizard(false);
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
  };

  return (
    <ScrollPositionContext.Provider value={scrollController.contextValue}>
      <View style={styles.root}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top, paddingBottom: insets.bottom + 180 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
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
                  navigation.navigate("PlayerNotifications");
                });
              }}
              unreadNotificationCount={unreadCount}
              accessibilityLabel={`Player card for ${player.name}, level ${player.level}, ${player.xp} XP`}
            />
          </View>

          {/* PLAYER DNA BANNER */}
          {!isGuest && player?.id ? <PlayerDNABanner playerId={player.id} /> : null}

          {/* PERSONALIZED GREETING */}
          <PrimaryActionsRow
            firstName={player.name}
            nextSessionDate={effectiveData?.nextSession?.date ?? null}
            nextSessionEndTime={effectiveData?.nextSession?.endTime ?? null}
          />

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
          <HeroCarousel onBookSession={handleBookLesson} />

          {/* UPCOMING PROVIDER SESSION */}
          {!isGuest ? (
            <LazyOnScroll prefetchOffset={400} minHeight={1}>
              <UpcomingProviderSessionCard />
            </LazyOnScroll>
          ) : null}

          {/* WELCOME / GUIDE */}
          <WelcomeGuideCard />

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

              <AICoachHomeCard
                aiStatus={homeData?.aiProStatus ?? null}
                aiCoachContext={homeData?.aiCoachContext ?? null}
                weeklyDigest={homeData?.weeklyDigest ?? null}
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
            navigation.navigate("ParentCreditStore", { playerId: player?.id });
          }}
        />

        {/* GUEST PROMPT */}
        <GuestPromptModal {...promptProps} />

        {/* SPOTLIGHT NOMINATION */}
        <SpotlightNominationModal
          visible={showSpotlightNomination}
          onClose={() => setShowSpotlightNomination(false)}
        />

        {/* BETA FEEDBACK */}
        <BetaFeedbackButton
          playerId={player?.id}
          playerName={player?.name}
          bottomOffset={145}
        />

      </View>
    </ScrollPositionContext.Provider>
  );
}

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
});

