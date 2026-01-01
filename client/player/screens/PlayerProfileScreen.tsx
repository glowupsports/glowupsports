import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useAppMode } from "@/context/AppModeContext";
import { useAuth } from "@/coach/context/AuthContext";

interface ProfileData {
  player: {
    id: string;
    name: string;
    email: string;
    level: number;
    xp: number;
    glowScore: number;
    ballLevel: string | null;
    streak: number;
    createdAt: string;
  };
  coach: {
    id: string;
    name: string;
    email?: string;
  } | null;
  academy: {
    id: string;
    name: string;
  } | null;
  stats: {
    sessionsAttended: number;
    sessionsTotal: number;
    attendanceRate: number;
  };
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
  const navigation = useNavigation<any>();
  const { setMode } = useAppMode();
  const { logout } = useAuth();

  const { data, isLoading, error } = useQuery<ProfileData>({
    queryKey: ["/api/player/me/profile"],
  });

  const handleLogout = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("Are you sure you want to sign out?");
      if (confirmed) {
        logout();
      }
    } else {
      Alert.alert(
        "Sign Out",
        "Are you sure you want to sign out?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sign Out",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              logout();
            },
          },
        ]
      );
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  if (error || !data || !data.player) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Unable to load profile</Text>
        <Text style={styles.errorSubtext}>Please try again later</Text>
      </View>
    );
  }

  const { player, coach, academy, stats } = data;
  const ballColor = getBallLevelColor(player.ballLevel || "red");
  const memberSince = new Date(player.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const handleSwitchToCoach = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode("coach");
  };

  const ballLevel = player.ballLevel || "red";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
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
                  <Text style={styles.avatarText}>{player.name.charAt(0)}</Text>
                </View>
              </LinearGradient>
              <View style={[styles.levelBadgeOverlay, { backgroundColor: ballColor }]}>
                <Text style={styles.levelBadgeText}>{player.level}</Text>
              </View>
            </View>
            <Text style={styles.playerName}>{player.name}</Text>
            <Text style={styles.levelTitle}>{getLevelTitle(player.level)}</Text>
          </View>

          <View style={styles.badges}>
            <View style={[styles.ballBadge, { borderColor: ballColor }]}>
              <View style={[styles.ballDot, { backgroundColor: ballColor }]} />
              <Text style={[styles.ballText, { color: ballColor }]}>
                {ballLevel.charAt(0).toUpperCase() + ballLevel.slice(1)} Ball
              </Text>
            </View>
            <View style={styles.glowBadge}>
              <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
              <Text style={styles.glowText}>{player.glowScore} Glow</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statsGridCompact}>
            <StatItem 
              label="Streak" 
              value={`${player.streak} days`} 
              icon="flame" 
            />
            <StatItem 
              label="Sessions" 
              value={stats.sessionsAttended} 
              icon="tennisball" 
            />
          </View>
        </View>

        {coach ? (
          <View style={styles.coachCard}>
            <Text style={styles.sectionTitle}>Your Coach</Text>
            <View style={styles.coachInfo}>
              <View style={styles.coachAvatar}>
                <Text style={styles.coachAvatarText}>{coach.name.charAt(0)}</Text>
              </View>
              <View style={styles.coachDetails}>
                <Text style={styles.coachName}>{coach.name}</Text>
                {coach.email ? (
                  <Text style={styles.coachEmail}>{coach.email}</Text>
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
        ) : null}

        {academy ? (
          <View style={styles.academyCardPrimary}>
            <LinearGradient
              colors={["rgba(46, 204, 64, 0.1)", "rgba(0, 212, 255, 0.05)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.academyGradient}
            >
              <View style={styles.academyIcon}>
                <Ionicons name="tennisball" size={28} color={Colors.dark.primary} />
              </View>
              <Text style={styles.memberOfLabel}>Member of</Text>
              <Text style={styles.academyNameLarge}>{academy.name}</Text>
              <Text style={styles.memberSinceSmall}>Since {memberSince}</Text>
            </LinearGradient>
          </View>
        ) : null}

        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Settings</Text>
          
          <Pressable 
            style={styles.settingsItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (Platform.OS === "web") {
                window.alert("Notification settings are available in the Expo Go app on your device.");
              } else {
                Alert.alert(
                  "Notifications",
                  "Notification preferences can be managed in your device settings.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { 
                      text: "Open Settings", 
                      onPress: async () => {
                        try {
                          await Linking.openSettings();
                        } catch (e) {
                          // Settings not available
                        }
                      }
                    },
                  ]
                );
              }
            }}
          >
            <View style={styles.settingsIcon}>
              <Ionicons name="notifications-outline" size={20} color={Colors.dark.text} />
            </View>
            <Text style={styles.settingsLabel}>Notifications</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>

          <Pressable 
            style={styles.settingsItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (Platform.OS === "web") {
                window.alert("Need help? Contact us at support@glowupsports.com");
              } else {
                Alert.alert(
                  "Help & Support",
                  "For assistance, please contact us at support@glowupsports.com",
                  [
                    { text: "OK", style: "default" },
                  ]
                );
              }
            }}
          >
            <View style={styles.settingsIcon}>
              <Ionicons name="help-circle-outline" size={20} color={Colors.dark.text} />
            </View>
            <Text style={styles.settingsLabel}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>

          <Pressable 
            style={[styles.settingsItem, { opacity: 0.5 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (Platform.OS === "web") {
                window.alert("Parent/Payment Mode is coming soon!");
              } else {
                Alert.alert(
                  "Coming Soon",
                  "Parent/Payment Mode will be available in a future update. Stay tuned!",
                  [{ text: "OK", style: "default" }]
                );
              }
            }}
          >
            <View style={[styles.settingsIcon, { backgroundColor: "rgba(138, 43, 226, 0.15)" }]}>
              <Ionicons name="wallet-outline" size={20} color="#8A2BE2" />
            </View>
            <Text style={[styles.settingsLabel, { color: Colors.dark.textMuted }]}>
              Parent/Payment Mode (Coming Soon)
            </Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Discover</Text>
          
          <Pressable 
            style={styles.settingsItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("CoachDirectory");
            }}
          >
            <View style={[styles.settingsIcon, { backgroundColor: "rgba(0, 212, 255, 0.15)" }]}>
              <Ionicons name="people-outline" size={20} color={Colors.dark.xpCyan} />
            </View>
            <Text style={styles.settingsLabel}>Find Coaches</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>

          <Pressable 
            style={styles.settingsItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("AcademyBrowser");
            }}
          >
            <View style={[styles.settingsIcon, { backgroundColor: "rgba(46, 204, 64, 0.15)" }]}>
              <Ionicons name="school-outline" size={20} color={Colors.dark.primary} />
            </View>
            <Text style={styles.settingsLabel}>Browse Academies</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>

          <Pressable 
            style={styles.settingsItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("TransferRequest");
            }}
          >
            <View style={[styles.settingsIcon, { backgroundColor: "rgba(255, 165, 0, 0.15)" }]}>
              <Ionicons name="swap-horizontal-outline" size={20} color={Colors.dark.orange} />
            </View>
            <Text style={styles.settingsLabel}>Transfer Academy</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={Colors.dark.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
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
  header: {
    alignItems: "center",
    padding: Spacing.xl,
    paddingTop: Spacing["3xl"],
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
  statsGridCompact: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
  },
  academyCardPrimary: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(46, 204, 64, 0.2)",
  },
  academyGradient: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  academyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  memberOfLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  academyNameLarge: {
    ...Typography.h3,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: 4,
  },
  memberSinceSmall: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
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
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  logoutText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.error,
  },
});
