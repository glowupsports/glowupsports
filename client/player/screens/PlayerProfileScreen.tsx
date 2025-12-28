import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useAppMode } from "@/context/AppModeContext";

interface PlayerProfile {
  id: string;
  name: string;
  email: string;
  level: number;
  xp: number;
  glowScore: number;
  ballLevel: string;
  avatar?: string;
  stats: {
    sessionsPlayed: number;
    minutesTrained: number;
    streak: number;
    favoriteSkill: string;
  };
  coach: {
    id: string;
    name: string;
    email?: string;
  };
  academy: {
    id: string;
    name: string;
  };
  joinedAt: string;
}

function StatItem({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <View style={styles.statItem}>
      <View style={styles.statIcon}>
        <Ionicons name={icon as any} size={18} color={Colors.dark.primary} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

function getLevelTitle(level: number): string {
  if (level < 5) return "Beginner";
  if (level < 10) return "Rising Star";
  if (level < 15) return "Intermediate";
  if (level < 20) return "Advanced";
  if (level < 30) return "Expert";
  return "Champion";
}

function getBallLevelColor(ballLevel: string): string {
  switch (ballLevel.toLowerCase()) {
    case "red": return Colors.dark.ballRed;
    case "orange": return Colors.dark.ballOrange;
    case "green": return Colors.dark.ballGreen;
    case "yellow": return Colors.dark.ballYellow;
    case "glow": return Colors.dark.ballGlow;
    default: return Colors.dark.primary;
  }
}

export default function PlayerProfileScreen() {
  const insets = useSafeAreaInsets();
  const { setMode } = useAppMode();

  const { data: profile } = useQuery<PlayerProfile>({
    queryKey: ["/api/player/profile"],
    enabled: false,
  });

  const mockProfile: PlayerProfile = {
    id: "1",
    name: "Alex Thompson",
    email: "alex@example.com",
    level: 12,
    xp: 2450,
    glowScore: 78,
    ballLevel: "orange",
    stats: {
      sessionsPlayed: 45,
      minutesTrained: 2700,
      streak: 5,
      favoriteSkill: "Forehand",
    },
    coach: {
      id: "1",
      name: "Coach Mike",
      email: "mike@glowup.tennis",
    },
    academy: {
      id: "1",
      name: "Glow Up Tennis Academy",
    },
    joinedAt: "2024-06-15",
  };

  const data = profile || mockProfile;
  const ballColor = getBallLevelColor(data.ballLevel);
  const memberSince = new Date(data.joinedAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const handleSwitchToCoach = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode("coach");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.avatarSection}>
            <View style={styles.avatarContainer}>
              <LinearGradient
                colors={[ballColor, Colors.dark.xpCyan]}
                style={styles.avatarGradient}
              >
                <View style={styles.avatarInner}>
                  <Text style={styles.avatarText}>{data.name.charAt(0)}</Text>
                </View>
              </LinearGradient>
              <View style={[styles.levelBadgeOverlay, { backgroundColor: ballColor }]}>
                <Text style={styles.levelBadgeText}>{data.level}</Text>
              </View>
            </View>
            <Text style={styles.playerName}>{data.name}</Text>
            <Text style={styles.levelTitle}>{getLevelTitle(data.level)}</Text>
          </View>

          <View style={styles.badges}>
            <View style={[styles.ballBadge, { borderColor: ballColor }]}>
              <View style={[styles.ballDot, { backgroundColor: ballColor }]} />
              <Text style={[styles.ballText, { color: ballColor }]}>
                {data.ballLevel.charAt(0).toUpperCase() + data.ballLevel.slice(1)} Ball
              </Text>
            </View>
            <View style={styles.glowBadge}>
              <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
              <Text style={styles.glowText}>{data.glowScore} Glow</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.sectionTitle}>Your Stats</Text>
          <View style={styles.statsGrid}>
            <StatItem 
              label="Sessions" 
              value={data.stats.sessionsPlayed} 
              icon="tennisball" 
            />
            <StatItem 
              label="Minutes" 
              value={data.stats.minutesTrained.toLocaleString()} 
              icon="time" 
            />
            <StatItem 
              label="Streak" 
              value={`${data.stats.streak} days`} 
              icon="flame" 
            />
            <StatItem 
              label="Best Skill" 
              value={data.stats.favoriteSkill} 
              icon="star" 
            />
          </View>
        </View>

        <View style={styles.coachCard}>
          <Text style={styles.sectionTitle}>Your Coach</Text>
          <View style={styles.coachInfo}>
            <View style={styles.coachAvatar}>
              <Text style={styles.coachAvatarText}>{data.coach.name.charAt(0)}</Text>
            </View>
            <View style={styles.coachDetails}>
              <Text style={styles.coachName}>{data.coach.name}</Text>
              {data.coach.email ? (
                <Text style={styles.coachEmail}>{data.coach.email}</Text>
              ) : null}
            </View>
            <Pressable 
              style={styles.chatButton}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Ionicons name="chatbubble" size={18} color={Colors.dark.primary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.academyCard}>
          <View style={styles.academyHeader}>
            <Ionicons name="school" size={20} color={Colors.dark.primary} />
            <Text style={styles.academyName}>{data.academy.name}</Text>
          </View>
          <Text style={styles.memberSince}>Member since {memberSince}</Text>
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Settings</Text>
          
          <Pressable 
            style={styles.settingsItem}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          >
            <View style={styles.settingsIcon}>
              <Ionicons name="notifications-outline" size={20} color={Colors.dark.text} />
            </View>
            <Text style={styles.settingsLabel}>Notifications</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>

          <Pressable 
            style={styles.settingsItem}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          >
            <View style={styles.settingsIcon}>
              <Ionicons name="help-circle-outline" size={20} color={Colors.dark.text} />
            </View>
            <Text style={styles.settingsLabel}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>

          <Pressable 
            style={styles.settingsItem}
            onPress={handleSwitchToCoach}
          >
            <View style={[styles.settingsIcon, { backgroundColor: "rgba(46, 204, 64, 0.15)" }]}>
              <Ionicons name="swap-horizontal" size={20} color={Colors.dark.primary} />
            </View>
            <Text style={[styles.settingsLabel, { color: Colors.dark.primary }]}>
              Switch to Coach Mode
            </Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.primary} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    padding: Spacing.xl,
    paddingTop: Spacing["2xl"],
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: Spacing.md,
  },
  avatarGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    padding: 3,
  },
  avatarInner: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 47,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    ...Typography.h1,
    color: Colors.dark.text,
    fontSize: 36,
  },
  levelBadgeOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: Colors.dark.backgroundRoot,
  },
  levelBadgeText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  playerName: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  levelTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  badges: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  ballBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.lg,
  },
  ballDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ballText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  glowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.lg,
  },
  glowText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  statsCard: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  statItem: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  coachCard: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  coachInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  coachAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  coachAvatarText: {
    ...Typography.h4,
    color: Colors.dark.backgroundRoot,
  },
  coachDetails: {
    flex: 1,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachEmail: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  chatButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  academyCard: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  academyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 4,
  },
  academyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  memberSince: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginLeft: 28,
  },
  settingsSection: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  settingsLabel: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
  },
});
