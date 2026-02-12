import React, { useCallback, useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Spacing, Backgrounds, GlowColors, BorderRadius, Colors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { useWalkthrough } from "@/player/context/WalkthroughContext";
import { PlayerStateProvider } from "@/player/context/PlayerStateContext";
import { ProPlayerCard } from "@/player/components/ProPlayerCard";
import { PlayersNearYouRow, OpenSessionsRow, TrainingSessionsRow } from "@/player/components/DiscoveryRows";
import { MiniFeed } from "@/player/components/MiniFeed";
import { TrackingBanner } from "@/player/components/TrackingBanner";
import { SessionHeroCard } from "@/player/components/SessionHeroCard";
import { NewsTicker } from "@/player/components/NewsTicker";
import { QuickServeFAB } from "@/player/components/QuickServeFAB";
import PlayerBookingWizard from "@/player/components/PlayerBookingWizard";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import PinEntryModal from "@/components/PinEntryModal";
import Svg, { Line, Rect } from "react-native-svg";
import { BirthdayConfettiOverlay } from "@/player/components/BirthdayThemeOverlay";
import { BirthdayBanner, BirthdayXPBonusCard } from "@/player/components/BirthdayThemeOverlay";
import { RecentFeedbackCard } from "@/player/components/RecentFeedbackCard";
import { FeedbackToast } from "@/player/components/FeedbackToast";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { WelcomeIntroModal } from "@/components/WelcomeIntroModal";
import { HelpButton } from "@/components/HelpButton";
import { QuickTipsBanner } from "@/components/QuickTipsBanner";
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
}

function BroadcastBackground() {
  return (
    <View style={styles.backgroundContainer}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Rect x="0" y="0" width="100%" height="100%" fill={Backgrounds.root} />
        <Line x1="0" y1="25%" x2="100%" y2="25%" stroke={GlowColors.primary} strokeWidth="0.5" opacity="0.015" />
        <Line x1="0" y1="50%" x2="100%" y2="50%" stroke={GlowColors.primary} strokeWidth="0.5" opacity="0.015" />
        <Line x1="0" y1="75%" x2="100%" y2="75%" stroke={GlowColors.primary} strokeWidth="0.5" opacity="0.015" />
      </Svg>
    </View>
  );
}

