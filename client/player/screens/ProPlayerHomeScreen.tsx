import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Spacing, GlowColors, Backgrounds, BorderRadius, Colors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { useWalkthrough } from "@/player/context/WalkthroughContext";
import { PlayerStateProvider } from "@/player/context/PlayerStateContext";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { ProPlayerCard } from "@/player/components/ProPlayerCard";
import { PlayersNearYouRow, OpenSessionsRow, TrainingSessionsRow } from "@/player/components/DiscoveryRows";
import { MiniFeed } from "@/player/components/MiniFeed";
import { SessionHeroCard } from "@/player/components/SessionHeroCard";
import { NewsTicker } from "@/player/components/NewsTicker";
import { QuickServeFAB } from "@/player/components/QuickServeFAB";
import PlayerBookingWizard from "@/player/components/PlayerBookingWizard";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import PinEntryModal from "@/components/PinEntryModal";
import Svg, { Line, Rect } from "react-native-svg";
import { BirthdayConfettiOverlay } from "@/player/components/BirthdayThemeOverlay";
import { BirthdayBanner, BirthdayXPBonusCard } from "@/player/components/BirthdayThemeOverlay";
import { RamadanConfettiOverlay, RamadanBanner, RamadanBonusCard } from "@/player/components/RamadanCelebrationOverlay";
import { RecentFeedbackCard } from "@/player/components/RecentFeedbackCard";
import { FeedbackToast } from "@/player/components/FeedbackToast";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { SpotlightCard } from "@/player/components/SpotlightCard";
import SpotlightNominationModal from "@/player/components/SpotlightNominationModal";
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { WelcomeIntroModal } from "@/components/WelcomeIntroModal";
import { HelpButton } from "@/components/HelpButton";
import { QuickTipsBanner } from "@/components/QuickTipsBanner";
import { PlatformUsageProgress } from "@/components/PlatformUsageProgress";
import { NotificationGuideModal } from "@/components/NotificationGuideModal";
import { FirstActionCelebration } from "@/components/FirstActionCelebration";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
}

function BroadcastBackground() {
  return (
    <View style={styles.backgroundContainer}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Rect x="0" y="0" width="100%" height="100%" fill={"rgba(255, 255, 255, 0.06)"} />
        <Line x1="0" y1="25%" x2="100%" y2="25%" stroke={GlowColors.primary} strokeWidth="0.5" opacity="0.015" />
        <Line x1="0" y1="50%" x2="100%" y2="50%" stroke={GlowColors.primary} strokeWidth="0.5" opacity="0.015" />
        <Line x1="0" y1="75%" x2="100%" y2="75%" stroke={GlowColors.primary} strokeWidth="0.5" opacity="0.015" />
      </Svg>
    </View>
  );
}

function PlayerHomeContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { openDrawer } = usePlayerDrawer();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  const [showBookingWizard, setShowBookingWizard] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [ramadanDismissed, setRamadanDismissed] = useState(false);
  const { hasSeenScreen, startWalkthrough } = useWalkthrough();
  const [showWelcome, setShowWelcome] = useState(false);

  const { data: dashboardData, isLoading, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!user?.playerId,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/player/me/notifications/unread-count"],
    enabled: !!user?.playerId,
    refetchInterval: 120000,
  });
  const unreadCount = unreadData?.count || 0;

  useEffect(() => {
    if (dashboardData && !hasSeenScreen("Home")) {
      const timer = setTimeout(() => {
        startWalkthrough("Home");
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [dashboardData, hasSeenScreen, startWalkthrough]);


  useFocusEffect(
    useCallback(() => {
      if (user?.playerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      }
    }, [user?.playerId, queryClient])
  );

  const isBirthday = useMemo(() => {
    const dateOfBirth = dashboardData?.player?.dateOfBirth;
    if (!dateOfBirth) return false;
    const today = new Date();
    const dob = new Date(dateOfBirth);
    return today.getMonth() === dob.getMonth() && today.getDate() === dob.getDate();
  }, [dashboardData?.player?.dateOfBirth]);

  const playerAge = useMemo(() => {
    const dateOfBirth = dashboardData?.player?.dateOfBirth;
    if (!dateOfBirth) return undefined;
    const today = new Date();
    const dob = new Date(dateOfBirth);
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }, [dashboardData?.player?.dateOfBirth]);

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

  const isFreePlayer = dashboardData?.isFreePlayer ?? !dashboardData?.academy;

  const playerChecklistSteps = useMemo(() => {
    const hasAcademy = !!dashboardData?.academy;
    const hasCoach = !!dashboardData?.coach;
    const hasNextSession = !!dashboardData?.nextSession;
    const hasProfile = !!dashboardData?.player?.profilePhotoUrl;
    
    const steps = [
      {
        id: "complete_profile",
        icon: "person-circle" as const,
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
        icon: "tennisball" as const,
        title: "Book a Court",
        description: "Find and book a court near you",
        actionLabel: "Browse Courts",
        onAction: () => navigation.navigate("CourtBooking" as never),
        isCompleted: false,
      });
      steps.push({
        id: "join_academy",
        icon: "business" as const,
        title: t("player.home.joinAcademy"),
        description: "Optional - join an academy for coaching and training sessions",
        actionLabel: t("player.home.browseAcademies"),
        onAction: () => navigation.navigate("AcademyBrowser" as never),
        isCompleted: hasAcademy,
      });
    } else {
      steps.push({
        id: "join_academy",
        icon: "business" as const,
        title: t("player.home.joinAcademy"),
        description: t("player.home.joinAcademyDesc"),
        actionLabel: t("player.home.browseAcademies"),
        onAction: () => navigation.navigate("AcademyBrowser" as never),
        isCompleted: hasAcademy,
      });
      steps.push({
        id: "book_session",
        icon: "calendar" as const,
        title: t("player.home.bookFirstSession"),
        description: t("player.home.bookFirstSessionDesc"),
        actionLabel: t("player.home.bookSession"),
        onAction: () => setShowBookingWizard(true),
        isCompleted: hasNextSession,
      });
    }

    steps.push({
      id: "check_progress",
      icon: "trending-up" as const,
      title: t("player.home.checkProgress"),
      description: t("player.home.checkProgressDesc"),
      actionLabel: t("player.home.viewProgress"),
      onAction: () => navigateToTab("Progress"),
      isCompleted: false,
    });

    return steps;
  }, [dashboardData, navigation, setShowBookingWizard, isFreePlayer]);

  const [showSpotlightNomination, setShowSpotlightNomination] = useState(false);
  const [showNotificationGuide, setShowNotificationGuide] = useState(false);
  const [showFirstCelebration, setShowFirstCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ title: "", description: "", icon: "trophy", xpReward: 0 });

  const playerFeatureUsage = useMemo(() => [
    { id: "profile", name: t("player.home.profileSetup"), icon: "person", isUsed: true },
    { id: "sessions", name: t("player.home.sessionBooking"), icon: "calendar", isUsed: false },
    { id: "feedback", name: t("player.home.feedbackCenter"), icon: "chatbubble-ellipses", isUsed: false },
    { id: "community", name: t("player.community.title"), icon: "people", isUsed: false },
    { id: "progress", name: t("player.home.progressTracking"), icon: "trending-up", isUsed: true },
    { id: "shop", name: t("player.home.glowMarket"), icon: "cart", isUsed: false },
  ], [t]);

  const playerTips = [
    { id: "tip_xp", icon: "star", text: t("player.home.tipXp") },
    { id: "tip_profile", icon: "person", text: t("player.home.tipProfile") },
    { id: "tip_community", icon: "people", text: t("player.home.tipCommunity") },
    { id: "tip_feedback", icon: "chatbubble", text: t("player.home.tipFeedback") },
    { id: "tip_credits", icon: "card", text: t("player.home.tipCredits") },
  ];

  const playerFAQs = [
    { question: t("player.home.faqBookSession"), answer: t("player.home.faqBookSessionAnswer"), category: "Booking" },
    { question: t("player.home.faqGlowScore"), answer: t("player.home.faqGlowScoreAnswer"), category: "Progress" },
    { question: t("player.home.faqEarnXp"), answer: t("player.home.faqEarnXpAnswer"), category: "Progress" },
    { question: t("player.home.faqCredits"), answer: t("player.home.faqCreditsAnswer"), category: "Billing" },
    { question: t("player.home.faqFindPlayers"), answer: t("player.home.faqFindPlayersAnswer"), category: "Social" },
    { question: t("player.home.faqBallLevel"), answer: t("player.home.faqBallLevelAnswer"), category: "Progress" },
  ];

  const playerWelcomeSlides = [
    {
      icon: "tennisball",
      iconColor: "#2ECC40",
      title: t("player.home.welcomeTitle"),
      description: t("player.home.welcomeDesc"),
    },
    {
      icon: "trending-up",
      iconColor: "#00BCD4",
      title: t("player.home.trackProgressTitle"),
      description: t("player.home.trackProgressDesc"),
    },
    {
      icon: "people",
      iconColor: "#FF9800",
      title: t("player.home.connectCompeteTitle"),
      description: t("player.home.connectCompeteDesc"),
    },
    {
      icon: "rocket",
      iconColor: "#9B59B6",
      title: t("player.home.readyToPlayTitle"),
      description: t("player.home.readyToPlayDesc"),
    },
  ];

  if (isLoading || !dashboardData) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <BroadcastBackground />
        <ActivityIndicator size="large" color={GlowColors.primary} />
      </View>
    );
  }

  const { player, credits } = dashboardData;
  
  const handleAvatarPress = () => {
    openDrawer();
  };

  const handleWalletPress = () => {
    setShowPinModal(true);
  };

  const handleSquadPress = () => {
    navigation.navigate("FamilyLobby");
  };

  const handleBookLesson = () => {
    setShowBookingWizard(true);
  };

  const handleBookingSuccess = () => {
    setShowBookingWizard(false);
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
    queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
  };

  return (
    <View style={styles.container}>
      <BroadcastBackground />

      {isBirthday && <BirthdayConfettiOverlay />}
      {isRamadan && !isBirthday && !ramadanDismissed && <RamadanConfettiOverlay />}
      
      <FeedbackToast />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top, paddingBottom: insets.bottom + 180 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={GlowColors.primary}
            colors={[GlowColors.primary]}
          />
        }
      >
        {/* BIRTHDAY BANNER - Festive celebration on birthday */}
        {isBirthday && (
          <BirthdayBanner 
            playerName={player.name || "Champion"} 
            playerAge={playerAge}
          />
        )}

        {/* RAMADAN BANNER - Festive celebration during Ramadan */}
        {isRamadan && !isBirthday && !ramadanDismissed && (
          <RamadanBanner playerName={player.name || "Champion"} onDismiss={handleDismissRamadan} />
        )}

        {/* GETTING STARTED CHECKLIST */}
        <GettingStartedChecklist
          role="player"
          steps={playerChecklistSteps}
        />

        <QuickTipsBanner role="player" tips={playerTips} />

        <PlatformUsageProgress
          role="player"
          features={playerFeatureUsage}
        />

        {/* PLAYER HEADER - Identity card */}
        <View style={styles.headerSection}>
            <ProPlayerCard
              player={player}
              credits={credits}
              onAvatarPress={handleAvatarPress}
              onWalletPress={handleWalletPress}
              onSquadPress={handleSquadPress}
              showSquadSwitch={true}
              onNotificationPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("PlayerNotifications");
              }}
              unreadNotificationCount={unreadCount}
              accessibilityLabel={`Player card for ${player.name}, ${t("player.home.glowLevel")} ${player.level}, ${player.xp} ${t("player.home.xpPoints")}`}
            />
          </View>

        {/* BIRTHDAY XP BONUS - 2x XP message on birthday */}
        {isBirthday && <BirthdayXPBonusCard />}

        {/* RAMADAN BONUS CARD - Blessings card during Ramadan */}
        {isRamadan && !isBirthday && !ramadanDismissed && <RamadanBonusCard onDismiss={handleDismissRamadan} />}

        {/* TENNIS NEWS - Below header, above Today is Open */}
        <NewsTicker />

        {/* FREE PLAYER CTA - Court booking for players without academy */}
        {isFreePlayer && (
          <Pressable
            style={styles.freePlayerCta}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              navigation.navigate("CourtBooking" as never);
            }}
          >
            <View style={styles.freePlayerCtaIcon}>
              <Ionicons name="tennisball" size={28} color={GlowColors.primary} />
            </View>
            <View style={styles.freePlayerCtaContent}>
              <Text style={styles.freePlayerCtaTitle}>Find & Book Courts</Text>
              <Text style={styles.freePlayerCtaSubtitle}>Browse available courts near you</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>
        )}

        {/* HERO CTA - Next Session (PRIMARY ACTION) */}
        <SessionHeroCard onBookSession={handleBookLesson} />


        {/* RECENT COACH FEEDBACK */}
        <RecentFeedbackCard />

        {/* PLAYER SPOTLIGHT - Player of the Week / Month */}
        <SpotlightCard
          onNominate={() => setShowSpotlightNomination(true)}
          onViewDetails={() => navigation.navigate("SpotlightDetail" as never)}
          accessibilityLabel="Player spotlight card"
        />

        {/* DISCOVERY SECTION - Horizontal scrolling rows */}
        <View style={styles.discoverySection}>
            <Text style={styles.discoverySectionTitle}>{t("player.home.quickActions")}</Text>
            
            {/* Players Near You - Horizontal avatar carousel (filtered by ball level) */}
            <PlayersNearYouRow />
            
            {/* Open Sessions - Join now cards */}
            <OpenSessionsRow />
            
            {/* Trainings - Quick access to lessons */}
            <TrainingSessionsRow />
          </View>

        {/* COMMUNITY - Activity feed */}
        <MiniFeed />
      </ScrollView>
      
      <QuickServeFAB bottomOffset={48} />
      
      {/* MODE SWITCHER - Dashboard switching button (top left) */}
      <CollapsibleModeSwitcher />
      
      {/* BOOKING WIZARD MODAL */}
      <PlayerBookingWizard
        visible={showBookingWizard}
        onClose={() => setShowBookingWizard(false)}
        onBookingSuccess={handleBookingSuccess}
        playerId={player?.id}
        playerBallLevel={player?.ballLevel}
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

      <WelcomeIntroModal
        role="player"
        slides={playerWelcomeSlides}
        onComplete={() => {}}
      />
      <HelpButton
          role="player"
          faqs={playerFAQs}
          supportEmail="support@glowupsports.com"
          bottomOffset={120}
        />
      <NotificationGuideModal
        visible={showNotificationGuide}
        onClose={() => setShowNotificationGuide(false)}
        role="player"
      />
      <FirstActionCelebration
        visible={showFirstCelebration}
        onClose={() => setShowFirstCelebration(false)}
        title={celebrationData.title}
        description={celebrationData.description}
        icon={celebrationData.icon}
        xpReward={celebrationData.xpReward}
      />
      <SpotlightNominationModal
        visible={showSpotlightNomination}
        onClose={() => setShowSpotlightNomination(false)}
      />
    </View>
  );
}

export default function ProPlayerHomeScreen() {
  return (
    <PlayerStateProvider>
      <PlayerHomeContent />
    </PlayerStateProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  backgroundContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: Spacing.lg,
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
  discoverySection: {
    gap: Spacing.xl,
  },
  discoverySectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 2.5,
    paddingHorizontal: Spacing.lg,
    marginBottom: -Spacing.sm,
    textTransform: "uppercase",
  },
  freePlayerCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 212, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  freePlayerCtaIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
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
});
