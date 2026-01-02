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
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;

interface PlayerIdentityDrawerProps {
  visible: boolean;
  onClose: () => void;
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

function getPlayerTitle(level: number, xp: number): string {
  if (level >= 30) return "Legend";
  if (level >= 25) return "Champion";
  if (level >= 20) return "Elite Competitor";
  if (level >= 15) return "Court Master";
  if (level >= 10) return "Rising Force";
  if (level >= 7) return "Contender";
  if (level >= 5) return "Challenger";
  if (level >= 3) return "Rising Player";
  if (level >= 2) return "New Challenger";
  return "Just Started";
}

function getLevelProgress(xp: number, level: number): number {
  const xpInCurrentLevel = xp % 100;
  return xpInCurrentLevel / 100;
}

export default function PlayerIdentityDrawer({ visible, onClose }: PlayerIdentityDrawerProps) {
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
          withTiming(1.08, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
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

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, drawerStyle, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={["#0D0D0D", "#151515", "#0A0A0A"]}
          style={styles.drawerGradient}
        >
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* ═══════════════════════════════════════════════════════════ */}
            {/* HERO IDENTITY SECTION - Top 30% */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <View style={styles.heroSection}>
              <Pressable 
                style={styles.characterCard}
                onPress={() => navigateAndClose("PlayerProfile")}
              >
                {/* Animated Glow Ring */}
                <Animated.View style={[styles.glowRingOuter, glowRingStyle]}>
                  <View style={styles.glowRingGradient}>
                    <Svg width={120} height={120} viewBox="0 0 120 120">
                      <Defs>
                        <SvgGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <Stop offset="0%" stopColor={Colors.dark.primary} stopOpacity="1" />
                          <Stop offset="50%" stopColor={Colors.dark.xpCyan} stopOpacity="1" />
                          <Stop offset="100%" stopColor={Colors.dark.primary} stopOpacity="1" />
                        </SvgGradient>
                      </Defs>
                      {/* Background ring */}
                      <Circle
                        cx="60"
                        cy="60"
                        r="54"
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth="6"
                        fill="none"
                      />
                      {/* Level progress ring */}
                      <Circle
                        cx="60"
                        cy="60"
                        r="54"
                        stroke="url(#ringGrad)"
                        strokeWidth="6"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={`${levelProgress * 339} 339`}
                        transform="rotate(-90 60 60)"
                      />
                    </Svg>
                    
                    {/* Avatar Center */}
                    <View style={styles.avatarCenter}>
                      <LinearGradient
                        colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault]}
                        style={styles.avatarGradient}
                      >
                        <Text style={styles.avatarInitial}>
                          {player?.name?.charAt(0)?.toUpperCase() || "P"}
                        </Text>
                      </LinearGradient>
                    </View>
                  </View>
                </Animated.View>

                {/* Level Badge - Prominent */}
                <View style={styles.levelBadge}>
                  <LinearGradient
                    colors={[Colors.dark.primary, "#1A9E2E"]}
                    style={styles.levelBadgeGradient}
                  >
                    <Text style={styles.levelNumber}>{level}</Text>
                  </LinearGradient>
                </View>
              </Pressable>

              {/* Player Name */}
              <Text style={styles.playerName}>{player?.name || "Player"}</Text>
              
              {/* Title - Motivating */}
              <View style={styles.titleBadge}>
                <Ionicons name="star" size={12} color={Colors.dark.gold} style={{ marginRight: 4 }} />
                <Text style={styles.titleText}>{getPlayerTitle(level, xp)}</Text>
              </View>

