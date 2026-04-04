import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { useTranslation } from "react-i18next";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable, DimensionValue, Modal, LayoutAnimation } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Spacing, GlowColors, Backgrounds, BorderRadius, Colors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { useSport, SPORT_DEFINITIONS, getSportColor, getSportLabel, type Sport } from "@/player/context/SportContext";
import { usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { useWalkthrough } from "@/player/context/WalkthroughContext";
import { GuestPromptModal, useGuestGuard } from "@/components/GuestPromptModal";
import { PlayerStateProvider } from "@/player/context/PlayerStateContext";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { ProPlayerCard } from "@/player/components/ProPlayerCard";
import { PlayersNearYouRow, OpenSessionsRow, TrainingSessionsRow, TournamentsDiscoveryRow } from "@/player/components/DiscoveryRows";
import { GlowMarketSpotlight } from "@/player/components/GlowMarketSpotlight";
import { MiniFeed } from "@/player/components/MiniFeed";
import { SessionHeroCard } from "@/player/components/SessionHeroCard";
import { NewsTicker } from "@/player/components/NewsTicker";
import { BetaFeedbackButton } from "@/player/components/BetaFeedbackButton";
import PlayerBookingWizard from "@/player/components/PlayerBookingWizard";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import PinEntryModal from "@/components/PinEntryModal";
import { BirthdayConfettiOverlay } from "@/player/components/BirthdayThemeOverlay";
import { BirthdayBanner, BirthdayXPBonusCard } from "@/player/components/BirthdayThemeOverlay";
import { RamadanConfettiOverlay, RamadanBanner, RamadanBonusCard } from "@/player/components/RamadanCelebrationOverlay";
import { RecentFeedbackCard } from "@/player/components/RecentFeedbackCard";
import { FeedbackToast } from "@/player/components/FeedbackToast";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { SpotlightCard, FriendSpotlightCard } from "@/player/components/SpotlightCard";
import SpotlightNominationModal from "@/player/components/SpotlightNominationModal";
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { WelcomeIntroModal } from "@/components/WelcomeIntroModal";
import { QuickTipsBanner } from "@/components/QuickTipsBanner";
import { PlatformUsageProgress } from "@/components/PlatformUsageProgress";
import { NotificationGuideModal } from "@/components/NotificationGuideModal";
import { FirstActionCelebration } from "@/components/FirstActionCelebration";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuests, Quest } from "@/player/hooks/useQuests";
import { DailyBriefingModal } from "@/player/components/DailyBriefingModal";
import { UpcomingProviderSessionCard } from "@/player/components/UpcomingProviderSessionCard";
import { UpcomingAppointmentCard } from "@/player/components/UpcomingAppointmentCard";

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
}

function toIoniconName(name: string | null | undefined, fallback: keyof typeof Ionicons.glyphMap = "star"): keyof typeof Ionicons.glyphMap {
  if (!name) return fallback;
  return name as keyof typeof Ionicons.glyphMap;
}

const WEEKLY_DIGEST_DISMISSED_KEY = "@glow_weekly_digest_dismissed_id";

interface WeeklyDigestNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  data: {
    focusArea?: string;
    reason?: string;
    drillTip?: string;
    motivation?: string;
  } | null;
  createdAt: string;
}

function WeeklyAIFocusCard({ playerId }: { playerId: string }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [dismissedLoaded, setDismissedLoaded] = useState(false);

  const { data: digest } = useQuery<WeeklyDigestNotification | null>({
    queryKey: ["/api/player/me/weekly-digest"],
    enabled: !!playerId,
  });

  useEffect(() => {
    AsyncStorage.getItem(WEEKLY_DIGEST_DISMISSED_KEY).then((val) => {
      setDismissed(val);
      setDismissedLoaded(true);
    });
  }, []);

  if (!dismissedLoaded || !digest || !digest.data?.focusArea) return null;
  if (dismissed === digest.id) return null;

  const handleDismiss = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDismissed(digest.id);
    AsyncStorage.setItem(WEEKLY_DIGEST_DISMISSED_KEY, digest.id);
  };

  const { focusArea, reason, drillTip, motivation } = digest.data;

  return (
    <View style={wStyles.card}>
      <View style={wStyles.header}>
        <View style={wStyles.headerLeft}>
          <View style={wStyles.iconWrap}>
            <Ionicons name="sparkles" size={16} color="#8B5CF6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={wStyles.badge}>THIS WEEK'S AI FOCUS</Text>
            <Text style={wStyles.focusArea} numberOfLines={2}>{focusArea}</Text>
          </View>
        </View>
        <Pressable onPress={handleDismiss} hitSlop={10} style={wStyles.dismissBtn}>
          <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
        </Pressable>
      </View>

      {reason ? (
        <Text style={wStyles.reason}>{reason}</Text>
      ) : null}

      {drillTip ? (
        <View style={wStyles.drillRow}>
          <Ionicons name="fitness" size={13} color="#8B5CF6" />
          <Text style={wStyles.drillTip} numberOfLines={3}>{drillTip}</Text>
        </View>
      ) : null}

      {motivation ? (
        <View style={wStyles.motivationRow}>
          <Ionicons name="flame" size={13} color="#F59E0B" />
          <Text style={wStyles.motivation} numberOfLines={2}>{motivation}</Text>
        </View>
      ) : null}
    </View>
  );
}

