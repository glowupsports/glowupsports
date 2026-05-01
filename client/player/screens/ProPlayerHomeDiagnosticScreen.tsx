import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  DimensionValue,
  Platform,
} from "react-native";
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
import { useSport } from "@/player/context/SportContext";
import { GuestPromptModal, useGuestGuard } from "@/components/GuestPromptModal";
import PinEntryModal from "@/components/PinEntryModal";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { Spacing, GlowColors, BorderRadius, Colors } from "@/constants/theme";
import { ProPlayerCard } from "@/player/components/ProPlayerCard";
import { PrimaryActionsRow } from "@/player/components/PrimaryActionsRow";
import { HeroCarousel } from "@/player/components/HeroCarousel";
import PlayerBookingWizard from "@/player/components/PlayerBookingWizard";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

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

// ─── PlayerDNABanner (exact copy from ProPlayerHomeScreen ~line 2099) ──────
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

  const [showPinModal, setShowPinModal] = useState(false);
  const [showBookingWizard, setShowBookingWizard] = useState(false);
  const [bookingWizardSport, setBookingWizardSport] = useState<string | undefined>(undefined);

  // ── God-route query (exact from ProPlayerHomeScreen) ─────────────────────
  const { data: homeData, refetch, isRefetching } = useQuery<{
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

  // ── Derived views (exact from ProPlayerHomeScreen) ────────────────────────
  const dashboardData = homeData?.dashboard ?? undefined;
  const unreadCount = homeData?.unreadCount?.count ?? 0;

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
    queryClient.setQueryData(
      ["/api/player/me/weekly-digest"],
      homeData.weeklyDigest ?? null,
    );
    queryClient.setQueryData(
      ["/api/player/me/ai-coach/context"],
      homeData.aiCoachContext ?? null,
    );
    queryClient.setQueryData(
      ["/api/player/spotlight/current-week"],
      homeData.spotlightCurrentWeek ?? null,
    );
    queryClient.setQueryData(
      ["/api/player/spotlight/weekly-winner"],
      homeData.spotlightWeeklyWinner ?? { winner: null },
    );
    if (homeData.profile) {
      queryClient.setQueryData(["/api/player/me/profile"], homeData.profile);
    }
    queryClient.setQueryData(
      ["/api/player/me/tennis-iq"],
      homeData.tennisIq ?? null,
    );
    queryClient.setQueryData(
      ["/api/ai-pro/status"],
      homeData.aiProStatus ?? { isPro: false, isCoach: false, callCount: 0, limit: 5 },
    );
    // Mirror player numbers back into AuthContext (exact from ProPlayerHomeScreen #1467)
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
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [homeData, queryClient, user?.id]);

  // ── useFocusEffect invalidation (exact from ProPlayerHomeScreen) ──────────
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
    }, [queryClient])
  );

  // ── Auth-ready ref (exact from ProPlayerHomeScreen #1495) ─────────────────
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
    const t1 = setTimeout(() => {
      queryClient.refetchQueries({ queryKey: ["/api/player/me/home-data"], type: "active" });
    }, 800);
    const t2 = setTimeout(() => {
      queryClient.refetchQueries({ queryKey: ["/api/player/me/home-data"], type: "active" });
    }, 1800);
    const t3 = setTimeout(() => {
      queryClient.refetchQueries({ queryKey: ["/api/player/me/home-data"], type: "active" });
    }, 3000);
    const t4 = setTimeout(() => {
      queryClient.refetchQueries({ queryKey: ["/api/player/me/home-data"], type: "active" });
    }, 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [queryClient]);

  // ── effectiveData + player derivation (exact from ProPlayerHomeScreen) ────
  const effectiveData = dashboardData;
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

  // ── Handlers (exact from ProPlayerHomeScreen) ─────────────────────────────
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
      } else {
        setBookingWizardSport(activeSport);
      }
      setShowBookingWizard(true);
    });
  };

  const handleBookingSuccess = () => {
    setShowBookingWizard(false);
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top, paddingBottom: insets.bottom + 180 },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={64}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.dark.accentText}
            colors={[GlowColors.primary]}
          />
        }
      >
        {/* HEADER — exact ProPlayerCard van ProPlayerHomeScreen */}
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

        {/* DNA BANNER — exact van ProPlayerHomeScreen */}
        {!isGuest && player?.id ? <PlayerDNABanner playerId={player.id} /> : null}

        {/* PRIMARY ACTIONS — exact van ProPlayerHomeScreen */}
        <PrimaryActionsRow
          firstName={player.name}
          nextSessionDate={effectiveData?.nextSession?.date ?? null}
          nextSessionEndTime={effectiveData?.nextSession?.endTime ?? null}
        />

        {/* HERO CAROUSEL — exact van ProPlayerHomeScreen (Train / Glow Lessons / Open Matches / Tournaments / Friend Spotlight) */}
        <HeroCarousel onBookSession={handleBookLesson} />
      </ScrollView>

      {/* MODE SWITCHER — zijknop (exact van ProPlayerHomeScreen) */}
      <CollapsibleModeSwitcher />

      {/* BOOKING WIZARD — exact van ProPlayerHomeScreen */}
      <PlayerBookingWizard
        visible={showBookingWizard}
        onClose={() => setShowBookingWizard(false)}
        onSuccess={handleBookingSuccess}
        sport={bookingWizardSport}
      />

      {/* PIN MODAL — exact van ProPlayerHomeScreen */}
      <PinEntryModal
        visible={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSuccess={() => {
          setShowPinModal(false);
          navigation.navigate("ParentCreditStore", { playerId: player?.id });
        }}
      />

      {/* GUEST PROMPT — exact van ProPlayerHomeScreen */}
      <GuestPromptModal {...promptProps} />
    </View>
  );
}

// ─── Main DiagnosticScreen — wraps content in PlayerStateProvider ──────────
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: 0,
  },
  headerSection: {
    paddingHorizontal: 0,
  },
});
