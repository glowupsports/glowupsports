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
import { ProTennisColors, Spacing, BorderRadius, GlowColors, Backgrounds } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { getStaticAssetsUrl } from "@/lib/query-client";
import { usePlayerLevel } from "../hooks/usePlayerLevel";
import { useNavigation } from "@react-navigation/native";
import { LanguageHeaderButton } from "@/components/LanguageSelectorModal";
import { useTranslation } from "react-i18next";

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
  academyName?: string | null;
  onAvatarPress?: () => void;
  onWalletPress?: () => void;
  onSquadPress?: () => void;
  showSquadSwitch?: boolean;
  onNotificationPress?: () => void;
  unreadNotificationCount?: number;
}

function getPlayerTitle(level: number, streak: number, glowScore: number, t: (key: string) => string): string {
  if (level >= 15) return t("player.titles.eliteChampion");
  if (level >= 12) return t("player.titles.proPlayer");
  if (level >= 10) return t("player.titles.risingStar");
  if (level >= 7) return t("player.titles.courtWarrior");
  if (level >= 5) return t("player.titles.academyAce");
  if (level >= 3) return t("player.titles.tennisTalent");
  return t("player.titles.rookie");
}

export function ProPlayerCard({ 
  player, 
  credits, 
  academyName,
  onAvatarPress,
  onWalletPress,
  onSquadPress,
  showSquadSwitch = false,
  onNotificationPress,
  unreadNotificationCount = 0,
}: ProPlayerCardProps) {
  const { t } = useTranslation();
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
  const playerTitle = levelStatus?.title || getPlayerTitle(currentLevel, player.streak, player.glowScore, t);
  const xpInLevel = levelStatus?.xpInCurrentLevel ?? 0;
  const xpNeeded = levelStatus?.xpNeededForNextLevel ?? 100;
  const xpProgress = xpNeeded > 0 ? Math.min(xpInLevel / xpNeeded, 1) : 0;

  const glowRingStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      glowPulse.value,
      [0, 0.5, 1],
      [0.5, 0.8, 0.5],
      Extrapolation.CLAMP
    );
    return { opacity };
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
            colors={[Backgrounds.card + "F0", Backgrounds.root + "F8"]}
            style={StyleSheet.absoluteFill}
          />
        </BlurView>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Backgrounds.card + "F8" }]} />
      )}
      
      <View style={styles.cardContent}>
        <View style={styles.topRow}>
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
                  colors={[GlowColors.primary, GlowColors.soft]}
                  style={styles.avatarGradient}
                >
                  <View style={styles.avatarInner}>
                    <Text style={styles.avatarText}>{(player.name || "P").charAt(0).toUpperCase()}</Text>
                  </View>
                </LinearGradient>
              )}
              <View style={styles.levelBadgeOnAvatar}>
                <Text style={styles.levelBadgeText}>{currentLevel}</Text>
              </View>
            </View>
          </Pressable>

          <View style={styles.identitySection}>
            <Text style={styles.roleLabel}>PLAYER</Text>
            <Text style={styles.playerName} numberOfLines={1}>{player.name || "Player"}</Text>
            <View style={styles.subtitleRow}>
              <Ionicons name="tennisball" size={12} color={GlowColors.primary} />
              <Text style={styles.academyText} numberOfLines={1}>
                {academyName || "Free Player"}
              </Text>
            </View>
          </View>

          <View style={styles.iconsRow}>
            <LanguageHeaderButton />
            {onNotificationPress ? (
              <Pressable style={styles.iconBtn} onPress={onNotificationPress}>
                <Ionicons name="notifications" size={18} color="#B8BCC6" />
                {unreadNotificationCount > 0 ? (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>
                      {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.bottomSection}>
          <View style={styles.xpRow}>
            <Text style={styles.xpText}>
              <Text style={styles.xpValue}>{xpInLevel}</Text>
              <Text style={styles.xpDivider}> / {xpNeeded}</Text>
            </Text>
          </View>
          <View style={styles.xpBarTrack}>
            <LinearGradient
              colors={[GlowColors.primary, GlowColors.soft]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.xpBarFill, { width: `${Math.max(xpProgress * 100, 2)}%` }]}
            />
          </View>

          <View style={styles.statsRow}>
            <Pressable 
              style={[
                styles.walletChip,
                (credits?.total ?? 0) <= 0 && styles.walletChipDanger,
              ]} 
              onPress={handleWalletPress}
            >
              {(credits?.total ?? 0) <= 0 ? (
                <Ionicons name="alert-circle" size={14} color="#FF4D4D" />
              ) : null}
              <Ionicons 
                name="wallet-outline" 
                size={14} 
                color={(credits?.total ?? 0) <= 0 ? "#FF4D4D" : GlowColors.primary} 
              />
              <Text style={[
                styles.walletText,
                (credits?.total ?? 0) <= 0 && styles.walletTextDanger,
              ]}>{credits?.total ?? 0}</Text>
            </Pressable>

            {player.streak > 0 ? (
              <View style={styles.streakChip}>
                <Ionicons name="flame" size={14} color={player.streak >= 5 ? "#FF6B35" : GlowColors.primary} />
                <Text style={[styles.streakText, { color: player.streak >= 5 ? "#FF6B35" : GlowColors.primary }]}>
                  {player.streak}
                </Text>
              </View>
            ) : null}

            {showSquadSwitch ? (
              <Pressable style={styles.iconChip} onPress={handleSquadPress}>
                <Ionicons name="people-outline" size={14} color="#B8BCC6" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  avatarSection: {
    position: "relative",
  },
  avatarWrapper: {
    width: 60,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  glowRing: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: "rgba(200, 255, 61, 0.35)",
  },
  avatarPhoto: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  avatarGradient: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Backgrounds.root,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  levelBadgeOnAvatar: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Backgrounds.card,
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: Backgrounds.root,
  },
  identitySection: {
    flex: 1,
    gap: 2,
  },
  roleLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 1.5,
  },
  playerName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  academyText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#7C8290",
  },
  iconsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
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
    borderColor: Backgrounds.card,
  },
  bellBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  bottomSection: {
    gap: 6,
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  xpText: {
    fontSize: 13,
  },
  xpValue: {
    fontWeight: "700",
    color: GlowColors.primary,
    fontSize: 14,
  },
  xpDivider: {
    fontWeight: "500",
    color: "#7C8290",
    fontSize: 12,
  },
  xpBarTrack: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 2,
  },
  walletChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  walletChipDanger: {
    backgroundColor: "rgba(255, 77, 77, 0.12)",
  },
  walletText: {
    fontSize: 13,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  walletTextDanger: {
    color: "#FF4D4D",
  },
  streakChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  streakText: {
    fontSize: 13,
    fontWeight: "700",
  },
  iconChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
});