              {/* XP Progress - Subtle */}
              <View style={styles.xpRow}>
                <Text style={styles.xpLabel}>Next Level</Text>
                <View style={styles.xpBarWrapper}>
                  <View style={styles.xpBarBg}>
                    <LinearGradient
                      colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.xpBarFill, { width: `${levelProgress * 100}%` }]}
                    />
                  </View>
                </View>
                <Text style={styles.xpValue}>{Math.round(levelProgress * 100)}%</Text>
              </View>

              {/* Glow Sparks */}
              {glowScore > 0 ? (
                <View style={styles.glowSparkRow}>
                  {[...Array(Math.min(glowScore, 5))].map((_, i) => (
                    <Ionicons key={i} name="flash" size={14} color={Colors.dark.xpCyan} />
                  ))}
                  {glowScore > 5 ? (
                    <Text style={styles.glowMoreText}>+{glowScore - 5}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* HERO ACTIONS - 2 Primary Buttons */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <View style={styles.heroActions}>
              <Pressable
                style={({ pressed }) => [styles.heroButton, styles.heroButtonPrimary, pressed && styles.heroButtonPressed]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigateAndClose("CourtBooking");
                }}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, "#1A9E2E"]}
                  style={styles.heroButtonGradient}
                >
                  <Ionicons name="tennisball" size={24} color="#fff" />
                  <Text style={styles.heroButtonText}>Play Now</Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.heroButton, styles.heroButtonSecondary, pressed && styles.heroButtonPressed]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigateAndClose("PlayerFinder");
                }}
              >
                <View style={styles.heroButtonOutline}>
                  <Ionicons name="flash" size={22} color={Colors.dark.xpCyan} />
                  <Text style={styles.heroButtonTextSecondary}>Challenge</Text>
                </View>
              </Pressable>
            </View>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* SECONDARY NAVIGATION - Icon First, More Space */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <View style={styles.navSection}>
              <NavItem 
                icon="trophy" 
                label="My Matches" 
                color={Colors.dark.gold}
                onPress={() => navigateAndClose("MyCourtBookings")} 
              />
              <NavItem 
                icon="calendar" 
                label="Schedule" 
                color={Colors.dark.primary}
                onPress={() => { handleClose(); navigation.navigate("Schedule"); }} 
              />
              <NavItem 
                icon="location" 
                label="Nearby" 
                color={Colors.dark.xpCyan}
                onPress={() => navigateAndClose("PlayerFinder")} 
              />
              <NavItem 
                icon="flame" 
                label="Glow Rank" 
                color={Colors.dark.orange}
                onPress={() => navigateAndClose("GlowLeaderboard")} 
              />
            </View>

            <View style={styles.navSection}>
              <NavItem 
                icon="stats-chart" 
                label="Progress" 
                color={Colors.dark.xpCyan}
                onPress={() => { handleClose(); navigation.navigate("Progress"); }} 
              />
              <NavItem 
                icon="map" 
                label="Journey" 
                color={Colors.dark.primary}
                onPress={() => { handleClose(); navigation.navigate("Journey"); }} 
              />
              <NavItem 
                icon="school" 
                label="Training" 
                color={Colors.dark.gold}
                onPress={() => navigateAndClose("Training")} 
              />
              <NavItem 
                icon="chatbubbles" 
                label="Messages" 
                color={Colors.dark.primary}
                badge={unreadCount}
                onPress={() => navigateAndClose("PlayerMessages")} 
              />
            </View>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* SYSTEM - Minimal */}
            {/* ═══════════════════════════════════════════════════════════ */}
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

interface NavItemProps {
  icon: string;
  label: string;
  color: string;
  badge?: number;
  onPress: () => void;
}

function NavItem({ icon, label, color, badge, onPress }: NavItemProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={[styles.navIconCircle, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={20} color={color} />
        {badge && badge > 0 ? (
          <View style={styles.navBadge}>
            <Text style={styles.navBadgeText}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.navLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#0D0D0D",
    borderRightWidth: 1,
    borderRightColor: "rgba(46, 204, 64, 0.15)",
  },
  drawerGradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },

  /* ══════════════════════════════════════════════════════════════════ */
  /* HERO SECTION */
  /* ══════════════════════════════════════════════════════════════════ */
  heroSection: {
    alignItems: "center",
    paddingTop: Spacing["2xl"],
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  characterCard: {
    position: "relative",
    marginBottom: Spacing.md,
  },
  glowRingOuter: {
    width: 120,
    height: 120,
  },
  glowRingGradient: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarCenter: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    left: 12,
    top: 12,
  },
  avatarGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    fontSize: 38,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: -1,
  },
  levelBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#0D0D0D",
  },
  levelBadgeGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  levelNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
  },
  playerName: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  titleBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  titleText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.gold,
    letterSpacing: 0.3,
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 8,
  },
  xpLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    width: 60,
  },
  xpBarWrapper: {
    flex: 1,
  },
  xpBarBg: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  xpValue: {
    fontSize: 11,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
    width: 32,
    textAlign: "right",
  },
  glowSparkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: 2,
  },
  glowMoreText: {
    fontSize: 11,
    color: Colors.dark.xpCyan,
    marginLeft: 4,
    fontWeight: "600",
  },

  /* ══════════════════════════════════════════════════════════════════ */
  /* HERO ACTIONS */
  /* ══════════════════════════════════════════════════════════════════ */
  heroActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  heroButton: {
    flex: 1,
    height: 56,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  heroButtonPrimary: {},
  heroButtonSecondary: {
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  heroButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  heroButtonGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  heroButtonOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(0, 212, 255, 0.08)",
  },
  heroButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  heroButtonTextSecondary: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },

  /* ══════════════════════════════════════════════════════════════════ */
  /* NAVIGATION GRID */
  /* ══════════════════════════════════════════════════════════════════ */
  navSection: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  navItem: {
    width: "25%",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  navItemPressed: {
    opacity: 0.7,
  },
  navIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
    position: "relative",
  },
  navBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  navBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
  navLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: Colors.dark.textMuted,
    textAlign: "center",
  },

  /* ══════════════════════════════════════════════════════════════════ */
  /* SYSTEM SECTION */
  /* ══════════════════════════════════════════════════════════════════ */
  systemSection: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  systemItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
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
