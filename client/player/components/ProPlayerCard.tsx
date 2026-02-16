import React from "react";
import { View, Text, StyleSheet, Pressable, Platform, Image as RNImage } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { ProTennisColors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { getStaticAssetsUrl } from "@/lib/query-client";
import { usePlayerLevel } from "../hooks/usePlayerLevel";
import { useNavigation } from "@react-navigation/native";
import { SkillProgressRing } from "./SkillProgressRing";
import { InfoTooltip } from "@/components/InfoTooltip";

interface PlayerData {
  id: string;
  name: string;
  level: number;
  xp: number;
  glowScore: number;
  ballLevel: string | null;
  streak: number;
  profilePhotoUrl?: string | null;
}

interface Credits {
  total: number;
  group: number;
  private: number;
  semi_private: number;
}

interface ProPlayerCardProps {
  player: PlayerData;
  credits?: Credits | null;
  onAvatarPress?: () => void;
  onWalletPress?: () => void;
  onSquadPress?: () => void;
  showSquadSwitch?: boolean;
  onNotificationPress?: () => void;
  unreadNotificationCount?: number;
}

function getPlayerTitle(level: number, streak: number, glowScore: number): string {
  if (level >= 15) return "ELITE CHAMPION";
  if (level >= 12) return "PRO PLAYER";
  if (level >= 10) return "RISING STAR";
  if (level >= 7) return "COURT WARRIOR";
  if (level >= 5) return "ACADEMY ACE";
  if (level >= 3) return "TENNIS TALENT";
  return "ROOKIE";
}

export function ProPlayerCard({ 
  player, 
  credits, 
  onAvatarPress,
  onWalletPress,
  onSquadPress,
  showSquadSwitch = false,
  onNotificationPress,
  unreadNotificationCount = 0,
}: ProPlayerCardProps) {
  const navigation = useNavigation<any>();
  const glowPulse = useSharedValue(0);
  const profilePhotoUri = player.profilePhotoUrl ? `${getStaticAssetsUrl()}${player.profilePhotoUrl}` : null;
  
  const { data: levelStatus } = usePlayerLevel(player.id);
  
  React.useEffect(() => {
    glowPulse.value = withRepeat(
      withTiming(1, { duration: 2500 }),
      -1,
      true
    );
  }, []);
  
  const currentLevel = levelStatus?.level ?? player.level;
  const playerTitle = levelStatus?.title || getPlayerTitle(currentLevel, player.streak, player.glowScore);
  const xpInLevel = levelStatus?.xpInCurrentLevel ?? 0;
  const xpNeeded = levelStatus?.xpNeededForNextLevel ?? 100;
  const xpProgress = xpNeeded > 0 ? Math.min(xpInLevel / xpNeeded, 1) : 0;
  
  const glowIntensity = Math.min(1, player.streak / 7);
  
  const glowRingStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      glowPulse.value,
      [0, 1],
      [1, 1.08],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      glowPulse.value,
      [0, 0.5, 1],
      [0.4 + glowIntensity * 0.3, 0.7 + glowIntensity * 0.2, 0.4 + glowIntensity * 0.3],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const handleAvatarPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onAvatarPress) {
      onAvatarPress();
    } else {
      navigation.navigate("PlayerProfile");
    }
  };

  const handleWalletPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onWalletPress) {
      onWalletPress();
    }
  };

  const handleSquadPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onSquadPress) {
      onSquadPress();
    } else {
      navigation.navigate("FamilyLobby");
    }
  };

  return (
    <View style={styles.container}>
      {Platform.OS === "ios" ? (
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={[ProTennisColors.surfaceDark + "E0", ProTennisColors.midnightBlue + "F0"]}
            style={StyleSheet.absoluteFill}
          />
        </BlurView>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: ProTennisColors.surfaceDark + "F5" }]} />
      )}
      
      <View style={styles.cardContent}>
        <Pressable style={styles.avatarSection} onPress={handleAvatarPress}>
          <View style={styles.avatarWrapper}>
            <Animated.View style={[styles.glowRing, glowRingStyle]} />
            {profilePhotoUri ? (
              Platform.OS === 'web' ? (
                <RNImage
                  source={{ uri: profilePhotoUri }}
                  style={styles.avatarPhoto}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={{ uri: profilePhotoUri }}
                  style={styles.avatarPhoto}
                  contentFit="cover"
                />
              )
            ) : (
              <LinearGradient
                colors={ProTennisColors.gradientElectric as [string, string]}
                style={styles.avatarGradient}
              >
                <View style={styles.avatarInner}>
                  <Text style={styles.avatarText}>{(player.name || "P").charAt(0).toUpperCase()}</Text>
                </View>
              </LinearGradient>
            )}
            {player.streak >= 3 && (
              <View style={styles.streakBadge}>
                <Ionicons name="flame" size={12} color={ProTennisColors.electricGreen} />
              </View>
            )}
          </View>
        </Pressable>

        <View style={styles.statsSection}>
          <Text style={styles.playerName}>{(player.name || "PLAYER").toUpperCase()}</Text>
          <View style={styles.titleRow}>
            <View style={styles.titleBadge}>
              <Text style={styles.titleText}>{playerTitle}</Text>
            </View>
            <SkillProgressRing
              currentXp={xpInLevel}
              xpForNextLevel={xpNeeded}
              level={currentLevel}
              size={36}
              strokeWidth={3}
            />
          </View>
          
          <View style={styles.formBarContainer}>
            <View style={styles.formLabelRow}>
              <Text style={styles.formLabelLeft}>FORM</Text>
              <InfoTooltip 
                title="Your Glow Score" 
                description="Your Glow Score reflects your overall tennis development. It combines your session attendance, skill assessments from coaches, match performance, and engagement with the platform. Keep attending sessions and getting coach feedback to boost it!"
                size={14}
              />
              <View style={styles.signalBars}>
                {[1, 2, 3, 4, 5].map((bar) => (
                  <View
                    key={bar}
                    style={[
                      styles.signalBar,
                      { height: 4 + bar * 2 },
                      player.streak >= bar ? styles.signalBarActive : styles.signalBarInactive,
                    ]}
                  />
                ))}
              </View>
            </View>
            <View style={styles.formBarTrack}>
              <Animated.View 
                style={[
                  styles.formBarFill, 
                  { width: `${xpProgress * 100}%` }
                ]} 
              />
            </View>
            <Text style={styles.formLabel}>{xpInLevel}/{xpNeeded} XP</Text>
          </View>
        </View>

        <View style={styles.lockerSection}>
          {onNotificationPress ? (
            <Pressable style={styles.notificationBtn} onPress={onNotificationPress}>
              <Ionicons name="notifications" size={18} color={ProTennisColors.neonCyan} />
              {unreadNotificationCount > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          <Pressable 
            style={[
              styles.walletButton,
              (credits?.total ?? 0) <= 0 && styles.walletButtonDanger,
            ]} 
            onPress={handleWalletPress}
          >
            {(credits?.total ?? 0) <= 0 && (
              <Ionicons name="alert-circle" size={16} color="#DC2626" />
            )}
            <Ionicons 
              name="wallet-outline" 
              size={18} 
              color={(credits?.total ?? 0) <= 0 ? "#DC2626" : ProTennisColors.electricGreen} 
            />
            <Text style={[
              styles.walletText,
              (credits?.total ?? 0) <= 0 && styles.walletTextDanger,
            ]}>{credits?.total ?? 0}</Text>
          </Pressable>
          
          {showSquadSwitch ? (
            <Pressable style={styles.squadButton} onPress={handleSquadPress}>
              <Ionicons name="people-outline" size={18} color={ProTennisColors.neonCyan} />
            </Pressable>
          ) : null}
        </View>
      </View>
      
      <View style={styles.bottomBorder} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  avatarSection: {
    position: "relative",
  },
  avatarWrapper: {
    width: 72,
    height: 72,
    justifyContent: "center",
    alignItems: "center",
  },
  glowRing: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: ProTennisColors.electricGreen,
    shadowColor: ProTennisColors.electricGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  avatarPhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: ProTennisColors.surfaceElevated,
  },
  avatarGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: ProTennisColors.midnightBlue,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: ProTennisColors.electricGreen,
  },
  streakBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ProTennisColors.surfaceDark,
    borderWidth: 2,
    borderColor: ProTennisColors.electricGreen,
    justifyContent: "center",
    alignItems: "center",
  },
  statsSection: {
    flex: 1,
    gap: 4,
  },
  playerName: {
    fontSize: 18,
    fontWeight: "800",
    color: ProTennisColors.white,
    letterSpacing: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  titleBadge: {
    backgroundColor: ProTennisColors.electricGreen + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: ProTennisColors.electricGreen + "40",
  },
  titleText: {
    fontSize: 10,
    fontWeight: "600",
    color: ProTennisColors.electricGreen,
    letterSpacing: 0.5,
  },
  levelBadge: {
    backgroundColor: ProTennisColors.neonCyan + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  levelText: {
    fontSize: 10,
    fontWeight: "700",
    color: ProTennisColors.neonCyan,
  },
  formBarContainer: {
    marginTop: 4,
    gap: 3,
  },
  formLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  formLabelLeft: {
    fontSize: 8,
    fontWeight: "700",
    color: ProTennisColors.textMuted,
    letterSpacing: 1,
  },
  signalBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  signalBar: {
    width: 4,
    borderRadius: 1,
  },
  signalBarActive: {
    backgroundColor: ProTennisColors.electricGreen,
  },
  signalBarInactive: {
    backgroundColor: ProTennisColors.surfaceElevated,
  },
  formBarTrack: {
    height: 6,
    backgroundColor: ProTennisColors.formBarBackground,
    borderRadius: 3,
    overflow: "hidden",
  },
  formBarFill: {
    height: "100%",
    backgroundColor: ProTennisColors.electricGreen,
    borderRadius: 3,
    shadowColor: ProTennisColors.electricGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  formLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: ProTennisColors.textMuted,
    textAlign: "right",
  },
  lockerSection: {
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  walletButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ProTennisColors.surfaceElevated,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  walletText: {
    fontSize: 14,
    fontWeight: "700",
    color: ProTennisColors.electricGreen,
  },
  walletButtonDanger: {
    backgroundColor: "rgba(220, 38, 38, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.4)",
  },
  walletTextDanger: {
    color: "#DC2626",
  },
  squadButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ProTennisColors.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: ProTennisColors.neonCyan + "40",
  },
  notificationBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ProTennisColors.neonCyan + "15",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: ProTennisColors.neonCyan + "30",
  },
  bellBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: ProTennisColors.surfaceDark,
  },
  bellBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  bottomBorder: {
    height: 2,
    backgroundColor: ProTennisColors.electricGreen,
    opacity: 0.3,
  },
});
