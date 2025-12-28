import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import ModeSwitcher from "@/components/ModeSwitcher";
import { useAuth } from "@/coach/context/AuthContext";

interface DashboardData {
  player: {
    id: string;
    name: string;
    level: number;
    xp: number;
    glowScore: number;
    ballLevel: string | null;
    streak: number;
  };
  coach: {
    id: string;
    name: string;
    avatar?: string | null;
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
  lastFeedback: {
    message: string;
    date: string;
    coachName: string;
  } | null;
  recentXpGains: Array<{
    id: string;
    amount: number;
    reason: string;
    date: string;
  }>;
}

interface Peer {
  id: string;
  name: string;
  level: number;
  ballLevel: string | null;
  glowScore: number;
  avatar: string;
}

interface PeersData {
  totalPeers: number;
  peers: Peer[];
  sameLevelPeers: Peer[];
  myRankAtLevel: number;
  totalAtLevel: number;
}

function XPBar({ current, max, level }: { current: number; max: number; level: number }) {
  const progress = Math.min(current / max, 1);
  
  return (
    <View style={styles.xpBarContainer}>
      <View style={styles.xpBarTrack}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.xpBarFill, { width: `${progress * 100}%` }]}
        />
      </View>
      <View style={styles.xpLabels}>
        <Text style={styles.xpText}>Level {level}</Text>
        <Text style={styles.xpText}>{current} / {max} XP</Text>
      </View>
    </View>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PeerCard({ peer, onPress }: { peer: Peer; onPress: () => void }) {
  return (
    <Pressable style={styles.peerCard} onPress={onPress}>
      <View style={styles.peerAvatar}>
        <Text style={styles.peerAvatarText}>{peer.avatar}</Text>
      </View>
      <Text style={styles.peerName} numberOfLines={1}>{peer.name.split(" ")[0]}</Text>
      <Text style={styles.peerLevel}>Lv.{peer.level}</Text>
    </Pressable>
  );
}

export default function PlayerHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  
  const isPlayer = user?.role === "player";
  const isOwner = user?.role === "owner" || user?.role === "academy_owner" || user?.role === "platform_owner";
  const canAccessPlayerMode = isPlayer || isOwner;
  
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: canAccessPlayerMode,
  });
  
  const { data: peersData } = useQuery<PeersData>({
    queryKey: ["/api/player/me/peers"],
    enabled: canAccessPlayerMode,
  });

  const handlePeerPress = (peer: Peer) => {
    navigation.navigate("PeerJourney", { peerId: peer.id, peerName: peer.name });
  };

  if (!canAccessPlayerMode) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="tennisball" size={48} color={Colors.dark.xpCyan} />
        <Text style={styles.errorText}>Player Mode</Text>
        <Text style={styles.errorSubtext}>Sign in with a player or owner account to view this dashboard</Text>
        <ModeSwitcher />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Unable to load dashboard</Text>
        <Text style={styles.errorSubtext}>Please try again later</Text>
      </View>
    );
  }

  const { player, coach, academy, nextSession, lastFeedback } = data;
  const xpForNextLevel = (player.level + 1) * 500;
  const currentLevelXp = player.xp % 500;

  const getTimeUntilSession = () => {
    if (!nextSession) return null;
    const sessionDate = new Date(nextSession.date);
    const now = new Date();
    const diff = sessionDate.getTime() - now.getTime();
    if (diff < 0) return "Now";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    return `${hours}h`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.modeSwitcherContainer}>
        <ModeSwitcher />
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {isOwner && (
            <View style={styles.ownerBadge}>
              <Ionicons name="eye" size={14} color={Colors.dark.gold} />
              <Text style={styles.ownerBadgeText}>Owner Preview</Text>
            </View>
          )}
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>{isOwner ? "Academy Overview" : "Welcome back,"}</Text>
              <Text style={styles.playerName}>{player.name}</Text>
            </View>
            <View style={styles.avatarContainer}>
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                style={styles.avatarGradient}
              >
                <View style={styles.avatarInner}>
                  <Text style={styles.avatarText}>{player.name.charAt(0)}</Text>
                </View>
              </LinearGradient>
            </View>
          </View>
          
          <View style={styles.levelContainer}>
            <View style={styles.levelBadge}>
              <Ionicons name="star" size={16} color={Colors.dark.gold} />
              <Text style={styles.levelText}>Level {player.level}</Text>
            </View>
            <View style={styles.glowBadge}>
              <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
              <Text style={styles.glowText}>{player.glowScore} Glow</Text>
            </View>
          </View>
          
          <XPBar current={currentLevelXp} max={500} level={player.level} />
        </View>

        {nextSession ? (
          <View style={styles.nextSessionCard}>
            <View style={styles.nextSessionHeader}>
              <Ionicons name="calendar" size={20} color={Colors.dark.primary} />
              <Text style={styles.nextSessionTitle}>Next Training</Text>
              <View style={styles.countdownBadge}>
                <Text style={styles.countdownText}>{getTimeUntilSession()}</Text>
              </View>
            </View>
            <View style={styles.nextSessionDetails}>
              <Text style={styles.sessionType}>
                {nextSession.type === "private" ? "Private Session" : 
                 nextSession.type === "group" ? "Group Training" : "Training"}
              </Text>
              {nextSession.courtName ? (
                <Text style={styles.sessionCourt}>{nextSession.courtName}</Text>
              ) : null}
              {coach ? (
                <Text style={styles.sessionCoach}>with {coach.name}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {lastFeedback ? (
          <Pressable 
            style={styles.feedbackCard}
            onPress={() => navigation.navigate("Progress")}
          >
            <View style={styles.feedbackHeader}>
              <Ionicons name="chatbubble" size={20} color={Colors.dark.xpCyan} />
              <Text style={styles.feedbackTitle}>Coach Feedback</Text>
            </View>
            <Text style={styles.feedbackMessage}>"{lastFeedback.message}"</Text>
            <View style={styles.feedbackFooter}>
              <Text style={styles.feedbackCoach}>- {lastFeedback.coachName}</Text>
              <View style={styles.viewProgressCta}>
                <Text style={styles.viewProgressText}>View Progress</Text>
                <Ionicons name="arrow-forward" size={14} color={Colors.dark.primary} />
              </View>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.statsGrid}>
          <StatCard 
            label="Streak" 
            value={`${player.streak} days`} 
            icon="flame" 
            color={Colors.dark.orange} 
          />
          <StatCard 
            label="Total XP" 
            value={player.xp.toLocaleString()} 
            icon="trending-up" 
            color={Colors.dark.xpCyan} 
          />
        </View>

        {peersData && peersData.sameLevelPeers.length > 0 ? (
          <View style={styles.peersSection}>
            <View style={styles.peersSectionHeader}>
              <Ionicons name="people" size={18} color={Colors.dark.xpCyan} />
              <Text style={styles.peersSectionTitle}>Training Partners</Text>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>#{peersData.myRankAtLevel} of {peersData.totalAtLevel}</Text>
              </View>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.peersScroll}
            >
              {peersData.sameLevelPeers.slice(0, 8).map(peer => (
                <PeerCard 
                  key={peer.id} 
                  peer={peer} 
                  onPress={() => handlePeerPress(peer)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {academy ? (
          <View style={styles.academyCard}>
            <View style={styles.academyHeader}>
              <Ionicons name="school" size={20} color={Colors.dark.primary} />
              <Text style={styles.academyName}>{academy.name}</Text>
            </View>
            {coach ? (
              <View style={styles.coachInfo}>
                <View style={styles.coachAvatar}>
                  <Text style={styles.coachAvatarText}>{coach.name.charAt(0)}</Text>
                </View>
                <View>
                  <Text style={styles.coachLabel}>Your Coach</Text>
                  <Text style={styles.coachName}>{coach.name}</Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  errorSubtext: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  scrollView: {
    flex: 1,
  },
  modeSwitcherContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  header: {
    padding: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  greeting: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  playerName: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  avatarContainer: {
    width: 56,
    height: 56,
  },
  avatarGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    padding: 2,
  },
  avatarInner: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  levelContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  levelText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  glowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  glowText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  xpBarContainer: {
    marginTop: Spacing.xs,
  },
  xpBarTrack: {
    height: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 2,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  xpLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  xpText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  nextSessionCard: {
    ...CardStyles.glowCard,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  nextSessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  nextSessionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    flex: 1,
  },
  countdownBadge: {
    backgroundColor: "rgba(46, 204, 64, 0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  countdownText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  nextSessionDetails: {
    gap: 4,
  },
  sessionType: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sessionCourt: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  sessionCoach: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
  feedbackCard: {
    ...CardStyles.glowCard,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  feedbackHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  feedbackTitle: {
    ...Typography.h4,
    color: Colors.dark.xpCyan,
    flex: 1,
  },
  feedbackMessage: {
    ...Typography.h4,
    color: Colors.dark.text,
    fontStyle: "italic",
    lineHeight: 26,
    marginBottom: Spacing.md,
  },
  feedbackCoach: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  feedbackFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewProgressCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  viewProgressText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    ...CardStyles.statusCard,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.xs,
  },
  statValue: {
    ...Typography.numberMedium,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  academyCard: {
    ...CardStyles.elevated,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
  },
  academyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  academyName: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  coachInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  coachAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  coachAvatarText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  coachLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  peersSection: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    ...CardStyles.elevated,
    padding: Spacing.lg,
  },
  peersSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  peersSectionTitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  rankBadge: {
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  rankText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  peersScroll: {
    gap: Spacing.md,
  },
  peerCard: {
    alignItems: "center",
    gap: Spacing.xs,
    width: 64,
  },
  peerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.xpCyan,
  },
  peerAvatarText: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  peerName: {
    ...Typography.caption,
    color: Colors.dark.text,
    textAlign: "center",
  },
  peerLevel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  ownerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
    marginBottom: Spacing.sm,
  },
  ownerBadgeText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
});
