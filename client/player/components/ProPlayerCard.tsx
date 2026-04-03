import React, { useState } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { View, Text, StyleSheet, Pressable, Platform, Image as RNImage } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
import { Spacing, BorderRadius, GlowColors, Backgrounds } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { formatCredits } from "@/lib/dateUtils";
import { usePlayerLevel } from "../hooks/usePlayerLevel";
import { useNavigation } from "@react-navigation/native";
import { LanguageHeaderButton } from "@/components/LanguageSelectorModal";
import { useTranslation } from "react-i18next";
import { HelpCenterModal } from "@/components/HelpCenterModal";
import type { FAQItem } from "@/components/HelpCenterModal";

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
  accessibilityLabel?: string;
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
  const track = useTrackFeature();
  const navigation = useNavigation<any>();
  const glowPulse = useSharedValue(0);
  const profilePhotoUri = buildPhotoUrl(player.profilePhotoUrl);
  const [showHelp, setShowHelp] = useState(false);

  const playerFAQs: FAQItem[] = [
    { question: t("player.home.faqBookSession"), answer: t("player.home.faqBookSessionAnswer"), category: "Booking" },
    { question: t("player.home.faqGlowScore"), answer: t("player.home.faqGlowScoreAnswer"), category: "Progress" },
    { question: t("player.home.faqEarnXp"), answer: t("player.home.faqEarnXpAnswer"), category: "Progress" },
    { question: t("player.home.faqCredits"), answer: t("player.home.faqCreditsAnswer"), category: "Billing" },
    { question: t("player.home.faqFindPlayers"), answer: t("player.home.faqFindPlayersAnswer"), category: "Social" },
    { question: t("player.home.faqBallLevel"), answer: t("player.home.faqBallLevelAnswer"), category: "Progress" },
  ];
  
  const { data: levelStatus } = usePlayerLevel(player.id);
  
  React.useEffect(() => {
    glowPulse.value = withRepeat(
      withTiming(1, { duration: 2500 }),
      -1,
      true
    );
  }, []);
  
  const currentLevel = levelStatus?.level ?? player.level;
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
    <View>
      <View style={styles.cardContainer}>
        <Animated.View style={[styles.cardGlow, glowRingStyle, { pointerEvents: "none" as const }]} />
        <View style={styles.container}>
          <View
            style={[styles.cardGradient, { backgroundColor: "#0F141B" }]}
          >
          <LinearGradient
            colors={[GlowColors.primary, GlowColors.soft, GlowColors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topAccentLine}
          />

          <View style={styles.cardContent}>
            <Pressable style={styles.avatarContainer} onPress={handleAvatarPress}>
              <Animated.View style={[styles.avatarOuterGlow, glowRingStyle]}>
                <LinearGradient
                  colors={[GlowColors.primary + "60", GlowColors.soft + "40", GlowColors.primary + "60"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarGlowGradient}
                />
              </Animated.View>

              <View style={styles.avatarFrame}>
                <LinearGradient
                  colors={[GlowColors.primary, GlowColors.soft]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarBorder}
                >
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
                    <View style={styles.avatarInner}>
                      <Text style={styles.avatarText}>{(player.name || "P").charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </LinearGradient>
              </View>

              <View style={styles.levelBadge}>
                <LinearGradient
                  colors={[GlowColors.primary, GlowColors.soft, GlowColors.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.levelBadgeGradient}
                >
                  <Text style={styles.levelBadgeText}>{currentLevel}</Text>
                </LinearGradient>
              </View>
            </Pressable>

            <View style={styles.identitySection}>
              <Text style={styles.roleLabel}>PLAYER</Text>
              <Text style={styles.playerName} numberOfLines={1}>{player.name || "Player"}</Text>
              <View style={styles.academyRow}>
                <Ionicons name="tennisball" size={12} color={GlowColors.primary} />
                <Text style={styles.academyText} numberOfLines={1}>
                  {academyName || "Free Player"}
                </Text>
              </View>

              <View style={styles.xpSection}>
                <View style={styles.xpBarTrack}>
                  <LinearGradient
                    colors={[GlowColors.primary, GlowColors.soft]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.xpBarFill, { width: `${Math.max(xpProgress * 100, 2)}%` }]}
                  />
                </View>
                <View style={styles.xpLabels}>
                  <Text style={styles.xpCurrent}>{xpInLevel} XP</Text>
                  <Text style={styles.xpRequired}>/ {xpNeeded}</Text>
                </View>
              </View>
            </View>

          </View>

          <View style={styles.cardDivider} />

          <View style={styles.cardBottomRow}>
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
              ]}>{formatCredits(credits?.total ?? 0)} {t("player.home.credits")}</Text>
            </Pressable>

            {player.streak > 0 ? (
              <Pressable style={styles.streakChip} onPress={() => track("home:streak")}>
                <Ionicons name="flame" size={14} color={player.streak >= 5 ? "#FF6B35" : GlowColors.primary} />
                <Text style={[styles.streakText, { color: player.streak >= 5 ? "#FF6B35" : GlowColors.primary }]}>
                  {player.streak}
                </Text>
              </Pressable>
            ) : null}

            <View style={{ flex: 1 }} />

            <LanguageHeaderButton />
            <Pressable
              style={styles.bottomActionBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowHelp(true);
              }}
            >
              <Ionicons name="help-circle-outline" size={18} color="rgba(255,255,255,0.5)" />
            </Pressable>
            {onNotificationPress ? (
              <Pressable
                style={styles.bottomActionBtn}
                onPress={onNotificationPress}
              >
                <Ionicons name="notifications" size={18} color="rgba(255,255,255,0.5)" />
                {unreadNotificationCount > 0 ? (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>
                      {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}

            {showSquadSwitch ? (
              <Pressable style={styles.familyChip} onPress={handleSquadPress}>
                <Ionicons name="people" size={14} color={GlowColors.primary} />
                <Text style={styles.familyChipText}>{t("player.home.family")}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        </View>
      </View>
      <HelpCenterModal
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        role="player"
        faqs={playerFAQs}
        glossary={[]}
        tutorials={[]}
        supportEmail="support@glowupsports.com"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    position: "relative",
    marginHorizontal: Spacing.md,
  },
  container: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  cardGlow: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: BorderRadius.lg + 2,
    borderWidth: 2,
    borderColor: GlowColors.primary,
    opacity: 0.5,
  },
  cardGradient: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: GlowColors.primary + "40",
    overflow: "hidden",
  },
  topAccentLine: {
    height: 3,
    width: "100%",
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  avatarContainer: {
    position: "relative",
    width: 70,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOuterGlow: {
    position: "absolute",
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: "hidden",
  },
  avatarGlowGradient: {
    width: "100%",
    height: "100%",
  },
  avatarFrame: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
  },
  avatarBorder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPhoto: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  avatarInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Backgrounds.root,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  levelBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    borderRadius: 10,
    overflow: "hidden",
  },
  levelBadgeGradient: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#000000",
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
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  academyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  academyText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#7C8290",
  },
  xpSection: {
    marginTop: 4,
    gap: 2,
  },
  xpBarTrack: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  xpLabels: {
    flexDirection: "row",
    gap: 4,
  },
  xpCurrent: {
    fontSize: 12,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  xpRequired: {
    fontSize: 11,
    color: "#7C8290",
    fontWeight: "500",
  },
  bottomActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#1a1a1a",
  },
  notifBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  cardDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    marginHorizontal: Spacing.md,
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  walletChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    gap: 5,
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
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  streakText: {
    fontSize: 13,
    fontWeight: "700",
  },
  familyChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(200, 255, 61, 0.10)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.20)",
    gap: 6,
  },
  familyChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 0.5,
  },
});
