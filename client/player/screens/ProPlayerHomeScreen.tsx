import React, { useCallback } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProTennisColors, Spacing } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { usePlayerDrawer } from "@/player/navigation/PlayerNavigator";
import { PlayerStateProvider } from "@/player/context/PlayerStateContext";
import { ProPlayerCard } from "@/player/components/ProPlayerCard";
import { OnAirIndicator } from "@/player/components/OnAirIndicator";
import { TodayAtAGlance } from "@/player/components/TodayAtAGlance";
import { SocialDiscoveryStrip } from "@/player/components/SocialDiscoveryStrip";
import { BookingHub } from "@/player/components/BookingHub";
import { MiniFeed } from "@/player/components/MiniFeed";
import { ProgressInsights } from "@/player/components/ProgressInsights";
import { TrackingBanner } from "@/player/components/TrackingBanner";
import { SessionHeroCard } from "@/player/components/SessionHeroCard";
import { NewsTicker } from "@/player/components/NewsTicker";
import { QuickServeFAB } from "@/player/components/QuickServeFAB";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import Svg, { Line, Rect } from "react-native-svg";

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
        <Rect x="0" y="0" width="100%" height="100%" fill={ProTennisColors.midnightBlue} />
        <Line x1="0" y1="25%" x2="100%" y2="25%" stroke={ProTennisColors.electricGreen} strokeWidth="0.5" opacity="0.02" />
        <Line x1="0" y1="50%" x2="100%" y2="50%" stroke={ProTennisColors.electricGreen} strokeWidth="0.5" opacity="0.02" />
        <Line x1="0" y1="75%" x2="100%" y2="75%" stroke={ProTennisColors.electricGreen} strokeWidth="0.5" opacity="0.02" />
      </Svg>
    </View>
  );
}

function PlayerHomeContent() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { openDrawer } = usePlayerDrawer();

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

        {/* TRACKING BANNER - Coach is watching */}
        <TrackingBanner />

        {/* SESSION HERO - Dynamic session control card */}
        <SessionHeroCard />

        {/* ZONE 1 - TODAY AT A GLANCE */}
        <TodayAtAGlance />

        {/* ZONE 2 - PLAY & MEET (Social Discovery with player avatars) */}
        <SocialDiscoveryStrip />

        {/* ZONE 3 - BOOK & PLAN */}
        <BookingHub />

        {/* ZONE 4 - COMMUNITY MINI-FEED */}
        <MiniFeed />

        {/* ZONE 5 - YOUR PROGRESS */}
        <ProgressInsights />

        {/* TENNIS WORLD NEWS - Live news ticker */}
        <View style={styles.newsSection}>
          <NewsTicker />
        </View>
      </ScrollView>
      
      <QuickServeFAB bottomOffset={48} />
      
      {/* MODE SWITCHER - Dashboard switching button (top left) */}
      <CollapsibleModeSwitcher />
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
    backgroundColor: ProTennisColors.midnightBlue,
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
  newsSection: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },
});
