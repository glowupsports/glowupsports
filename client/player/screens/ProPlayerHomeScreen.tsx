import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { ProTennisColors, Spacing, Backgrounds, GlowColors, BorderRadius } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { usePlayerDrawer } from "@/player/navigation/PlayerNavigator";
import { PlayerStateProvider } from "@/player/context/PlayerStateContext";
import { ProPlayerCard } from "@/player/components/ProPlayerCard";
import { OnAirIndicator } from "@/player/components/OnAirIndicator";
import { TodayAtAGlance } from "@/player/components/TodayAtAGlance";
import { PlayersNearYouRow, OpenSessionsRow, TrainingSessionsRow } from "@/player/components/DiscoveryRows";
import { BookingHub } from "@/player/components/BookingHub";
import { MiniFeed } from "@/player/components/MiniFeed";
import { ProgressInsights } from "@/player/components/ProgressInsights";
import { TrackingBanner } from "@/player/components/TrackingBanner";
import { SessionHeroCard } from "@/player/components/SessionHeroCard";
import { NewsTicker } from "@/player/components/NewsTicker";
import { QuickServeFAB } from "@/player/components/QuickServeFAB";
import PlayerBookingWizard from "@/player/components/PlayerBookingWizard";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import Svg, { Line, Rect } from "react-native-svg";

interface QuickStatsStripProps {
  level: number;
  streak: number;
  xp: number;
}

function QuickStatsStrip({ level, streak, xp }: QuickStatsStripProps) {
  const xpToNextLevel = 1000 - (xp % 1000);
  const xpProgress = (xp % 1000) / 1000;

  return (
    <View style={quickStatsStyles.container}>
      <View style={quickStatsStyles.statBadge}>
        <Feather name="star" size={14} color={GlowColors.primary} />
        <View style={quickStatsStyles.statContent}>
          <Text style={quickStatsStyles.statValue}>{level}</Text>
          <Text style={quickStatsStyles.statLabel}>Level</Text>
        </View>
      </View>

      <View style={quickStatsStyles.divider} />

      <View style={quickStatsStyles.statBadge}>
        <Feather name="zap" size={14} color={ProTennisColors.warning} />
        <View style={quickStatsStyles.statContent}>
          <Text style={quickStatsStyles.statValue}>{streak}</Text>
          <Text style={quickStatsStyles.statLabel}>Streak</Text>
        </View>
      </View>

      <View style={quickStatsStyles.divider} />

      <View style={[quickStatsStyles.statBadge, quickStatsStyles.xpBadge]}>
        <View style={quickStatsStyles.xpProgressContainer}>
          <View style={[quickStatsStyles.xpProgressBar, { width: `${xpProgress * 100}%` }]} />
        </View>
        <View style={quickStatsStyles.statContent}>
          <Text style={quickStatsStyles.statValue}>{xpToNextLevel}</Text>
          <Text style={quickStatsStyles.statLabel}>XP to go</Text>
        </View>
      </View>
    </View>
  );
}

const quickStatsStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  statBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  statContent: {
    alignItems: "flex-start",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.5)",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginHorizontal: Spacing.sm,
  },
  xpBadge: {
    position: "relative",
  },
  xpProgressContainer: {
    position: "absolute",
    left: -Spacing.sm,
    top: -Spacing.sm,
    bottom: -Spacing.sm,
    right: -Spacing.sm,
    backgroundColor: "rgba(200, 255, 61, 0.08)",
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  xpProgressBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
  },
});

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
  const [showBookingWizard, setShowBookingWizard] = useState(false);

  const { data: dashboardData, isLoading, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!user?.playerId,
  });

  useFocusEffect(
    useCallback(() => {
      if (user?.playerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      }
    }, [user?.playerId, queryClient])
  );

  if (isLoading || !dashboardData) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <BroadcastBackground />
        <ActivityIndicator size="large" color={ProTennisColors.electricGreen} />
      </View>
    );
  }

  const { player, credits } = dashboardData;

  const handleAvatarPress = () => {
    openDrawer();
  };

  const handleWalletPress = () => {};

  const handleSquadPress = () => {};

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
            tintColor={ProTennisColors.electricGreen}
            colors={[ProTennisColors.electricGreen]}
          />
        }
      >
        {/* PLAYER HEADER - Identity card with ON AIR indicator */}
        <View style={styles.headerSection}>
          <ProPlayerCard
            player={player}
            credits={credits}
            onAvatarPress={handleAvatarPress}
            onWalletPress={handleWalletPress}
            onSquadPress={handleSquadPress}
            showSquadSwitch={true}
          />
          <View style={styles.onAirBadge}>
            <OnAirIndicator size="small" />
          </View>
        </View>

        {/* HERO CTA - Next Session (PRIMARY ACTION) */}
        <SessionHeroCard onBookSession={handleBookLesson} />

        {/* QUICK STATS STRIP - Compact Level, Streak, XP */}
        <QuickStatsStrip 
          level={player.level} 
          streak={player.streak} 
          xp={player.xp} 
        />

        {/* TRACKING BANNER - Coach is watching */}
        <TrackingBanner />

        {/* TENNIS NEWS */}
        <NewsTicker />

        {/* TODAY AT A GLANCE - Secondary status */}
        <TodayAtAGlance />

        {/* DISCOVERY SECTION - Horizontal scrolling rows */}
        <View style={styles.discoverySection}>
          <Text style={styles.discoverySectionTitle}>DISCOVER</Text>
          
          {/* Players Near You - Horizontal avatar carousel */}
          <PlayersNearYouRow />
          
          {/* Open Sessions - Join now cards */}
          <OpenSessionsRow />
          
          {/* Trainings - Quick access to lessons */}
          <TrainingSessionsRow />
        </View>

        {/* BOOK & PLAN - Full booking hub with all options */}
        <BookingHub />

        {/* COMMUNITY - Activity feed */}
        <MiniFeed />

        {/* YOUR PROGRESS - Human-readable insights */}
        <ProgressInsights />
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
    color: "rgba(255, 255, 255, 0.5)",
    letterSpacing: 2.5,
    paddingHorizontal: Spacing.lg,
    marginBottom: -Spacing.sm,
    textTransform: "uppercase",
  },
});
