/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    LEGACY FILE — DO NOT USE FOR NEW WORK                    ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  This file is the OLD V1-navigator player home screen.  It is NO LONGER     ║
 * ║  the active home tab.  Do not add features or bug-fixes here.               ║
 * ║                                                                              ║
 * ║  THE CANONICAL HOME SCREEN IS:                                              ║
 * ║    client/player/screens/ProPlayerHomeDiagnosticScreen.tsx                  ║
 * ║                                                                              ║
 * ║  This file is kept only as a reference / V1 navigator fallback.             ║
 * ║  All new player-home work must go into ProPlayerHomeDiagnosticScreen.tsx.   ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import * as Sentry from "@sentry/react-native";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { useTranslation } from "react-i18next";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, DimensionValue, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform } from "react-native";
import { LazyOnScroll, ScrollPositionContext, useScrollPositionController } from "@/player/components/LazyOnScroll";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { Spacing, GlowColors, Backgrounds, BorderRadius, Colors } from "@/constants/theme";
import { Skeleton, SkeletonCard, SkeletonSessionCard } from "@/components/SkeletonLoader";
import { useAuth, type AuthPlayer } from "@/coach/context/AuthContext";
import { useSport, SPORT_DEFINITIONS, getSportColor, getSportLabel, type Sport } from "@/player/context/SportContext";
import { usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { GuestPromptModal, useGuestGuard } from "@/components/GuestPromptModal";
import { PlayerStateProvider , usePlayerState } from "@/player/context/PlayerStateContext";
import { usePlayer } from "@/player/context/PlayerContext";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { ProPlayerCard } from "@/player/components/ProPlayerCard";
import { PrimaryActionsRow } from "@/player/components/PrimaryActionsRow";
import { PlayersNearYouRow, CountryLeaderboardsEntry } from "@/player/components/DiscoveryRows";
import { GlowMarketSpotlight } from "@/player/components/GlowMarketSpotlight";
import { MiniFeed } from "@/player/components/MiniFeed";
import { HeroCarousel } from "@/player/components/HeroCarousel";
import { BetaFeedbackButton } from "@/player/components/BetaFeedbackButton";
import PlayerBookingWizard from "@/player/components/PlayerBookingWizard";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import SquadVsSquadWidget from "@/components/SquadVsSquadWidget";
import { PlayerOfTheWeekCard } from "@/player/components/PlayerOfTheWeekCard";
import { AICoachHomeCard } from "@/player/components/AICoachHomeCard";
import PinEntryModal from "@/components/PinEntryModal";
import ChooseUsernameModal from "@/player/components/ChooseUsernameModal";
import { BirthdayConfettiOverlay , BirthdayBanner, BirthdayXPBonusCard } from "@/player/components/BirthdayThemeOverlay";
import { RamadanConfettiOverlay, RamadanBanner, RamadanBonusCard } from "@/player/components/RamadanCelebrationOverlay";
import { RecentFeedbackCard } from "@/player/components/RecentFeedbackCard";
import { FeedbackToast } from "@/player/components/FeedbackToast";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import SpotlightNominationModal from "@/player/components/SpotlightNominationModal";
import { WelcomeGuideCard } from "@/player/components/WelcomeGuideCard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuests, Quest } from "@/player/hooks/useQuests";
import { UpcomingProviderSessionCard } from "@/player/components/UpcomingProviderSessionCard";
import { UpcomingAppointmentCard } from "@/player/components/UpcomingAppointmentCard";
import { CoachesRail, JoinAcademySoftCard } from "@/player/components/CoachesRail";

import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
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
  coach: {
    id: string;
    name: string;
  } | null;
  academy: {
    id: string;
    name: string;
  } | null;
  nextSession: {
    id: string;
    date: string;
    type: string;
    courtName?: string;
    endTime?: string;
    isLive?: boolean;
    coachName?: string;
  } | null;
  credits?: {
    total: number;
    group: number;
    private: number;
    semi_private: number;
  };
  isFreePlayer?: boolean;
  lastFeedback?: { message: string; date: string } | null;
}




interface SpotlightNomineeMini {
  playerId: string;
  playerName: string;
  profilePhotoUrl: string | null;
  totalVotes: number;
}
interface SpotlightCurrentWeekMini {
  weekStart: string;
  nominations: SpotlightNomineeMini[];
  myNomination: { nominatedPlayerId: string; reason: string } | null;
  daysRemaining: number;
  totalVotes: number;
}
interface SpotlightWeeklyWinnerMini {
  playerId: string;
  playerName: string;
  profilePhotoUrl: string | null;
}

