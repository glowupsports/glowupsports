import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.85;

interface PlayerIdentityDrawerProps {
  visible: boolean;
  onClose: () => void;
  onNavigateToProfile?: () => void;
}

interface PlayerData {
  id: string;
  name: string;
  level: number;
  xp: number;
  glowScore: number;
  ballLevel: string | null;
  streak: number;
}

function getPlayerTitle(level: number): string {
  if (level >= 30) return "Legend";
  if (level >= 25) return "Champion";
  if (level >= 20) return "Elite Competitor";
  if (level >= 15) return "Rising Star";
  if (level >= 10) return "Rising Force";
  if (level >= 7) return "Contender";
  if (level >= 5) return "Challenger";
  if (level >= 3) return "Rising Player";
  if (level >= 2) return "New Challenger";
  return "Just Started";
}

function getXpForLevel(level: number): { current: number; required: number } {
  const xpPerLevel = 100;
  const currentLevelXp = (level - 1) * xpPerLevel;
  const nextLevelXp = level * xpPerLevel;
  return { current: currentLevelXp, required: nextLevelXp };
}

function getLevelProgress(xp: number, level: number): number {
  const xpInCurrentLevel = xp % 100;
  return xpInCurrentLevel / 100;
}

export default function PlayerIdentityDrawer({ visible, onClose, onNavigateToProfile }: PlayerIdentityDrawerProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { logout } = useAuth();
  
  const translateX = useSharedValue(-DRAWER_WIDTH);
  const backdropOpacity = useSharedValue(0);
  const glowPulse = useSharedValue(1);

  const { data: profileData } = useQuery<{ player: PlayerData }>({
    queryKey: ["/api/player/me/profile"],
  });

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/player/me/unread-count"],
  });

  useEffect(() => {
    if (visible) {
      translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
      backdropOpacity.value = withTiming(1, { duration: 250 });
      glowPulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      translateX.value = withSpring(-DRAWER_WIDTH, { damping: 20, stiffness: 200 });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: backdropOpacity.value > 0 ? "auto" : "none",
  }));

  const glowRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowPulse.value }],
  }));

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const navigateAndClose = (screen: string, params?: any) => {
    handleClose();
    setTimeout(() => {
      navigation.navigate(screen, params);
    }, 150);
  };

  const player = profileData?.player;
  const unreadCount = unreadData?.unreadCount || 0;
  const level = player?.level || 1;
  const xp = player?.xp || 0;
  const levelProgress = getLevelProgress(xp, level);
  const glowScore = player?.glowScore || 0;
  const streak = player?.streak || 0;
  
  const xpPerLevel = 100;
  const xpInCurrentLevel = xp % xpPerLevel;
  const xpNeededForNextLevel = xpPerLevel;
  const xpDisplay = `${xpInCurrentLevel} / ${xpNeededForNextLevel} XP`;

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, drawerStyle, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={["#0A0F0A", "#0D120D", "#080A08"]}
          style={styles.drawerGradient}
        >
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* ═══════════════════════════════════════════════════════════ */}
            {/* LAAG 1: PLAYER IDENTITY HEADER */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <View style={styles.identityHeader}>
              <View style={styles.identityRow}>
                <Pressable 
                  style={styles.avatarWrapper}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (onNavigateToProfile) {
                      onNavigateToProfile();
                    } else {
                      navigateAndClose("Profile");
                    }
                  }}
                >
                  <Animated.View style={[styles.glowRingOuter, glowRingStyle]}>
                    <Svg width={100} height={100} viewBox="0 0 100 100">
                      <Defs>
                        <SvgGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <Stop offset="0%" stopColor={Colors.dark.primary} stopOpacity="1" />
                          <Stop offset="50%" stopColor={Colors.dark.xpCyan} stopOpacity="0.8" />
                          <Stop offset="100%" stopColor={Colors.dark.primary} stopOpacity="1" />
                        </SvgGradient>
                      </Defs>
                      <Circle
                        cx="50"
                        cy="50"
                        r="46"
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth="5"
                        fill="none"
                      />
                      <Circle
                        cx="50"
                        cy="50"
                        r="46"
                        stroke="url(#ringGrad)"
                        strokeWidth="5"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={`${levelProgress * 289} 289`}
                        transform="rotate(-90 50 50)"
                      />
                    </Svg>
                    
                    <View style={styles.avatarInner}>
                      <LinearGradient
                        colors={["#1A2A1A", "#0D150D"]}
                        style={styles.avatarGradient}
                      >
                        <Text style={styles.avatarInitial}>
                          {player?.name?.charAt(0)?.toUpperCase() || "P"}
                        </Text>
                      </LinearGradient>
                    </View>
                  </Animated.View>

                  <View style={styles.levelBadge}>
                    <LinearGradient
                      colors={[Colors.dark.primary, "#1A8E2A"]}
                      style={styles.levelBadgeGradient}
                    >
                      <Text style={styles.levelNumber}>{level}</Text>
                    </LinearGradient>
                  </View>
                  
                  <View style={styles.editBadge}>
                    <Ionicons name="camera" size={12} color="#fff" />
                  </View>
                </Pressable>

                <View style={styles.identityInfo}>
                  <Text style={styles.playerName}>{player?.name || "Player"}</Text>
                  <Text style={styles.titleText}>{getPlayerTitle(level)}</Text>
                  
                  <View style={styles.levelXpRow}>
                    <Text style={styles.lvLabel}>LV {level}</Text>
                    <View style={styles.xpBarContainer}>
                      <View style={styles.xpBarBg}>
                        <LinearGradient
                          colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.xpBarFill, { width: `${levelProgress * 100}%` }]}
                        />
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.chipRow}>
                    {glowScore > 0 ? (
                      <View style={styles.glowChip}>
                        <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
                        <Text style={styles.glowChipText}>{glowScore}</Text>
                      </View>
                    ) : null}
                    {streak > 0 ? (
                      <View style={styles.streakChip}>
                        <Ionicons name="flame" size={12} color={Colors.dark.orange} />
                        <Text style={styles.streakChipText}>{streak}d</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* LAAG 2: PRIMARY HERO ACTIONS */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <View style={styles.heroActions}>
              <Pressable
                style={({ pressed }) => [styles.heroButtonPrimary, pressed && styles.heroButtonPressed]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigateAndClose("CourtBooking");
                }}
              >
                <LinearGradient
                  colors={["#22C55E", "#16A34A"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.heroButtonPrimaryGradient}
                >
                  <Ionicons name="tennisball" size={24} color="#fff" />
                  <Text style={styles.heroButtonPrimaryText}>Find Match</Text>
                  <View style={styles.heroArrow}>
                    <Ionicons name="chevron-forward" size={22} color="#fff" />
                  </View>
                </LinearGradient>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.heroButtonSecondary, pressed && styles.heroButtonPressed]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigateAndClose("PlayerFinder");
                }}
              >
                <View style={styles.heroButtonSecondaryInner}>
                  <Ionicons name="git-compare-outline" size={20} color={Colors.dark.orange} />
                  <Text style={styles.heroButtonSecondaryText}>Challenge Player</Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
                </View>
              </Pressable>
            </View>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* LAAG 3: PLAYER WORLD - SECTIES */}
            {/* ═══════════════════════════════════════════════════════════ */}
            
            {/* MY MATCHES Section */}
            <View style={styles.worldSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>MY MATCHES</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
              </View>
              
              <WorldMenuItem 
                icon="trophy"
                iconColor={Colors.dark.gold}
                title="My Matches"
                subtitle="Your games & challenges"
                onPress={() => navigateAndClose("MyCourtBookings")}
              />
              <WorldMenuItem 
                icon="calendar"
                iconColor={Colors.dark.primary}
                title="My Schedule"
                subtitle="Training & games timeline"
                onPress={() => { handleClose(); navigation.navigate("Schedule"); }}
              />
            </View>

            {/* SOCIAL WORLD Section */}
            <View style={styles.worldSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>SOCIAL WORLD</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
              </View>
              
              <WorldMenuItem 
                icon="location"
                iconColor={Colors.dark.xpCyan}
                title="Nearby Players"
                subtitle="12 players within 5km"
                onPress={() => navigateAndClose("PlayerFinder")}
              />
              <WorldMenuItem 
                icon="grid"
                iconColor={Colors.dark.primary}
                title="Public Courts"
                subtitle="Find courts near you"
                onPress={() => navigateAndClose("PublicCourts")}
              />
              <WorldMenuItem 
                icon="flame"
                iconColor={Colors.dark.orange}
                title="Glow Rank"
                subtitle="Based on activity & matches"
                onPress={() => navigateAndClose("GlowLeaderboard")}
              />
            </View>

            {/* MY PROGRESS Section */}
            <View style={styles.worldSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>MY PROGRESS</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
              </View>
              
              <WorldMenuItem 
                icon="person-circle"
                iconColor={Colors.dark.xpCyan}
                title="My Profile"
                subtitle="Edit photo, name & what others see"
                onPress={() => {
                  if (onNavigateToProfile) {
                    onNavigateToProfile();
                  } else {
                    navigateAndClose("Profile");
                  }
                }}
              />
              <WorldMenuItem 
                icon="bar-chart"
                iconColor={Colors.dark.primary}
                title="Progress Overview"
                subtitle="Technique, Mental, Physical"
                onPress={() => { handleClose(); navigation.navigate("Progress"); }}
              />
              <WorldMenuItem 
                icon="map"
                iconColor={Colors.dark.primary}
                title="My Journey"
                subtitle="Your tennis story"
                onPress={() => { handleClose(); navigation.navigate("Journey"); }}
              />
              <WorldMenuItem 
                icon="chatbubbles"
                iconColor={Colors.dark.primary}
                title="Messages"
                subtitle="Chat with coaches & players"
                badge={unreadCount}
                onPress={() => navigateAndClose("PlayerMessages")}
              />
            </View>

            {/* SYSTEM Section */}
            <View style={styles.systemSection}>
              <Pressable 
                style={styles.systemItem}
                onPress={() => navigateAndClose("Settings")}
              >
                <Ionicons name="settings-outline" size={18} color={Colors.dark.textMuted} />
                <Text style={styles.systemLabel}>Settings</Text>
              </Pressable>
              <View style={styles.systemDivider} />
              <Pressable 
                style={styles.systemItem}
                onPress={() => navigateAndClose("PlayerHelp")}
              >
                <Ionicons name="help-circle-outline" size={18} color={Colors.dark.textMuted} />
                <Text style={styles.systemLabel}>Help</Text>
              </Pressable>
              <View style={styles.systemDivider} />
              <Pressable 
                style={styles.systemItem}
                onPress={() => { handleClose(); logout(); }}
              >
                <Ionicons name="log-out-outline" size={18} color={Colors.dark.error} />
                <Text style={[styles.systemLabel, { color: Colors.dark.error }]}>Logout</Text>
              </Pressable>
            </View>
          </ScrollView>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

interface WorldMenuItemProps {
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  badge?: number;
  onPress: () => void;
}

function WorldMenuItem({ icon, iconColor, title, subtitle, badge, onPress }: WorldMenuItemProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={[styles.menuIconWrapper, { backgroundColor: iconColor + "15" }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
        {badge && badge > 0 ? (
          <View style={styles.menuBadge}>
            <Text style={styles.menuBadgeText}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.menuContent}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#0A0F0A",
    borderRightWidth: 1,
    borderRightColor: "rgba(46, 204, 64, 0.12)",
  },
  drawerGradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },

  /* ══════════════════════════════════════════════════════════════════ */
  /* LAAG 1: IDENTITY HEADER */
  /* ══════════════════════════════════════════════════════════════════ */
  identityHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  avatarWrapper: {
    position: "relative",
    marginRight: Spacing.md,
  },
  glowRingOuter: {
    width: 100,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInner: {
    position: "absolute",
    width: 82,
    height: 82,
    borderRadius: 41,
    overflow: "hidden",
    left: 9,
    top: 9,
  },
  avatarGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    fontSize: 34,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: -1,
  },
  levelBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#0A0F0A",
  },
  levelBadgeGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  levelNumber: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.dark.xpCyan,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0A0F0A",
  },
  identityInfo: {
    flex: 1,
    paddingTop: 4,
  },
  playerName: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  titleText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.orange,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  levelXpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  lvLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  xpBarContainer: {
    flex: 1,
  },
  xpBarBg: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 3,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  glowChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 212, 255, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  glowChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  streakChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 170, 0, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  streakChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.orange,
  },

  /* ══════════════════════════════════════════════════════════════════ */
  /* LAAG 2: HERO ACTIONS */
  /* ══════════════════════════════════════════════════════════════════ */
  heroActions: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  heroButtonPrimary: {
    height: 58,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  heroButtonSecondary: {
    height: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 170, 0, 0.2)",
    backgroundColor: "rgba(255, 170, 0, 0.05)",
  },
  heroButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  heroButtonPrimaryGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    gap: 14,
  },
  heroButtonPrimaryText: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  heroArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  heroButtonSecondaryInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    gap: 12,
  },
  heroButtonSecondaryText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },

  /* ══════════════════════════════════════════════════════════════════ */
  /* LAAG 3: WORLD SECTIONS */
  /* ══════════════════════════════════════════════════════════════════ */
  worldSection: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 1.2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    gap: 12,
  },
  menuItemPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  menuIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  menuBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  menuBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },

  /* ══════════════════════════════════════════════════════════════════ */
  /* SYSTEM SECTION */
  /* ══════════════════════════════════════════════════════════════════ */
  systemSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  systemItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  systemLabel: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  systemDivider: {
    width: 1,
    height: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
});
