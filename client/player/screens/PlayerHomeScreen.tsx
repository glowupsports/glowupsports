import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Modal, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import ModeSwitcher from "@/components/ModeSwitcher";
import { useAuth } from "@/coach/context/AuthContext";
import { useAppMode } from "@/context/AppModeContext";
import { OwnerCard } from "@/player/components/OwnerCard";
import { PlayerStatusBar } from "@/player/components/PlayerStatusBar";
import { AcademyHubCard } from "@/player/components/AcademyHubCard";

interface OwnerProfileData {
  profile: {
    ownerName: string;
    academyName: string;
    role: string;
    visionTags: string[];
    publicMessage?: string;
    approved: boolean;
  } | null;
}

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
    yearsExperience?: number;
    philosophyTags?: string[];
    publicQuote?: string | null;
    bioApproved?: boolean;
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

interface OwnerAcademyStats {
  isOwnerView: boolean;
  academy: {
    id: string;
    name: string;
  };
  stats: {
    totalPlayers: number;
    activePlayers: number;
    totalCoaches: number;
    sessionsThisMonth: number;
    completedSessions: number;
    avgAttendanceRate: number;
  };
  topPerformers: Array<{
    id: string;
    name: string;
    level: number;
    totalXp: number;
    glowScore: number;
    ballLevel: string;
  }>;
  levelDistribution: {
    beginner: number;
    intermediate: number;
    advanced: number;
  };
  recentActivity: Array<{
    type: string;
    message: string;
    time: string;
  }>;
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

function OwnerStatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <View style={ownerStyles.statCard}>
      <View style={[ownerStyles.statIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[ownerStyles.statValue, { color }]}>{value}</Text>
      <Text style={ownerStyles.statLabel}>{label}</Text>
    </View>
  );
}

function TopPerformerCard({ performer, rank }: { performer: OwnerAcademyStats["topPerformers"][0]; rank: number }) {
  const rankColor = rank === 1 ? Colors.dark.gold : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : Colors.dark.textMuted;
  
  return (
    <View style={ownerStyles.performerCard}>
      <View style={ownerStyles.performerRank}>
        <Text style={[ownerStyles.rankNumber, { color: rankColor }]}>{rank}</Text>
      </View>
      <View style={ownerStyles.performerAvatar}>
        <Text style={ownerStyles.performerAvatarText}>{performer.name.charAt(0)}</Text>
      </View>
      <View style={ownerStyles.performerInfo}>
        <Text style={ownerStyles.performerName} numberOfLines={1}>{performer.name}</Text>
        <Text style={ownerStyles.performerLevel}>Lv.{performer.level} - {performer.totalXp.toLocaleString()} XP</Text>
      </View>
      <View style={ownerStyles.performerGlow}>
        <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
        <Text style={ownerStyles.performerGlowText}>{performer.glowScore}</Text>
      </View>
    </View>
  );
}

interface PlayerStatusAvatarProps {
  player: DashboardData["player"];
  coach: DashboardData["coach"];
  academy: DashboardData["academy"];
}