function QuestsCard({
  onQuestPress,
}: {
  onQuestPress: () => void;
}) {
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
          <Text style={qc.questName} numberOfLines={2}>
            {quest.name}
          </Text>
          <View style={qc.progressBar}>
            <View
              style={[
                qc.progressFill,
                {
                  width: `${Math.max(questProgress * 100, 2)}%` as DimensionValue,
                  backgroundColor: quest.iconColor || GlowColors.primary,
                },
              ]}
            />
          </View>
          <View style={qc.footer}>
            <Text style={qc.progressText}>
              {quest.currentProgress}/{quest.targetProgress}
            </Text>
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

const qc = makeReactiveStyles(() =>
  StyleSheet.create({
    card: {
      marginHorizontal: Spacing.lg,
      backgroundColor: "rgba(255,133,27,0.06)",
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: "rgba(255,133,27,0.18)",
      padding: Spacing.md,
      gap: 8,
    },
    pressed: { opacity: 0.82 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    label: {
      fontSize: 10,
      fontWeight: "800",
      color: GlowColors.orange,
      letterSpacing: 1.2,
    },
    questName: {
      fontSize: 14,
      fontWeight: "700",
      color: Colors.dark.text,
      lineHeight: 18,
    },
    emptyText: {
      fontSize: 13,
      color: Colors.dark.textMuted,
    },
    progressBar: {
      height: 4,
      backgroundColor: Colors.dark.chipBackgroundStrong,
      borderRadius: 2,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 2,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    progressText: {
      fontSize: 11,
      color: Colors.dark.textSubtle,
      fontWeight: "700",
    },
    xpRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    xpText: {
      fontSize: 11,
      fontWeight: "700",
      color: Colors.dark.gold,
    },
  })
);


function PlayerHomeContent() {
  useThemeReactivity();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const track = useTrackFeature();
  const { user, isGuest, patchPlayer } = useAuth();
  // Task #1455 — pull the in-memory player snapshot so the header
  // (avatar, name, level, XP, ball level) can paint on first frame
  // instead of waiting for the home god-query. `usePlayer()` is
  // backed by the lightweight `/api/player/me` query that PlayerContext
  // owns and arrives well before `/api/player/me/home-data` does.
  const playerCtx = usePlayer();
  const { openDrawer } = usePlayerDrawer();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  const { guardAction, promptProps } = useGuestGuard();
  const { isMultiSport, activeSports, activeSport } = useSport();
  usePlayerState();
  // Shares cache key with PlayScreen so the home tile counts can mirror the
  // exact scope (mine vs. all) used by the live player feed.
  // Task #1379 — Player home god-query.
  //
  // The home screen used to fan out at mount: `/api/player/me/dashboard`,
  // `/api/player/me/profile`, `/api/player/me/notifications/unread-count`
  // (and, via subcomponents on the same render pass, weekly-digest +
  // ai-coach/context). On iOS the JS<->native bridge serialises those
  // requests harder than Android, so the player home felt loodzwaar
  // compared to the coach home — which fans into a single god-query.
  //
  // We now mirror coach-home: one HTTP call returns every blob we need
  // above the fold. The legacy per-resource endpoints stay alive and
  // unchanged for child components / deep links / other screens. We
  // also prime the React Query cache for those legacy keys (see effect
  // below) so any subcomponent that still calls `useQuery(["/api/player/me/profile"])`
  // resolves instantly from cache instead of triggering its own fetch.
  const { data: homeData, isLoading, refetch } = useQuery<{
    dashboard: DashboardData | null;
    // Task #1419 — `profile` is now the FULL `/api/player/me/profile`
    // shape (player+coach+academy+stats+social+countryLadders) so we
    // can seed the legacy `["/api/player/me/profile"]` queryKey and
    // give PlayerDNABanner / TennisIQTile / TennisIQQuizModal cache
    // hits instead of letting them fan out 3 extra requests on cold
    // start. The screen itself only reads `profile.academy`, so we
    // type the consumed slice loosely as a Record passthrough.
    profile: Record<string, unknown> | null;
    unreadCount: { count: number };
    weeklyDigest: any;
    aiCoachContext: any;
    // Task #1418 — added to god-route to eliminate the two extra
    // mount-time spotlight requests that were stacking on the JS bridge
    // during cold start.
    spotlightCurrentWeek: SpotlightCurrentWeekMini | null;
    spotlightWeeklyWinner: { winner: SpotlightWeeklyWinnerMini | null };
    // Task #1419 — added to god-route. The legacy useQuery for tennis IQ
    // is gone (Task #1426 removed the dead TennisIQMiniTile component
    // and switched UnifiedImproveCard to read quizScore via props off
    // homeData.profile), but we still seed the legacy key below for any
    // consumer that hasn't been migrated.
    tennisIq: { score: number | null; lastQuizAt: string | null } | null;
    // Task #1419 — folded /api/ai-pro/status here too. The home
    // screen's `isNearLimit` banner used to fire its own useQuery for
    // this, contributing to the cold-start fanout.
    aiProStatus: { isPro: boolean; isCoach: boolean; callCount: number; limit: number } | null;
  }>({
    queryKey: ["/api/player/me/home-data"],
    enabled: !!user?.playerId && !isGuest,
    // Task #1491 — staleTime 0 so React Query always treats home-data as
    // stale on mount and fires a fresh fetch immediately. The previous
    // 30s window was causing iOS cold-start to silently skip the refetch
    // when the initial request had failed (data was undefined but RQ
    // considered the slot "fresh" for 30s). staleTime:0 means every
    // mount that passes the `enabled` gate will produce a real HTTP call,
    // matching the server-side 30s in-memory cache without over-caching
    // on the client.
    staleTime: 0,
    // Old `/notifications/unread-count` query polled every 2 minutes.
    // Keep that cadence on the god-query so the bell badge can update
    // without the user leaving and re-entering the tab — code review
    // caught this as a regression vs. the old per-query setup.
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

  // Derived views — same shape as the old per-query results so the rest
  // of the screen reads identically.
  const dashboardData = homeData?.dashboard ?? undefined;
  const unreadCount = homeData?.unreadCount?.count ?? 0;

  // Prime the legacy query keys so OTHER screens that still useQuery
  // the old endpoints (PlayerDNABanner, PlayerProgressScreen,
  // PlayerScheduleScreen, PlayerTrainingScreen, RecentFeedbackCard) get
  // a cache hit instead of firing their own request. UnifiedImproveCard
  // and the IMPROVE block subcomponents themselves no longer hold any
  // useQuery for these keys (Task #1426); they read everything off the
  // homeData object via props.
  //
  // Task #1419 — the home god-route returns the FULL `profile.player`
  // object including the 10 DNA fields PlayerDNABanner reads
  // (dominantHand, backhandType, height, tshirtSize, playStyle,
  // tennisIdol, enjoymentTags, shortTermGoal, longTermDream,
  // typicalPlayTimes) plus profilePhotoUrl, so seeding
  // `["/api/player/me/profile"]` doesn't break the banner's completion
  // math.
  useEffect(() => {
    if (!homeData) return;
    Sentry.addBreadcrumb({
      category: "player_home",
      message: "home-data resolved, priming legacy query cache",
      level: "info",
      data: {
        hasDashboard: !!homeData.dashboard,
        hasProfile: !!homeData.profile,
        hasAiProStatus: !!homeData.aiProStatus,
        unread: homeData.unreadCount?.count ?? 0,
      },
    });
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
    queryClient.setQueryData(
      ["/api/player/me/weekly-digest"],
      homeData.weeklyDigest ?? null,
    );
    queryClient.setQueryData(
      ["/api/player/me/ai-coach/context"],
      homeData.aiCoachContext ?? null,
    );
    // Task #1418 — seed the spotlight queries so any future consumer
    // (or the SpotlightDetail screen on navigation) hits the cache. The
    // home god-route returns these in the same payload, so we never
    // need a separate request. Task #1426 removed the in-tile useQuery
    // calls in UnifiedImproveCard; this seed is now purely cross-screen.
    queryClient.setQueryData(
      ["/api/player/spotlight/current-week"],
      homeData.spotlightCurrentWeek ?? null,
    );
    queryClient.setQueryData(
      ["/api/player/spotlight/weekly-winner"],
      homeData.spotlightWeeklyWinner ?? { winner: null },
    );
    // Task #1419 — tennis IQ + AI Pro status. Only seed when the
    // server branch resolved (non-null) so a transient backend hiccup
    // doesn't lock subcomponents into a null state for 30s.
    if (homeData.profile) {
      queryClient.setQueryData(
        ["/api/player/me/profile"],
        homeData.profile,
      );
    }
    queryClient.setQueryData(
      ["/api/player/me/tennis-iq"],
      homeData.tennisIq ?? null,
    );
    queryClient.setQueryData(
      ["/api/ai-pro/status"],
      homeData.aiProStatus ?? {
        isPro: false,
        isCoach: false,
        callCount: 0,
        limit: 5,
      },
    );

    // Task #1467 — mirror the freshest player numbers back into
    // AuthContext.player so screens that read via `usePlayer()`
    // (Growth, Me, profile header, ProPlayerCard subtitle on other
    // tabs, etc.) update without the user reopening the app. The
    // home god-query already invalidates on focus, after AI chat,
    // after quest completion and on pull-to-refresh, so this single
    // bridge keeps every consumer of `useAuth().player` live without
    // any per-mutation `refreshAuth()` plumbing. Match-derived fields
    // (glowMmr/glowRank/totalMatchesPlayed) come from the same player
    // record and were added to the dashboard branch in the same task.
    const dp = homeData.dashboard?.player as
      | {
          level?: number;
          xp?: number;
          glowScore?: number;
          ballLevel?: string | null;
          dateOfBirth?: string | null;
          profilePhotoUrl?: string | null;
          glowMmr?: number;
          glowRank?: number;
          totalMatchesPlayed?: number;
        }
      | null
      | undefined;
    if (dp) {
      const patch: Partial<AuthPlayer> = {};
      if (typeof dp.level === "number") patch.level = dp.level;
      if (typeof dp.xp === "number") patch.xp = dp.xp;
      if (typeof dp.glowScore === "number") patch.glowScore = dp.glowScore;
      if (typeof dp.glowMmr === "number") patch.glowMmr = dp.glowMmr;
      if (typeof dp.glowRank === "number") patch.glowRank = dp.glowRank;
      if (typeof dp.totalMatchesPlayed === "number")
        patch.totalMatchesPlayed = dp.totalMatchesPlayed;
      if (dp.ballLevel !== undefined) patch.ballLevel = dp.ballLevel ?? null;
      if (dp.dateOfBirth !== undefined)
        patch.dateOfBirth = dp.dateOfBirth ?? null;
      if (dp.profilePhotoUrl !== undefined)
        patch.profilePhotoUrl = dp.profilePhotoUrl ?? null;
      if (Object.keys(patch).length > 0) {
        patchPlayer(patch);
      }
    }
  }, [homeData, queryClient, patchPlayer]);

  // Task #1419 — prefetch the other player tabs' god-routes once the home
  // god-route resolves and the first paint is done. By the time the user
  // taps Progress / Community / AI Coach, react-query already has the
  // payload in cache, so the next tab paints instantly from cache while
  // the SWR refresh runs in the background. We keep this scheduled
  // through `requestAnimationFrame` to make sure we don't preempt the
  // visible Home paint, and bail entirely if homeData is still null.
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
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [homeData, queryClient, user?.id]);

  const [showBookingWizard, setShowBookingWizard] = useState(false);
  const [bookingWizardSport, setBookingWizardSport] = useState<string | undefined>(undefined);
  const [showBookingSportPicker, setShowBookingSportPicker] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [ramadanDismissed, setRamadanDismissed] = useState(false);

  // Task #1396 — drive section reveal from actual scroll position instead of
  // a blanket `secondaryReady` timer. The previous approach hydrated *every*
  // below-the-fold widget ~1.2s after mount, causing the same ~21 HTTP-call
  // fan-out that the task is trying to eliminate (just shifted off the first
  // frame). With per-section LazyOnScroll wrappers each block now mounts —
  // and triggers its own queries — only when it's about to enter the
  // viewport, so cold start fires ≤10 requests.
  const scrollPosition = useScrollPositionController();
  const onHomeScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollPosition.emit(
        e.nativeEvent.contentOffset.y,
        e.nativeEvent.layoutMeasurement.height,
      );
    },
    [scrollPosition],
  );

  const guestDashboard: DashboardData = useMemo(() => ({
    player: {
      id: "guest",
      name: "Guest",
      level: 1,
      xp: 0,
      glowScore: 0,
      ballLevel: null,
      streak: 0,
    },
    coach: null,
    academy: null,
    nextSession: null,
    isFreePlayer: true,
  }), []);

  // Task #1396 — quests, social feed and shop fetches used to live here so
  // the parent could pre-decide whether MiniFeed/GlowMarketSpotlight should
  // render. They have been pushed into the components themselves
  // (UnifiedImproveCard handles quests; MiniFeed self-gates on empty data;
  // GlowMarketSpotlight already short-circuits when there are no products),
  // so no extra HTTP calls fire on the home tab's cold start.
  const effectiveData = isGuest ? guestDashboard : dashboardData;

  // Task #1491 — Race condition fix: the previous version only called
  // invalidateQueries when user?.playerId was already set. On iOS cold
  // start the auth context isn't fully resolved by the time the first
  // focus event fires, so the invalidation was silently skipped and the
  // home-data query never re-fetched after auth arrived.
  //
  // Fix: always invalidate on focus. The query's own `enabled` guard
  // (!!user?.playerId && !isGuest) ensures no actual HTTP call is made
  // until the auth context is ready — so this is safe for unauthenticated
  // states. When auth resolves after focus, the query is already marked
  // stale (staleTime:0) and React Query fires the fetch immediately on
  // the next render that passes the enabled gate.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
      if (user?.playerId) {
        queryClient.invalidateQueries({ queryKey: [`/api/players/${user.playerId}/credits-summary`] });
      }
    }, [queryClient, user?.playerId])
  );

  // Task #1495 — Auth-ready watcher (primary cold-start fix):
  // On iOS cold start, the useFocusEffect fires and the timer retries
  // below may all trigger BEFORE user.playerId is available. When the
  // query is disabled (enabled: false), refetchQueries is a no-op.
  // React Query's automatic re-enable behaviour is unreliable on iOS.
  // This effect watches exactly when playerId first becomes truthy and
  // fires a refetch at that moment — the query is now enabled and has
  // an active observer, so type: "active" is sufficient and avoids
  // cascading into inactive/disabled queries.
  // A ref sentinel prevents repeated triggers on subsequent renders.
  // queryClient is intentionally captured via ref to keep it out of
  // the dependency array and prevent stale-closure / infinite-loop risk.
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

  // Task #1491 / #1495 — iOS cold-start retry safety net: fire refetch
  // attempts at 800ms, 1800ms, 3000ms and 5000ms after mount. The extra
  // 3s/5s windows cover slow-auth devices where playerId arrives after
  // 1.8s. These are no-ops if the auth-ready watcher above already
  // resolved the query. Uses type: "active" — by the time these timers
  // fire the auth-ready watcher will have run first (if playerId became
  // truthy before the timer) and the query is already enabled.
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const t1 = setTimeout(() => {
      queryClient.refetchQueries({
        queryKey: ["/api/player/me/home-data"],
        type: "active",
      });
    }, 800);
    const t2 = setTimeout(() => {
      queryClient.refetchQueries({
        queryKey: ["/api/player/me/home-data"],
        type: "active",
      });
    }, 1800);
    const t3 = setTimeout(() => {
      queryClient.refetchQueries({
        queryKey: ["/api/player/me/home-data"],
        type: "active",
      });
    }, 3000);
    const t4 = setTimeout(() => {
      queryClient.refetchQueries({
        queryKey: ["/api/player/me/home-data"],
        type: "active",
      });
    }, 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [queryClient]);

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
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }, [effectiveData?.player?.dateOfBirth]);

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
    if (end < start) {
      return today >= start || today <= end;
    }
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

  const isFreePlayer = effectiveData?.isFreePlayer ?? !effectiveData?.academy;

  type ChecklistStep = {
    id: string;
    icon: React.ComponentProps<typeof Ionicons>["name"];
    title: string;
    description: string;
    actionLabel: string;
    onAction: () => void;
    isCompleted: boolean;
  };

  const playerChecklistSteps = useMemo(() => {
    const hasAcademy = !!effectiveData?.academy;
    const hasCoach = !!effectiveData?.coach;
    const hasNextSession = !!effectiveData?.nextSession;
    const hasProfile = !!effectiveData?.player?.profilePhotoUrl;
    
    if (isGuest) {
      return [
        {
          id: "create_account",
          icon: "person-add" as const,
          title: "Create Your Account",
          description: "Sign up to unlock all features and track your progress",
          actionLabel: "Sign Up",
          onAction: () => guardAction(() => {}),
          isCompleted: false,
        },
        {
          id: "browse_courts",
          icon: "tennisball" as const,
          title: "Browse Courts",
          description: "Explore available courts near you",
          actionLabel: "Browse",
          onAction: () => guardAction(() => navigation.navigate("CourtBooking" as never)),
          isCompleted: false,
        },
      ];
    }

    const steps: ChecklistStep[] = [
      {
        id: "complete_profile",
        icon: "person-circle",
        title: t("player.home.completeProfile"),
        description: t("player.home.completeProfileDesc"),
        actionLabel: t("player.home.goToProfile"),
        onAction: () => navigateToTab("Profile"),
        isCompleted: hasProfile,
      },
    ];

    if (isFreePlayer) {
      steps.push({
        id: "book_court",
        icon: "tennisball",
        title: "Book a Court",
        description: "Find and book a court near you",
        actionLabel: "Browse Courts",
        onAction: () => navigation.navigate("CourtBooking" as never),
        isCompleted: false,
      });
      steps.push({
        id: "join_academy",
        icon: "business",
        title: t("player.home.joinAcademy"),
        description: "Optional - join an academy for coaching and training sessions",
        actionLabel: t("player.home.browseAcademies"),
        onAction: () => navigation.navigate("AcademyBrowser" as never),
        isCompleted: hasAcademy,
      });
    } else {
      steps.push({
        id: "join_academy",
        icon: "business",
        title: t("player.home.joinAcademy"),
        description: t("player.home.joinAcademyDesc"),
        actionLabel: t("player.home.browseAcademies"),
        onAction: () => navigation.navigate("AcademyBrowser" as never),
        isCompleted: hasAcademy,
      });
      steps.push({
        id: "book_session",
        icon: "calendar",
        title: t("player.home.bookFirstSession"),
        description: t("player.home.bookFirstSessionDesc"),
        actionLabel: t("player.home.bookSession"),
        onAction: () => setShowBookingWizard(true),
        isCompleted: hasNextSession,
      });
    }

    steps.push({
      id: "check_progress",
      icon: "trending-up",
      title: t("player.home.checkProgress"),
      description: t("player.home.checkProgressDesc"),
      actionLabel: t("player.home.viewProgress"),
      onAction: () => navigateToTab("Growth"),
      isCompleted: false,
    });

    return steps;
  }, [effectiveData, navigation, setShowBookingWizard, isFreePlayer]);

  const [showSpotlightNomination, setShowSpotlightNomination] = useState(false);

  // Task #1455 — full-screen skeleton-gate removed. The old branch
  // returned a single shimmer-blob whenever `homeData` wasn't loaded
  // yet, which on iOS Fabric meant the cold-start blob → real-content
  // transition would visibly stall ("frozen until swipe"). Coach has
  // never had this gate; it always rendered its layout immediately
  // and let kaarten progressief invullen. We now mirror coach: the
  // header paints from `useAuth()` + `usePlayer()` (already in memory
  // before home-data arrives) and each section ships its own
  // mini-skeleton while it's waiting on its slice of the god-query.
  //
  // The error-card branch BELOW stays — it covers the "god-query
  // resolved but the dashboard sub-branch returned null" case, which
  // is a real Sentry-observed failure mode (#1379 retry-card) and
  // can't be folded into the optimistic render.

  // God-query resolved but the critical dashboard branch failed (server
  // returns `dashboard: null` with HTTP 200 in that case so the AI/digest
  // branches can still hydrate). Show a recoverable error card with a
  // retry button instead of locking the user behind a perpetual spinner —
  // code review flagged the old behaviour as a UX gap on transient
  // network hiccups.
  if (!isGuest && homeData && !effectiveData) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: Colors.dark.backgroundRoot }]}>
        <Text style={{ color: Colors.dark.text, fontSize: 16, marginBottom: Spacing.md, textAlign: "center", paddingHorizontal: Spacing.xl }}>
          {t("player.home.loadFailed", "We konden je dashboard even niet laden.")}
        </Text>
        <Pressable
          onPress={() => refetch()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading dashboard"
          style={{
            paddingHorizontal: Spacing.xl,
            paddingVertical: Spacing.md,
            backgroundColor: GlowColors.primary,
            borderRadius: BorderRadius.md,
          }}
        >
          <Text style={{ color: Colors.dark.backgroundRoot, fontWeight: "600" }}>
            {t("player.home.retry", "Opnieuw proberen")}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Task #1455 — defensive header data. `effectiveData` is undefined
  // on cold start until the home god-query resolves. Pulling identity
  // off `useAuth()` + `usePlayer()` lets the ProPlayerCard, hero
  // greeting and modals render with the real avatar/name/level on the
  // very first commit instead of waiting for /home-data. Once
  // /home-data lands, the dashboardData branch wins and supplies the
  // server-of-truth values (streak, profile photo crop, etc.).
  const dashboardPlayer = effectiveData?.player;
  const player = {
    id: dashboardPlayer?.id ?? user?.playerId ?? "",
    name:
      dashboardPlayer?.name ??
      user?.displayName ??
      user?.username ??
      "",
    level: dashboardPlayer?.level ?? playerCtx.level ?? 1,
    xp: dashboardPlayer?.xp ?? playerCtx.xp ?? 0,
    glowScore: dashboardPlayer?.glowScore ?? playerCtx.glowScore ?? 0,
    ballLevel: dashboardPlayer?.ballLevel ?? playerCtx.ballLevel ?? null,
    streak: dashboardPlayer?.streak ?? 0,
    profilePhotoUrl:
      dashboardPlayer?.profilePhotoUrl ?? user?.profilePhotoUrl ?? null,
    dateOfBirth: dashboardPlayer?.dateOfBirth ?? null,
    playStyle: dashboardPlayer?.playStyle ?? null,
  };
  const credits = effectiveData?.credits;
  
  const handleAvatarPress = () => {
    guardAction(() => openDrawer());
  };

  const handleWalletPress = () => {
    guardAction(() => setShowPinModal(true));
  };

  const handleSquadPress = () => {
    guardAction(() => {
      track("home:family_lobby");
      navigation.navigate("FamilyLobby");
    });
  };

  const handleBookLesson = () => {
    guardAction(() => {
      if (isMultiSport && activeSports.length > 1) {
        setBookingWizardSport(activeSport);
        setShowBookingSportPicker(true);
      } else {
        setBookingWizardSport(activeSport);
        setShowBookingWizard(true);
      }
    });
  };

  const handleBookingSuccess = () => {
    setShowBookingWizard(false);
    // Bust both the new god-query and the legacy dashboard key so any
    // consumer (this screen + any subscreen still reading the legacy
    // key directly) refreshes after a booking. Without invalidating
    // home-data the hero/next-session tile would stay stale until tab
    // focus or manual refresh.
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
    queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      {isBirthday && <BirthdayConfettiOverlay />}
      {isRamadan && !isBirthday && !ramadanDismissed && <RamadanConfettiOverlay />}
      
      <FeedbackToast />
      <ChooseUsernameModal />

      <ScrollPositionContext.Provider value={scrollPosition.contextValue}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top, paddingBottom: insets.bottom + 180 },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={onHomeScroll}
        scrollEventThrottle={64}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefreshing}
            onRefresh={handleManualRefresh}
            tintColor={Colors.dark.accentText}
            colors={[GlowColors.primary]}
          />
        }
      >
        {/* PLAYER HEADER - Identity card (compact via #884) sits at the top */}
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
              accessibilityLabel={`Player card for ${player.name}, ${t("player.home.glowLevel")} ${player.level}, ${player.xp} ${t("player.home.xpPoints")}`}
            />
          </View>

        {/* PLAYER DNA BANNER - shows profile completion progress, stays close to identity */}
        {!isGuest && player?.id ? <PlayerDNABanner playerId={player.id} /> : null}

        {/* PERSONALIZED GREETING — directly under the player card */}
        <PrimaryActionsRow
          firstName={player.name}
          nextSessionDate={effectiveData?.nextSession?.date ?? null}
          nextSessionEndTime={effectiveData?.nextSession?.endTime ?? null}
        />

        {/* BIRTHDAY BANNER - Festive celebration on birthday */}
        {isBirthday && (
          <BirthdayBanner 
            playerName={player.name || "Champion"} 
            playerAge={playerAge}
          />
        )}

        {/* BIRTHDAY XP BONUS - 2x XP message on birthday */}
        {isBirthday && <BirthdayXPBonusCard />}

        {/* RAMADAN BANNER - Festive celebration during Ramadan */}
        {isRamadan && !isBirthday && !ramadanDismissed && (
          <RamadanBanner playerName={player.name || "Champion"} onDismiss={handleDismissRamadan} />
        )}

        {/* RAMADAN BONUS CARD - Blessings card during Ramadan */}
        {isRamadan && !isBirthday && !ramadanDismissed && <RamadanBonusCard onDismiss={handleDismissRamadan} />}

        <HeroCarousel onBookSession={handleBookLesson} />

        {/* UPCOMING PROVIDER SESSION - Smart card for booked provider services.
            Sits just below the hero carousel, so it's often visible on first
            paint on tall phones — keep eager-mounted but its query is light. */}
        {!isGuest ? (
          <LazyOnScroll prefetchOffset={400} minHeight={1}>
            <UpcomingProviderSessionCard />
          </LazyOnScroll>
        ) : null}

        {/* WELCOME / GUIDE — first-run dismissible card pointing to the unified Player Guide */}
        <WelcomeGuideCard />

        {/* ── PLAY SECTION ── Book, find players, join matches */}
        <View style={styles.playDivider}>
          <View style={styles.playDividerLeft}>
            <View style={styles.playIconGlow}>
              <Ionicons name="tennisball" size={14} color={Colors.dark.accentText} />
            </View>
            <Text style={styles.playDividerText}>PLAY</Text>
          </View>
          <View style={styles.playDividerLine} />
        </View>

        {/* COACHES RAIL — Public coaches the player can browse and book */}
        {!isGuest ? (
          <LazyOnScroll prefetchOffset={400} minHeight={180}>
            <CoachesRail />
          </LazyOnScroll>
        ) : null}

        {/* PLAYERS NEAR YOU — academy players only; free players land here from
            the Coaches rail and surface players via the Social tab instead. */}
        {!isFreePlayer && !isGuest ? (
          <LazyOnScroll minHeight={160}>
            <PlayersNearYouRow />
          </LazyOnScroll>
        ) : null}

        {!isGuest ? (
          <LazyOnScroll minHeight={120}>
            <CountryLeaderboardsEntry />
          </LazyOnScroll>
        ) : null}

        {/* ── IMPROVE SECTION ── AI Coach + Player of the Week + Quests */}
        {!isGuest ? (
          <LazyOnScroll minHeight={240}>
            <View style={styles.sectionDivider}>
              <Ionicons name="trending-up" size={12} color={Colors.dark.accentText} />
              <Text style={[styles.sectionDividerText, { color: Colors.dark.accentText }]}>IMPROVE</Text>
            </View>

            <AICoachHomeCard
              aiStatus={homeData?.aiProStatus ?? null}
              aiCoachContext={homeData?.aiCoachContext ?? null}
              weeklyDigest={homeData?.weeklyDigest ?? null}
              drillRecommendation={(homeData as any)?.drillRecommendation ?? null}
              onNavigateToDrills={() => navigateToTab("Growth", { screen: "Drills" })}
            />

            <View style={styles.improveCardGap} />

            <PlayerOfTheWeekCard
              currentWeek={homeData?.spotlightCurrentWeek ?? null}
              weeklyWinner={homeData?.spotlightWeeklyWinner ?? { winner: null }}
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

            {/* RecentFeedback & UpcomingAppointment are academy-only — hide for free players */}
            {!isFreePlayer && (!!effectiveData?.lastFeedback || !!effectiveData?.player?.ballLevel) ? (
              <>
                <RecentFeedbackCard />
                <UpcomingAppointmentCard />
              </>
            ) : null}
          </LazyOnScroll>
        ) : null}

        {/* ── SQUAD vs SQUAD — only meaningful for academy players */}
        {!isGuest && !isFreePlayer ? (
          <LazyOnScroll minHeight={180}>
            <SquadVsSquadWidget />
          </LazyOnScroll>
        ) : null}

        {/* ── COMMUNITY ── MiniFeed self-gates: returns null when there are no
            real social posts, so an empty feed shows nothing (parity with the
            old `socialPosts.length > 0` parent check). */}
        {!isGuest ? (
          <LazyOnScroll>
            <MiniFeed />
          </LazyOnScroll>
        ) : null}

        {/* ── SHOP ── GlowMarketSpotlight returns null when there are no
            featured products, preserving the old "only when products" gate. */}
        {!isGuest ? (
          <LazyOnScroll>
            <GlowMarketSpotlight />
          </LazyOnScroll>
        ) : null}

        {/* ── JOIN ACADEMY (free players only) — soft CTA at the very bottom, after universal modules */}
        {isFreePlayer && !isGuest ? <JoinAcademySoftCard /> : null}
      </ScrollView>
      </ScrollPositionContext.Provider>

      <BetaFeedbackButton
        playerId={player?.id}
        playerName={player?.name}
        bottomOffset={145}
      />
      
      {/* MODE SWITCHER — dev-only, never visible to players in production */}
      {__DEV__ ? <CollapsibleModeSwitcher /> : null}
      
      {/* SPORT PICKER before booking wizard */}
      <Modal
        visible={showBookingSportPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBookingSportPicker(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: Colors.dark.modalScrim }}
          onPress={() => setShowBookingSportPicker(false)}
        >
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: Backgrounds.elevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, paddingBottom: Spacing.xl }}>
            <Text style={{ color: Colors.dark.text, fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: Spacing.md }}>
              Book Lesson In
            </Text>
            {SPORT_DEFINITIONS.filter(s => activeSports.includes(s.key)).map(sportDef => {
              const isSelected = bookingWizardSport === sportDef.key;
              return (
                <Pressable
                  key={sportDef.key}
                  style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: 12, borderWidth: 1.5, borderColor: isSelected ? getSportColor(sportDef.key) : Colors.dark.chipBackgroundStrong, marginBottom: Spacing.sm, backgroundColor: isSelected ? getSportColor(sportDef.key) + "15" : "transparent" }}
                  onPress={() => {
                    setBookingWizardSport(sportDef.key);
                    setShowBookingSportPicker(false);
                    setTimeout(() => setShowBookingWizard(true), 350);
                  }}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: getSportColor(sportDef.key) }} />
                  <Text style={{ color: isSelected ? getSportColor(sportDef.key) : Colors.dark.text, fontSize: 16, fontWeight: "600", flex: 1 }}>
                    {getSportLabel(sportDef.key)}
                  </Text>
                  {isSelected ? (
                    <Ionicons name="checkmark" size={18} color={getSportColor(sportDef.key)} />
                  ) : null}
                </Pressable>
              );
            })}
            <Pressable
              style={{ marginTop: Spacing.xs, padding: Spacing.sm, alignItems: "center" }}
              onPress={() => setShowBookingSportPicker(false)}
            >
              <Text style={{ color: Colors.dark.textMuted, fontSize: 15 }}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* BOOKING WIZARD MODAL */}
      <PlayerBookingWizard
        visible={showBookingWizard}
        onClose={() => setShowBookingWizard(false)}
        onBookingSuccess={handleBookingSuccess}
        onBuyPackage={() => {
          setShowBookingWizard(false);
          setShowPinModal(true);
        }}
        playerId={player?.id}
        playerBallLevel={player?.ballLevel}
        sport={bookingWizardSport}
      />
      
      {/* PIN ENTRY MODAL for Credit Store */}
      <PinEntryModal
        visible={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSuccess={() => {
          setShowPinModal(false);
          navigation.navigate("ParentCreditStore", { playerId: player?.id });
        }}
      />

      <SpotlightNominationModal
        visible={showSpotlightNomination}
        onClose={() => setShowSpotlightNomination(false)}
      />
      <GuestPromptModal {...promptProps} />

    </View>
  );
}


