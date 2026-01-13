import React, { useCallback, useMemo } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProTennisColors, Spacing } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { ProPlayerCard } from "@/player/components/ProPlayerCard";
import { CenterCourtHero } from "@/player/components/CenterCourtHero";
import { PerformanceCenterGrid } from "@/player/components/PerformanceCenterGrid";
import { SocialTickerFooter, TickerItem } from "@/player/components/SocialTickerFooter";
import { QuickServeFAB } from "@/player/components/QuickServeFAB";
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

function CourtLinesBackground() {
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Rect x="0" y="0" width="100%" height="100%" fill={ProTennisColors.midnightBlue} />
      <Line x1="0" y1="50%" x2="100%" y2="50%" stroke={ProTennisColors.white} strokeWidth="1" opacity="0.05" />
      <Line x1="50%" y1="0" x2="50%" y2="100%" stroke={ProTennisColors.white} strokeWidth="1" opacity="0.05" />
      <Rect x="10%" y="20%" width="80%" height="60%" stroke={ProTennisColors.white} strokeWidth="1" fill="none" opacity="0.03" />
      <Line x1="10%" y1="50%" x2="90%" y2="50%" stroke={ProTennisColors.white} strokeWidth="1" opacity="0.04" />
    </Svg>
  );
}

export default function ProPlayerHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: dashboardData, isLoading, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["/api/player/dashboard"],
    enabled: !!user?.playerId,
  });

  const { data: recognitionData } = useQuery<RecognitionData>({
    queryKey: ["/api/player/me/recognition"],
    enabled: !!user?.playerId,
  });

  useFocusEffect(
    useCallback(() => {
      if (user?.playerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/player/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/recognition"] });
      }
    }, [user?.playerId, queryClient])
  );

  const tickerItems = useMemo((): TickerItem[] => {
    const items: TickerItem[] = [];
    
    if (!recognitionData) return items;
    
    const earnedAchievements = recognitionData.achievements.filter(a => a.earned);
    const earnedBadges = recognitionData.domainBadges.filter(b => b.earned);
    
    if (recognitionData.summary.earnedAchievements > 0) {
      items.push({
        id: "achievements-count",
        type: "achievement",
        icon: "trophy",
        color: ProTennisColors.electricGreen,
        text: `ACHIEVEMENTS: ${recognitionData.summary.earnedAchievements}/${recognitionData.summary.totalAchievements} Unlocked`,
      });
    }
    
    earnedAchievements.slice(0, 2).forEach(achievement => {
      items.push({
        id: `achievement-${achievement.id}`,
        type: "achievement",
        icon: "ribbon",
        color: achievement.color || ProTennisColors.electricGreen,
        text: `EARNED: ${achievement.name}`,
      });
    });
    
    earnedBadges.slice(0, 2).forEach(badge => {
      items.push({
        id: `badge-${badge.id}`,
        type: "goal",
        icon: "star",
        color: badge.color || ProTennisColors.neonCyan,
        text: `BADGE: ${badge.name}`,
      });
    });
    
    if (recognitionData.validations.length > 0) {
      const latestValidation = recognitionData.validations[0];
      items.push({
        id: `validation-${latestValidation.id}`,
        type: "notification",
        icon: "checkmark-circle",
        color: ProTennisColors.neonCyan,
        text: `COACH VALIDATED: ${latestValidation.domain}`,
      });
    }
    
    if (recognitionData.summary.earnedDomainBadges > 0) {
      items.push({
        id: "domain-progress",
        type: "streak",
        icon: "flame",
        color: ProTennisColors.warning,
        text: `SKILL MASTERY: ${recognitionData.summary.earnedDomainBadges} Domains Started`,
      });
    }
    
    return items;
  }, [recognitionData]);

  if (isLoading || !dashboardData) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <CourtLinesBackground />
        <ActivityIndicator size="large" color={ProTennisColors.electricGreen} />
      </View>
    );
  }

  const { player, coach, nextSession, credits } = dashboardData;

  const handleCheckIn = () => {
    if (nextSession) {
      navigation.navigate("PlayerSchedule");
    }
  };

  const handleBookSession = () => {
    navigation.navigate("LessonBooking");
  };

  const handleFindMatch = () => {
    navigation.navigate("OpenMatchFeed");
  };

  const handleAvatarPress = () => {
    navigation.navigate("PlayerProfile");
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
      <CourtLinesBackground />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top, paddingBottom: 120 },
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
        <ProPlayerCard
          player={player}
          credits={credits}
          onAvatarPress={handleAvatarPress}
          onWalletPress={handleWalletPress}
          onSquadPress={handleSquadPress}
          showSquadSwitch={true}
        />

        <View style={styles.heroSection}>
          <CenterCourtHero
            nextSession={sessionWithCoach}
            onCheckIn={handleCheckIn}
            onBookSession={handleBookSession}
            onFindMatch={handleFindMatch}
          />
        </View>

        <View style={styles.performanceSection}>
          <PerformanceCenterGrid playerLevel={player.level} />
        </View>
      </ScrollView>

      <SocialTickerFooter items={tickerItems} />
      
      <QuickServeFAB bottomOffset={60} />
    </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: Spacing.xl,
  },
  heroSection: {
    marginTop: Spacing.md,
  },
  performanceSection: {
    marginTop: Spacing.sm,
  },
});