function PlayerStatusAvatar({ player, coach, academy }: PlayerStatusAvatarProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  
  return (
    <>
      <Pressable 
        style={styles.avatarContainer}
        onPress={() => setShowStatusMenu(true)}
      >
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          style={styles.avatarGradient}
        >
          <View style={styles.avatarInner}>
            <Text style={styles.avatarText}>{player.name.charAt(0)}</Text>
          </View>
        </LinearGradient>
      </Pressable>
      
      <Modal
        visible={showStatusMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusMenu(false)}
      >
        <Pressable 
          style={statusStyles.overlay}
          onPress={() => setShowStatusMenu(false)}
        >
          <View style={statusStyles.menu}>
            <View style={statusStyles.header}>
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                style={statusStyles.avatarGradient}
              >
                <View style={statusStyles.avatarInner}>
                  <Text style={statusStyles.avatarText}>{player.name.charAt(0)}</Text>
                </View>
              </LinearGradient>
              <Text style={statusStyles.playerName}>{player.name}</Text>
              {academy ? (
                <Text style={statusStyles.academyName}>{academy.name}</Text>
              ) : null}
            </View>
            
            <View style={statusStyles.statsRow}>
              <View style={statusStyles.statItem}>
                <Ionicons name="star" size={18} color={Colors.dark.gold} />
                <Text style={statusStyles.statValue}>Level {player.level}</Text>
              </View>
              <View style={statusStyles.statItem}>
                <Ionicons name="flash" size={18} color={Colors.dark.xpCyan} />
                <Text style={statusStyles.statValue}>{player.glowScore} Glow</Text>
              </View>
            </View>
            
            <View style={statusStyles.statsRow}>
              <View style={statusStyles.statItem}>
                <Ionicons name="flame" size={18} color={Colors.dark.orange} />
                <Text style={statusStyles.statValue}>{player.streak} day streak</Text>
              </View>
              <View style={statusStyles.statItem}>
                <Ionicons name="trending-up" size={18} color={Colors.dark.primary} />
                <Text style={statusStyles.statValue}>{player.xp.toLocaleString()} XP</Text>
              </View>
            </View>
            
            {player.ballLevel ? (
              <View style={statusStyles.ballLevelRow}>
                <Ionicons name="tennisball" size={18} color={Colors.dark.primary} />
                <Text style={statusStyles.ballLevelText}>{player.ballLevel} Ball</Text>
              </View>
            ) : null}
            
            {coach ? (
              <View style={statusStyles.coachRow}>
                <View style={statusStyles.coachAvatar}>
                  <Ionicons name="ribbon" size={14} color={Colors.dark.primary} />
                </View>
                <View>
                  <Text style={statusStyles.coachLabel}>Coach</Text>
                  <Text style={statusStyles.coachName}>{coach.name}</Text>
                </View>
              </View>
            ) : null}
            
            <Pressable 
              style={statusStyles.closeButton}
              onPress={() => setShowStatusMenu(false)}
            >
              <Text style={statusStyles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function PlayerHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { mode } = useAppMode();
  
  const isPlayer = user?.role === "player";
  const isOwnerRole = user?.role === "owner" || user?.role === "academy_owner" || user?.role === "platform_owner";
  const canAccessPlayerMode = isPlayer || isOwnerRole;
  
  const hasPlayerProfile = !!user?.playerId;
  const isInPlayerMode = mode === "player";
  
  const showPlayerDashboard = isInPlayerMode && hasPlayerProfile;
  const showOwnerOverview = isOwnerRole && !showPlayerDashboard;
  
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: canAccessPlayerMode && showPlayerDashboard,
  });
  
  const { data: ownerStats, isLoading: ownerLoading, error: ownerError } = useQuery<OwnerAcademyStats>({
    queryKey: ["/api/owner/academy-stats"],
    enabled: showOwnerOverview,
  });
  
  const { data: ownerProfileData } = useQuery<OwnerProfileData>({
    queryKey: ["/api/player/academy-owner"],
    enabled: canAccessPlayerMode && showPlayerDashboard,
  });

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

  if (showOwnerOverview && ownerLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
        <Text style={styles.loadingText}>Loading academy overview...</Text>
      </View>
    );
  }

  if (showOwnerOverview && ownerError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.modeSwitcherContainer}>
          <ModeSwitcher />
        </View>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Unable to load academy stats</Text>
        <Text style={styles.errorSubtext}>Please try again later</Text>
      </View>
    );
  }

  if (showOwnerOverview && ownerStats) {
    const { stats, topPerformers, levelDistribution, recentActivity, academy } = ownerStats;
    const totalDistribution = levelDistribution.beginner + levelDistribution.intermediate + levelDistribution.advanced;
    
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.modeSwitcherContainer}>
          <ModeSwitcher />
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={ownerStyles.header}>
            <View style={ownerStyles.ownerBadge}>
              <Ionicons name="business" size={14} color={Colors.dark.gold} />
              <Text style={ownerStyles.ownerBadgeText}>Academy Overview</Text>
            </View>
            <View style={ownerStyles.headerTop}>
              <View>
                <Text style={ownerStyles.greeting}>Welcome, Owner</Text>
                <Text style={ownerStyles.academyName}>{academy.name}</Text>
              </View>
              <View style={ownerStyles.avatarContainer}>
                <LinearGradient
                  colors={[Colors.dark.gold, Colors.dark.orange]}
                  style={ownerStyles.avatarGradient}
                >
                  <View style={ownerStyles.avatarInner}>
                    <Ionicons name="school" size={24} color={Colors.dark.gold} />
                  </View>
                </LinearGradient>
              </View>
            </View>
          </View>

          <View style={ownerStyles.statsGrid}>
            <OwnerStatCard 
              label="Players" 
              value={stats.totalPlayers} 
              icon="people" 
              color={Colors.dark.xpCyan} 
            />
            <OwnerStatCard 
              label="Coaches" 
              value={stats.totalCoaches} 
              icon="person" 
              color={Colors.dark.primary} 
            />
            <OwnerStatCard 
              label="Sessions" 
              value={stats.sessionsThisMonth} 
              icon="calendar" 
              color={Colors.dark.orange} 
            />
            <OwnerStatCard 
              label="Attendance" 
              value={`${stats.avgAttendanceRate}%`} 
              icon="checkmark-circle" 
              color={Colors.dark.successNeon} 
            />
          </View>

          <View style={ownerStyles.section}>
            <View style={ownerStyles.sectionHeader}>
              <Ionicons name="trophy" size={18} color={Colors.dark.gold} />
              <Text style={ownerStyles.sectionTitle}>Top Performers</Text>
            </View>
            <View style={ownerStyles.performersCard}>
              {topPerformers.map((performer, index) => (
                <TopPerformerCard key={performer.id} performer={performer} rank={index + 1} />
              ))}
            </View>
          </View>

          <View style={ownerStyles.section}>
            <View style={ownerStyles.sectionHeader}>
              <Ionicons name="bar-chart" size={18} color={Colors.dark.xpCyan} />
              <Text style={ownerStyles.sectionTitle}>Level Distribution</Text>
            </View>
            <View style={ownerStyles.distributionCard}>
              <View style={ownerStyles.distributionRow}>
                <Text style={ownerStyles.distributionLabel}>Beginner (Lv.1-3)</Text>
                <View style={ownerStyles.distributionBar}>
                  <View style={[ownerStyles.distributionFill, { width: `${(levelDistribution.beginner / totalDistribution) * 100}%`, backgroundColor: Colors.dark.primary }]} />
                </View>
                <Text style={ownerStyles.distributionValue}>{levelDistribution.beginner}</Text>
              </View>
              <View style={ownerStyles.distributionRow}>
                <Text style={ownerStyles.distributionLabel}>Intermediate (Lv.4-7)</Text>
                <View style={ownerStyles.distributionBar}>
                  <View style={[ownerStyles.distributionFill, { width: `${(levelDistribution.intermediate / totalDistribution) * 100}%`, backgroundColor: Colors.dark.xpCyan }]} />
                </View>
                <Text style={ownerStyles.distributionValue}>{levelDistribution.intermediate}</Text>
              </View>
              <View style={ownerStyles.distributionRow}>
                <Text style={ownerStyles.distributionLabel}>Advanced (Lv.8+)</Text>
                <View style={ownerStyles.distributionBar}>
                  <View style={[ownerStyles.distributionFill, { width: `${(levelDistribution.advanced / totalDistribution) * 100}%`, backgroundColor: Colors.dark.gold }]} />
                </View>
                <Text style={ownerStyles.distributionValue}>{levelDistribution.advanced}</Text>
              </View>
            </View>
          </View>

          <View style={ownerStyles.section}>
            <View style={ownerStyles.sectionHeader}>
              <Ionicons name="time" size={18} color={Colors.dark.textMuted} />
              <Text style={ownerStyles.sectionTitle}>Recent Activity</Text>
            </View>
            <View style={ownerStyles.activityCard}>
              {recentActivity.map((activity, index) => (
                <View key={index} style={ownerStyles.activityRow}>
                  <Ionicons 
                    name={activity.type === "session" ? "calendar" : activity.type === "xp" ? "trending-up" : "checkmark-circle"} 
                    size={16} 
                    color={Colors.dark.xpCyan} 
                  />
                  <View style={ownerStyles.activityInfo}>
                    <Text style={ownerStyles.activityMessage}>{activity.message}</Text>
                    <Text style={ownerStyles.activityTime}>{activity.time}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
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

  if (error || !data || !data.player) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.modeSwitcherContainer}>
          <ModeSwitcher />
        </View>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>No player profile found</Text>
        <Text style={styles.errorSubtext}>Please set up your player profile or switch to another mode</Text>
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
        contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
        showsVerticalScrollIndicator={false}
      >
        <PlayerStatusBar 
          player={player}
          coach={coach}
          lastFeedback={lastFeedback}
        />
        
        <View style={styles.xpSection}>
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

        {!academy ? (
          <AcademyHubCard 
            hasAcademy={false} 
            onBrowsePress={() => navigation.navigate("AcademyBrowser")}
          />
        ) : null}

        {academy ? (
          <View style={styles.academyCard}>
            <View style={styles.academyHeader}>
              <Ionicons name="school" size={20} color={Colors.dark.primary} />
              <Text style={styles.academyName}>{academy.name}</Text>
            </View>
            {coach ? (
              <View style={styles.coachSection}>
                <View style={styles.coachInfo}>
                  <View style={styles.coachAvatar}>
                    <Text style={styles.coachAvatarText}>{coach.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.coachDetails}>
                    <Text style={styles.coachLabel}>Your Coach</Text>
                    <Text style={styles.coachName}>{coach.name}</Text>
                    {coach.yearsExperience ? (
                      <Text style={styles.coachExperience}>
                        {coach.yearsExperience} experience
                      </Text>
                    ) : null}
                  </View>
                </View>
                {coach.philosophyTags && coach.philosophyTags.length > 0 ? (
                  <View style={styles.coachPhilosophy}>
                    {coach.philosophyTags.slice(0, 3).map((tag, i) => (
                      <View key={i} style={styles.philosophyTag}>
                        <Text style={styles.philosophyTagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {coach.publicQuote && coach.bioApproved ? (
                  <View style={styles.coachQuote}>
                    <Ionicons name="chatbubble-ellipses" size={14} color={Colors.dark.textMuted} />
                    <Text style={styles.coachQuoteText}>"{coach.publicQuote}"</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            
            {ownerProfileData?.profile && ownerProfileData.profile.approved ? (
              <View style={styles.ownerCardSection}>
                <OwnerCard
                  ownerName={ownerProfileData.profile.ownerName}
                  academyName={ownerProfileData.profile.academyName}
                  role={ownerProfileData.profile.role}
                  visionTags={ownerProfileData.profile.visionTags}
                  publicMessage={ownerProfileData.profile.publicMessage}
                  compact
                />
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
  xpSection: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
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
  coachSection: {
    marginTop: Spacing.sm,
  },
  coachDetails: {
    flex: 1,
  },
  coachExperience: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  coachPhilosophy: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: Spacing.sm,
  },
  philosophyTag: {
    backgroundColor: "rgba(46, 204, 64, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  philosophyTagText: {
    ...Typography.small,
    fontSize: 11,
    color: Colors.dark.primary,
  },
  coachQuote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  coachQuoteText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
    flex: 1,
  },
  ownerCardSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
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

const ownerStyles = StyleSheet.create({
  header: {
    padding: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  ownerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  ownerBadgeText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  academyName: {
    ...Typography.h2,
    color: Colors.dark.gold,
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
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  statCard: {
    width: "47%",
    ...CardStyles.elevated,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.xs,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  statValue: {
    ...Typography.h2,
    fontWeight: "700",
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  section: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  performersCard: {
    ...CardStyles.elevated,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  performerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  performerRank: {
    width: 24,
    alignItems: "center",
  },
  rankNumber: {
    ...Typography.h4,
    fontWeight: "700",
  },
  performerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  performerAvatarText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  performerInfo: {
    flex: 1,
  },
  performerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  performerLevel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  performerGlow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  performerGlowText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  distributionCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  distributionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  distributionLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    width: 130,
  },
  distributionBar: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 4,
    overflow: "hidden",
  },
  distributionFill: {
    height: "100%",
    borderRadius: 4,
  },
  distributionValue: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
    width: 24,
    textAlign: "right",
  },
  activityCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  activityInfo: {
    flex: 1,
  },
  activityMessage: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  activityTime: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
});

const statusStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  menu: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 320,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    padding: 3,
    marginBottom: Spacing.md,
  },
  avatarInner: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 37,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    ...Typography.h1,
    color: Colors.dark.text,
    fontSize: 32,
  },
  playerName: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  academyName: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: Spacing.md,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  ballLevelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  ballLevelText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  coachAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  coachLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  closeButton: {
    backgroundColor: Colors.dark.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  closeButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
});