const wStyles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(139, 92, 246, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.25)",
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  badge: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#8B5CF6",
    marginBottom: 2,
  },
  focusArea: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dismissBtn: {
    padding: 4,
  },
  reason: {
    fontSize: 13,
    color: Colors.dark.textSubtle,
    lineHeight: 18,
  },
  drillRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "rgba(139, 92, 246, 0.06)",
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  drillTip: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.text,
    lineHeight: 17,
  },
  motivationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  motivation: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
    lineHeight: 17,
  },
});

function ActiveQuestCard({ quest, questType, onViewAll }: { quest: Quest | null; questType: "daily" | "weekly" | null; onViewAll: () => void }) {
  if (!quest) {
    return (
      <Pressable style={hStyles.questCardEmpty} onPress={onViewAll}>
        <Ionicons name="trophy-outline" size={20} color={Colors.dark.textSubtle} />
        <Text style={hStyles.questEmptyText}>No active quest — check your missions</Text>
        <View style={hStyles.questViewAllBtn}>
          <Text style={hStyles.questViewAllText}>View All</Text>
          <Ionicons name="chevron-forward" size={12} color={GlowColors.primary} />
        </View>
      </Pressable>
    );
  }

  const progress = quest.targetProgress > 0 ? Math.min(quest.currentProgress / quest.targetProgress, 1) : 0;
  const typeLabel = questType === "weekly" ? "WEEKLY" : "DAILY";
  const typeColor = typeLabel === "WEEKLY" ? "#9B59B6" : "#00D4FF";

  return (
    <Pressable style={hStyles.questCard} onPress={onViewAll}>
      <View style={hStyles.questCardHeader}>
        <View style={[hStyles.questIconBg, { backgroundColor: (quest.iconColor || GlowColors.primary) + "18" }]}>
          <Ionicons name={toIoniconName(quest.iconName, "star")} size={16} color={quest.iconColor || GlowColors.primary} />
        </View>
        <View style={hStyles.questInfoBlock}>
          <View style={hStyles.questTopRow}>
            <Text style={hStyles.questName} numberOfLines={1}>{quest.name}</Text>
            <View style={[hStyles.questTypePill, { backgroundColor: typeColor + "18" }]}>
              <Text style={[hStyles.questTypeText, { color: typeColor }]}>{typeLabel}</Text>
            </View>
          </View>
          <View style={hStyles.questXpRow}>
            <Ionicons name="flash" size={12} color="#FFD700" />
            <Text style={hStyles.questXpText}>+{quest.xpReward} XP</Text>
          </View>
        </View>
        <Pressable style={hStyles.viewAllLink} onPress={onViewAll} hitSlop={8}>
          <Text style={hStyles.viewAllText}>View All</Text>
          <Ionicons name="chevron-forward" size={11} color={GlowColors.primary} />
        </Pressable>
      </View>
      <View style={hStyles.questProgressWrap}>
        <View style={hStyles.questProgressBar}>
          <View style={[hStyles.questProgressFill, {
            width: `${Math.max(progress * 100, 2)}%` as DimensionValue,
            backgroundColor: quest.iconColor || GlowColors.primary,
          }]} />
        </View>
        <Text style={hStyles.questProgressText}>{quest.currentProgress}/{quest.targetProgress}</Text>
      </View>
    </Pressable>
  );
}

function PlayerHomeContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const track = useTrackFeature();
  const { user, isGuest } = useAuth();
  const { openDrawer } = usePlayerDrawer();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  const { guardAction, promptProps } = useGuestGuard();
  const { isMultiSport, activeSports, activeSport } = useSport();
  const [showBookingWizard, setShowBookingWizard] = useState(false);
  const [bookingWizardSport, setBookingWizardSport] = useState<string | undefined>(undefined);
  const [showBookingSportPicker, setShowBookingSportPicker] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [ramadanDismissed, setRamadanDismissed] = useState(false);
  const { hasSeenScreen, startWalkthrough } = useWalkthrough();
  const [showWelcome, setShowWelcome] = useState(false);

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

  const { data: dashboardData, isLoading, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!user?.playerId && !isGuest,
  });

  const { data: questsData } = useQuests(!isGuest);

  const effectiveData = isGuest ? guestDashboard : dashboardData;

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/player/me/notifications/unread-count"],
    enabled: !!user?.playerId && !isGuest,
    refetchInterval: 120000,
  });
  const unreadCount = unreadData?.count || 0;

  useEffect(() => {
    if (effectiveData && !hasSeenScreen("Home")) {
      const timer = setTimeout(() => {
        startWalkthrough("Home");
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [effectiveData, hasSeenScreen, startWalkthrough]);


  useFocusEffect(
    useCallback(() => {
      if (user?.playerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      }
    }, [user?.playerId, queryClient])
  );

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
  }, [effectiveData, navigation, setShowBookingWizard, isFreePlayer]);

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

  const { activeQuest, activeQuestType } = useMemo(() => {
    if (!questsData) return { activeQuest: null, activeQuestType: null };
    const dailyActive = questsData.daily.filter(q => q.status === "active" || q.status === "in_progress");
    const weeklyActive = questsData.weekly.filter(q => q.status === "active" || q.status === "in_progress");
    const tagged: { quest: Quest; type: "daily" | "weekly" }[] = [
      ...dailyActive.map(q => ({ quest: q, type: "daily" as const })),
      ...weeklyActive.map(q => ({ quest: q, type: "weekly" as const })),
    ];
    if (tagged.length === 0) return { activeQuest: null, activeQuestType: null };
    const sorted = tagged.sort((a, b) => {
      const aRatio = a.quest.targetProgress > 0 ? a.quest.currentProgress / a.quest.targetProgress : 0;
      const bRatio = b.quest.targetProgress > 0 ? b.quest.currentProgress / b.quest.targetProgress : 0;
      return bRatio - aRatio;
    });
    return { activeQuest: sorted[0].quest, activeQuestType: sorted[0].type };
  }, [questsData]);

  if (!isGuest && (isLoading || !effectiveData)) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={GlowColors.primary} />
      </View>
    );
  }

  const { player, credits } = effectiveData!;
  
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
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
    queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
  };

  return (
    <View style={styles.container}>
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
              guardAction(() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                navigation.navigate("CourtBooking" as never);
              });
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

        {/* UPCOMING PROVIDER SESSION - Smart card for booked provider services */}
        {!isGuest ? <UpcomingProviderSessionCard /> : null}

        {/* ── PLAY SECTION ── Book, find players, join matches */}
        <View style={styles.playDivider}>
          <View style={styles.playDividerLeft}>
            <View style={styles.playIconGlow}>
              <Ionicons name="tennisball" size={14} color={GlowColors.primary} />
            </View>
            <Text style={styles.playDividerText}>PLAY</Text>
          </View>
          <View style={styles.playDividerLine} />
        </View>

        <TrainingSessionsRow />
        <OpenSessionsRow />
        <TournamentsDiscoveryRow />
        <PlayersNearYouRow />

        {/* ── IMPROVE SECTION ── Feedback, progress, recognition */}
        <View style={styles.sectionDivider}>
          <Ionicons name="trending-up" size={12} color={GlowColors.primary} />
          <Text style={[styles.sectionDividerText, { color: GlowColors.primary }]}>IMPROVE</Text>
        </View>

        {/* WEEKLY AI FOCUS CARD */}
        {!isGuest && player?.id ? (
          <WeeklyAIFocusCard playerId={player.id} />
        ) : null}

        {/* AI COACH ENTRY CARD */}
        {!isGuest ? (
          <Pressable
            style={styles.aiCoachCard}
            onPress={() => {
              track("home:ai_coach");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              navigation.navigate("PlayerAICoach" as never);
            }}
          >
            <View style={styles.aiCoachIconWrap}>
              <Ionicons name="sparkles" size={20} color={Colors.dark.backgroundRoot} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiCoachTitle}>Ask Your AI Coach</Text>
              <Text style={styles.aiCoachDesc}>
                Powered by all your coach feedback and skill data
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={GlowColors.primary} />
          </Pressable>
        ) : null}

        <RecentFeedbackCard />

        {/* UPCOMING APPOINTMENT - Soonest confirmed service booking */}
        {!isGuest ? <UpcomingAppointmentCard /> : null}

        {/* ACTIVE QUEST CARD - Most urgent active quest teaser */}
        {!isGuest ? (
          <ActiveQuestCard
            quest={activeQuest}
            questType={activeQuestType}
            onViewAll={() => {
              track("home:quest_tracker");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("Quests" as never);
            }}
          />
        ) : null}

        <SpotlightCard
          onNominate={() => setShowSpotlightNomination(true)}
          onViewDetails={() => navigation.navigate("SpotlightDetail" as never)}
          accessibilityLabel="Player spotlight card"
        />

        <FriendSpotlightCard
          onAddFriends={() => navigateToTab("PlayStack", { screen: "Play", params: { initialTab: "Players" } })}
        />

        {/* ── COMMUNITY ── Social feed (has its own header) */}
        <MiniFeed />

        {/* ── SHOP ── Marketplace (has its own header) */}
        <GlowMarketSpotlight />
      </ScrollView>

      <BetaFeedbackButton
        playerId={player?.id}
        playerName={player?.name}
        bottomOffset={145}
      />
      
      {/* MODE SWITCHER - Dashboard switching button (top left) */}
      <CollapsibleModeSwitcher />
      
      {/* SPORT PICKER before booking wizard */}
      <Modal
        visible={showBookingSportPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBookingSportPicker(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowBookingSportPicker(false)}
        >
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#1A1F2E", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, paddingBottom: Spacing.xl }}>
            <Text style={{ color: Colors.dark.text, fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: Spacing.md }}>
              Book Lesson In
            </Text>
            {SPORT_DEFINITIONS.filter(s => activeSports.includes(s.key)).map(sportDef => {
              const isSelected = bookingWizardSport === sportDef.key;
              return (
                <Pressable
                  key={sportDef.key}
                  style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: 12, borderWidth: 1.5, borderColor: isSelected ? getSportColor(sportDef.key) : "rgba(255,255,255,0.08)", marginBottom: Spacing.sm, backgroundColor: isSelected ? getSportColor(sportDef.key) + "15" : "transparent" }}
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

      <WelcomeIntroModal
        role="player"
        slides={playerWelcomeSlides}
        onComplete={() => {}}
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
      <GuestPromptModal {...promptProps} />

      {/* DAILY BRIEFING SPLASH - Cinematic daily opener (once per calendar day) */}
      <DailyBriefingModal
        player={isGuest ? null : (effectiveData?.player ?? null)}
        nextSession={effectiveData?.nextSession ?? null}
        coachName={effectiveData?.coach?.name ?? null}
        isGuest={isGuest}
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
    backgroundColor: Backgrounds.root,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
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
    backgroundColor: "rgba(200, 255, 61, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  playDividerText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 3,
    color: GlowColors.primary,
    textTransform: "uppercase" as const,
  },
  playDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
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
  aiCoachCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: GlowColors.primary + "40",
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  aiCoachIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GlowColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  aiCoachTitle: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  aiCoachDesc: {
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  freePlayerCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(200, 255, 61, 0.08)",
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
    backgroundColor: "rgba(200, 255, 61, 0.15)",
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

const hStyles = StyleSheet.create({
  questCard: {
    backgroundColor: "#0F141B",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginHorizontal: Spacing.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  questCardEmpty: {
    backgroundColor: "#0F141B",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
    flexDirection: "row",
  },
  questEmptyText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  questViewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  questViewAllText: {
    fontSize: 12,
    color: GlowColors.primary,
    fontWeight: "700",
  },
  questCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  questIconBg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  questInfoBlock: {
    flex: 1,
    gap: 2,
  },
  questTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  questName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  questTypePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  questTypeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  questXpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  questXpText: {
    fontSize: 11,
    color: "#FFD700",
    fontWeight: "700",
  },
  viewAllLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  viewAllText: {
    fontSize: 11,
    color: GlowColors.primary,
    fontWeight: "700",
  },
  questProgressWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  questProgressBar: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  questProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
  questProgressText: {
    fontSize: 11,
    color: Colors.dark.textSubtle,
    fontWeight: "600",
    minWidth: 32,
    textAlign: "right",
  },
});