function PlayerDNABanner({ playerId }: { playerId: string }) {
  const navigation = useNavigation<NavigationProp<PlayerStackParamList>>();

  const { data: profileData } = useQuery<{ player: Record<string, unknown> | null }>({
    queryKey: ["/api/player/me/profile"],
    enabled: !!playerId,
    staleTime: 60000,
  });

  const p = profileData?.player as Record<string, unknown> | null | undefined;
  if (!p) return null;

  // 11 DNA fields that define a complete player profile
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

  // Banner auto-hides when 100% complete — no manual dismiss
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

const dnaBannerStyles = makeReactiveStyles(() => StyleSheet.create({
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.accentTextSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  sub: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: GlowColors.primary,
    borderRadius: 2,
  },
  cta: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.accentText,
  },
}));

export default function ProPlayerHomeScreen() {
  return (
    <PlayerStateProvider>
      <PlayerHomeContent />
    </PlayerStateProvider>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  homeSkeletonHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  homeSkeletonHeaderText: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.md,
  },
  homeSkeletonActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
  },
  homeSkeletonSection: {
    paddingHorizontal: Spacing.lg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: Spacing.xl,
  },
  headerSection: {
    position: "relative",
  },
  onAirBadge: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    zIndex: 10,
  },
  playDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Spacing.lg,
    marginTop: 8,
    marginBottom: 4,
  },
  playDividerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playIconGlow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.dark.accentTextSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  playDividerText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 3,
    color: Colors.dark.accentText,
    textTransform: "uppercase" as const,
  },
  playDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.accentTextSoft,
  },
  sectionDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.lg,
    marginTop: 4,
    marginBottom: 2,
  },
  sectionDividerText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  improveCardGap: {
    height: Spacing.sm,
  },
  freePlayerCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.accentTextSoft,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.2)",
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  freePlayerCtaIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.accentTextSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  freePlayerCtaContent: {
    flex: 1,
  },
  freePlayerCtaTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  freePlayerCtaSubtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
}));

