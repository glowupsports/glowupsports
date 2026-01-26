import React, { useCallback, useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Spacing, Backgrounds, GlowColors, BorderRadius, Colors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { usePlayerDrawer } from "@/player/navigation/PlayerNavigator";
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
  const navigation = useNavigation<any>();
  const [showBookingWizard, setShowBookingWizard] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const { hasSeenScreen, startWalkthrough } = useWalkthrough();

  const { data: dashboardData, isLoading, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!user?.playerId,
  });

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

        {/* TENNIS NEWS - Below header, above Today is Open */}
        <NewsTicker />

        {/* HERO CTA - Next Session (PRIMARY ACTION) */}
        <SessionHeroCard onBookSession={handleBookLesson} />

        {/* TRACKING BANNER - Coach is watching */}
        <TrackingBanner />

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
});
