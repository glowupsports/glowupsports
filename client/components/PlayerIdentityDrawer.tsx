import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.75;

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

interface MenuItem {
  icon: string;
  label: string;
  onPress: () => void;
  badge?: number;
  color?: string;
}

function getLevelTitle(level: number): string {
  if (level < 5) return "Beginner";
  if (level < 10) return "Rising Star";
  if (level < 15) return "Intermediate";
  if (level < 20) return "Advanced";
  if (level < 30) return "Expert";
  return "Champion";
}

function getXpForLevel(level: number): number {
  return level * 100;
}

export default function PlayerIdentityDrawer({ visible, onClose }: PlayerIdentityDrawerProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { logout } = useAuth();
  
  const translateX = useSharedValue(-DRAWER_WIDTH);
  const backdropOpacity = useSharedValue(0);

  const { data: profileData } = useQuery<{ player: PlayerData }>({
    queryKey: ["/api/player/me/profile"],
  });

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/player/me/unread-count"],
  });

  useEffect(() => {
    if (visible) {
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
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

  const xpProgress = player ? (player.xp % 100) / 100 : 0;
  const xpNeeded = player ? getXpForLevel(player.level + 1) : 100;

  const playActions: MenuItem[] = [
    { icon: "people", label: "Find Players", onPress: () => navigateAndClose("PlayerFinder") },
    { icon: "tennisball", label: "Find a Match", onPress: () => navigateAndClose("CourtBooking") },
    { icon: "trophy", label: "My Matches", onPress: () => navigateAndClose("MyCourtBookings") },
    { icon: "calendar", label: "My Schedule", onPress: () => { handleClose(); navigation.navigate("Schedule"); } },
  ];

  const socialActions: MenuItem[] = [
    { icon: "location", label: "Players Nearby", onPress: () => navigateAndClose("PlayerFinder"), color: Colors.dark.xpCyan },
    { icon: "flame", label: "Glow Rank", onPress: () => navigateAndClose("GlowLeaderboard"), color: Colors.dark.gold },
    { icon: "business", label: "Public Courts", onPress: () => navigateAndClose("CourtBooking") },
  ];

  const progressActions: MenuItem[] = [
    { icon: "stats-chart", label: "Progress Overview", onPress: () => { handleClose(); navigation.navigate("Progress"); } },
    { icon: "map", label: "My Journey", onPress: () => { handleClose(); navigation.navigate("Journey"); } },
    { icon: "school", label: "Training", onPress: () => navigateAndClose("Training") },
  ];

  const commActions: MenuItem[] = [
    { icon: "chatbubbles", label: "Messages", onPress: () => navigateAndClose("PlayerMessages"), badge: unreadCount },
    { icon: "notifications", label: "Notifications", onPress: () => navigateAndClose("PlayerNotifications") },
  ];

  const systemActions: MenuItem[] = [
    { icon: "settings-outline", label: "Settings", onPress: () => navigateAndClose("Settings") },
    { icon: "help-circle-outline", label: "Help", onPress: () => navigateAndClose("PlayerHelp") },
    { icon: "log-out-outline", label: "Logout", onPress: () => { handleClose(); logout(); } },
  ];

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, drawerStyle, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, "rgba(10, 10, 10, 0.98)"]}
          style={styles.drawerGradient}
        >
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Player Core Zone */}
            <View style={styles.playerCore}>
              <Pressable 
                style={styles.avatarContainer}
                onPress={() => navigateAndClose("Profile")}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                  style={styles.glowRing}
                >
                  <View style={styles.avatarInner}>
                    <Text style={styles.avatarText}>
                      {player?.name?.charAt(0) || "?"}
                    </Text>
                  </View>
                </LinearGradient>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>{player?.level || 1}</Text>
                </View>
              </Pressable>

              <Text style={styles.playerName}>{player?.name || "Player"}</Text>
              <Text style={styles.playerTitle}>{getLevelTitle(player?.level || 1)}</Text>

              {/* Mini XP Bar */}
              <View style={styles.xpBarContainer}>
                <View style={styles.xpBarBg}>
                  <LinearGradient
                    colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.xpBarFill, { width: `${xpProgress * 100}%` }]}
                  />
                </View>
                <Text style={styles.xpText}>
                  {player?.xp ? player.xp % 100 : 0} / 100 XP
                </Text>
              </View>

              {/* Glow Score */}
              <View style={styles.glowScoreRow}>
                <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
                <Text style={styles.glowScoreText}>{player?.glowScore || 0} Glow</Text>
              </View>
            </View>

            {/* Play & Match Zone */}
            <View style={styles.menuSection}>
              <Text style={styles.sectionLabel}>Play & Match</Text>
              {playActions.map((item) => (
                <MenuItem key={item.label} item={item} />
              ))}
            </View>

            {/* Social World Zone */}
            <View style={styles.menuSection}>
              <Text style={styles.sectionLabel}>Social World</Text>
              {socialActions.map((item) => (
                <MenuItem key={item.label} item={item} />
              ))}
            </View>

            {/* My Progress Zone */}
            <View style={styles.menuSection}>
              <Text style={styles.sectionLabel}>My Progress</Text>
              {progressActions.map((item) => (
                <MenuItem key={item.label} item={item} />
              ))}
            </View>

            {/* Communication Zone */}
            <View style={styles.menuSection}>
              <Text style={styles.sectionLabel}>Communication</Text>
              {commActions.map((item) => (
                <MenuItem key={item.label} item={item} />
              ))}
            </View>

            {/* System Zone */}
            <View style={[styles.menuSection, styles.systemSection]}>
              {systemActions.map((item) => (
                <MenuItem key={item.label} item={item} isSystem />
              ))}
            </View>
          </ScrollView>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

function MenuItem({ item, isSystem }: { item: MenuItem; isSystem?: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuItem,
        isSystem && styles.menuItemSystem,
        pressed && styles.menuItemPressed,
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        item.onPress();
      }}
    >
      <View style={[styles.menuIconContainer, item.color && { backgroundColor: item.color + "20" }]}>
        <Ionicons 
          name={item.icon as any} 
          size={20} 
          color={item.color || (isSystem ? Colors.dark.textMuted : Colors.dark.primary)} 
        />
      </View>
      <Text style={[styles.menuLabel, isSystem && styles.menuLabelSystem]}>
        {item.label}
      </Text>
      {item.badge && item.badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.badge}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.08)",
  },
  drawerGradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  playerCore: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  avatarContainer: {
    position: "relative",
    marginBottom: Spacing.md,
  },
  glowRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    padding: 3,
  },
  avatarInner: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 41,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  levelBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  levelBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  playerName: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: 2,
  },
  playerTitle: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.md,
  },
  xpBarContainer: {
    width: "100%",
    marginBottom: Spacing.sm,
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
  xpText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  glowScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  glowScoreText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  menuSection: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  sectionLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  systemSection: {
    borderBottomWidth: 0,
    marginTop: Spacing.md,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: 2,
  },
  menuItemSystem: {
    opacity: 0.7,
  },
  menuItemPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(46, 204, 64, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  menuLabel: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
  },
  menuLabelSystem: {
    color: Colors.dark.textMuted,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    marginRight: Spacing.sm,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
});
