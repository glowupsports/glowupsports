import React, { useCallback, useMemo } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProTennisColors, Spacing } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { usePlayerDrawer } from "@/player/navigation/PlayerNavigator";
import { PlayerStateProvider } from "@/player/context/PlayerStateContext";
import { ProPlayerCard } from "@/player/components/ProPlayerCard";
import { CenterCourtArena } from "@/player/components/CenterCourtArena";
import { AnalysisDesk } from "@/player/components/AnalysisDesk";
import { StorylineStrip } from "@/player/components/StorylineStrip";
import { LiveTicker } from "@/player/components/LiveTicker";
import { PerformanceCenterGrid } from "@/player/components/PerformanceCenterGrid";
import { QuickServeFAB } from "@/player/components/QuickServeFAB";
import { OnAirIndicator } from "@/player/components/OnAirIndicator";
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
  } | null;
  credits?: {
    total: number;
    group: number;
    private: number;
    semi_private: number;
  };
}

interface RecognitionData {
  achievements: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    earned: boolean;
    earnedAt: string | null;
  }>;
  domainBadges: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    earned: boolean;
    earnedAt: string | null;
    progress: number;
    domainId: string;
  }>;
  validations: Array<{
    id: string;
    type: string;
    domain: string;
    status: string;
    validatedAt: Date;
  }>;
  summary: {
    totalAchievements: number;
    earnedAchievements: number;
    totalDomainBadges: number;
    earnedDomainBadges: number;
    totalValidations: number;
  };
}

function BroadcastBackground() {
  return (
    <View style={styles.backgroundContainer}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Rect x="0" y="0" width="100%" height="100%" fill={ProTennisColors.midnightBlue} />
        <Line x1="0" y1="33%" x2="100%" y2="33%" stroke={ProTennisColors.electricGreen} strokeWidth="0.5" opacity="0.03" />
        <Line x1="0" y1="66%" x2="100%" y2="66%" stroke={ProTennisColors.electricGreen} strokeWidth="0.5" opacity="0.03" />
        <Rect x="5%" y="10%" width="90%" height="80%" stroke={ProTennisColors.electricGreen} strokeWidth="0.5" fill="none" opacity="0.02" />
      </Svg>
    </View>
  );
}

function BroadcastHomeContent() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { openDrawer } = usePlayerDrawer();

  const { data: dashboardData, isLoading, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!user?.playerId,
  });

  const { data: recognitionData } = useQuery<RecognitionData>({
    queryKey: ["/api/player/me/recognition"],
    enabled: !!user?.playerId,
  });

  useFocusEffect(
    useCallback(() => {
      if (user?.playerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/recognition"] });
      }
    }, [user?.playerId, queryClient])
  );

  const stats = useMemo(() => {
    if (!recognitionData) return undefined;
    return {
      earnedAchievements: recognitionData.summary.earnedAchievements,
      totalAchievements: recognitionData.summary.totalAchievements,
    };
  }, [recognitionData]);

  if (isLoading || !dashboardData) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <BroadcastBackground />
        <ActivityIndicator size="large" color={ProTennisColors.electricGreen} />
      </View>
    );
  }

  const { player, coach, nextSession, credits } = dashboardData;

  const handleCheckIn = () => {
    if (nextSession) {
      navigation.navigate("PlayerTabs", { screen: "Schedule" });
    }
  };

  const handleBookSession = () => {
    navigation.navigate("LessonBooking");
  };

  const handleFindMatch = () => {
    navigation.navigate("OpenMatches");
  };

  const handleAvatarPress = () => {
    openDrawer();
  };

  const handleWalletPress = () => {
    navigation.navigate("ParentPayments");
  };

  const handleSquadPress = () => {
    navigation.navigate("FamilyLobby");
  };

  const sessionWithCoach = nextSession ? {
    ...nextSession,
    coachName: coach?.name,
  } : null;

  return (
    <View style={styles.container}>
      <BroadcastBackground />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top, paddingBottom: 80 },
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
        {/* BROADCAST HEADER - Player ID Card with ON AIR */}
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

        {/* STORYLINE STRIP - What's at stake */}
        <StorylineStrip />

        {/* CENTER COURT ARENA - Main broadcast segment */}
        <View style={styles.arenaSection}>
          <CenterCourtArena
            nextSession={sessionWithCoach}
            onCheckIn={handleCheckIn}
            onBookSession={handleBookSession}
            onFindMatch={handleFindMatch}
          />
        </View>

        {/* ANALYSIS DESK - Stats overlay */}
        <AnalysisDesk stats={{ sessionsThisWeek: player.streak }} />

        {/* PERFORMANCE SNAPSHOTS - Quick tiles */}
        <View style={styles.performanceSection}>
          <PerformanceCenterGrid playerLevel={player.level} />
        </View>
      </ScrollView>

      {/* LIVE TICKER - ESPN-style bottom ticker */}
      <View style={styles.tickerContainer}>
        <LiveTicker stats={stats} />
      </View>
      
      <QuickServeFAB bottomOffset={48} />
    </View>
  );
}

export default function ProPlayerHomeScreen() {
  return (
    <PlayerStateProvider>
      <BroadcastHomeContent />
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
    gap: Spacing.sm,
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
  arenaSection: {
    marginTop: Spacing.sm,
  },
  performanceSection: {
    marginTop: Spacing.md,
  },
  tickerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
});