function PlayerHomeContent() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { openDrawer } = usePlayerDrawer();
  const navigation = useNavigation<any>();
  const [showBookingWizard, setShowBookingWizard] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const { hasSeenScreen, startWalkthrough } = useWalkthrough();
  const [showWelcome, setShowWelcome] = useState(false);

  const { data: dashboardData, isLoading, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!user?.playerId,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/player/me/notifications/unread-count"],
    enabled: !!user?.playerId,
    refetchInterval: 30000,
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

  const playerChecklistSteps = useMemo(() => {
    const hasAcademy = !!dashboardData?.academy;
    const hasCoach = !!dashboardData?.coach;
    const hasNextSession = !!dashboardData?.nextSession;
    const hasProfile = !!dashboardData?.player?.profilePhotoUrl;
    
    return [
      {
        id: "complete_profile",
        icon: "person-circle" as const,
        title: "Complete Your Profile",
        description: "Add a photo and personalise your tennis profile",
        actionLabel: "Go to Profile",
        onAction: () => navigation.navigate("PlayerProfile" as never),
        isCompleted: hasProfile,
      },
      {
        id: "join_academy",
        icon: "business" as const,
        title: "Join an Academy",
        description: "Connect with a tennis academy near you",
        actionLabel: "Browse Academies",
        onAction: () => navigation.navigate("AcademyBrowser" as never),
        isCompleted: hasAcademy,
      },
      {
        id: "book_session",
        icon: "calendar" as const,
        title: "Book Your First Session",
        description: "Schedule a training session with your coach",
        actionLabel: "Book Now",
        onAction: () => setShowBookingWizard(true),
        isCompleted: hasNextSession,
      },
      {
        id: "check_progress",
        icon: "trending-up" as const,
        title: "Check Your Progress",
        description: "See your skill ratings and Glow Score",
        actionLabel: "View Progress",
        onAction: () => navigation.navigate("PlayerProgress" as never),
        isCompleted: false,
      },
      {
        id: "explore_community",
        icon: "people" as const,
        title: "Meet Other Players",
        description: "Find players near you and join the community",
        actionLabel: "Explore",
        onAction: () => navigation.navigate("Community" as never),
        isCompleted: false,
      },
    ];
  }, [dashboardData, navigation, setShowBookingWizard]);

  const playerTips = [
    { id: "tip_xp", icon: "star", text: "Tip: Attend sessions regularly to earn XP and level up faster" },
    { id: "tip_profile", icon: "person", text: "Tip: Complete your profile to unlock more features" },
    { id: "tip_community", icon: "people", text: "Tip: Check the Community tab to find players near you" },
    { id: "tip_feedback", icon: "chatbubble", text: "Tip: Check your Feedback Center after each session for coach insights" },
    { id: "tip_credits", icon: "card", text: "Tip: Keep an eye on your credits to make sure you have enough for bookings" },
  ];

  const playerFAQs = [
    { question: "How do I book a session?", answer: "Tap 'Book Lesson' on your home screen or go to the Schedule tab to see available sessions.", category: "Booking" },
    { question: "What is my Glow Score?", answer: "Your Glow Score reflects your overall tennis skill level. It's calculated from coach assessments across 6 skill pillars.", category: "Progress" },
    { question: "How do I earn XP?", answer: "You earn XP by attending sessions, completing challenges, and achieving milestones. XP increases your player level.", category: "Progress" },
    { question: "What are credits?", answer: "Credits are prepaid lesson tokens. You use them to book sessions. Different session types use different credit types (private, semi-private, group).", category: "Billing" },
    { question: "How do I find other players?", answer: "Go to the Community tab to see players near you, or check the Play tab for open matches and social games.", category: "Social" },
    { question: "What is my Ball Level?", answer: "Ball Level indicates your skill stage: Red (beginner), Orange, Green, Yellow (advanced), or Adult DSS for competitive adults.", category: "Progress" },
  ];

  const playerWelcomeSlides = [
    {
      icon: "tennisball",
      iconColor: "#2ECC40",
      title: "Welcome to Glow Up Sports!",
      description: "Your personal tennis companion. Track your progress, connect with coaches, and level up your game.",
    },
    {
      icon: "trending-up",
      iconColor: "#00BCD4",
      title: "Track Your Progress",
      description: "Every session earns you XP. Watch your Glow Score grow as you improve across all skill areas.",
    },
    {
      icon: "people",
      iconColor: "#FF9800",
      title: "Connect & Compete",
      description: "Find other players near you, book courts, join matches, and climb the leaderboard.",
    },
    {
      icon: "rocket",
      iconColor: "#9B59B6",
      title: "Ready to Play?",
      description: "Complete your Getting Started checklist on the home screen to set everything up. Let's go!",
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
    queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
  };

  return (
    <View style={styles.container}>
      <BroadcastBackground />

      <Pressable 
        style={[styles.notificationBell, { top: insets.top + 8 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("PlayerNotifications");
        }}
      >
        <Ionicons name="notifications-outline" size={22} color={Colors.dark.text} />
        {unreadCount > 0 ? (
          <View style={styles.bellBadge}>
            <Text style={styles.bellBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
          </View>
        ) : null}
      </Pressable>
      
      {isBirthday && <BirthdayConfettiOverlay />}
      
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

        {/* GETTING STARTED CHECKLIST */}
        <GettingStartedChecklist
          role="player"
          steps={playerChecklistSteps}
        />

        <QuickTipsBanner role="player" tips={playerTips} />

        {/* PLAYER HEADER - Identity card */}
        <View style={styles.headerSection}>
          <ProPlayerCard
            player={player}
            credits={credits}
            onAvatarPress={handleAvatarPress}
            onWalletPress={handleWalletPress}
            onSquadPress={handleSquadPress}
            showSquadSwitch={true}
          />
        </View>

        {/* BIRTHDAY XP BONUS - 2x XP message on birthday */}
        {isBirthday && <BirthdayXPBonusCard />}

        {/* TENNIS NEWS - Below header, above Today is Open */}
        <NewsTicker />

        {/* HERO CTA - Next Session (PRIMARY ACTION) */}
        <SessionHeroCard onBookSession={handleBookLesson} />

        {/* TRACKING BANNER - Coach is watching */}
        <TrackingBanner />

        {/* RECENT COACH FEEDBACK */}
        <RecentFeedbackCard />

        {/* DISCOVERY SECTION - Horizontal scrolling rows */}
        <View style={styles.discoverySection}>
          <Text style={styles.discoverySectionTitle}>DISCOVER</Text>
          
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
  notificationBell: {
    position: "absolute",
    top: 0,
    right: Spacing.lg,
    zIndex: 100,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  bellBadge: {
    position: "absolute",
    top: 4,
    right: 2,
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Backgrounds.root,
  },
  bellBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
