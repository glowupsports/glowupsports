import React, { useState, useContext, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Platform, Image as RNImage } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  interpolate,
  Extrapolation,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography, ProTennisColors } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { usePlayerLevel } from "../hooks/usePlayerLevel";

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

interface CoachData {
  id: string;
  name: string;
  avatar?: string | null;
  yearsExperience?: number;
  philosophyTags?: string[];
  publicQuote?: string | null;
  bioApproved?: boolean;
}

interface LastFeedback {
  message: string;
  date: string;
  coachName: string;
}

interface PlayerStatusBarProps {
  player: PlayerData;
  coach: CoachData | null;
  lastFeedback?: LastFeedback | null;
  onAvatarPress?: () => void;
}

function getEarnedTitle(player: PlayerData): string {
  if (player.streak >= 14) return "Consistency Champion";
  if (player.streak >= 7) return "Consistency Builder";
  if (player.glowScore >= 90) return "Rising Star";
  if (player.glowScore >= 70) return "Match Warrior";
  if (player.level >= 10) return "Academy Challenger";
  if (player.level >= 5) return "Focus Seeker";
  if (player.streak >= 3) return "Momentum Builder";
  return "Tennis Explorer";
}

function getCurrentFocus(lastFeedback: LastFeedback | null | undefined): string | null {
  if (!lastFeedback) return null;
  const message = lastFeedback.message.toLowerCase();
  if (message.includes("footwork")) return "Footwork";
  if (message.includes("serve")) return "Serve Technique";
  if (message.includes("backhand")) return "Backhand";
  if (message.includes("forehand")) return "Forehand";
  if (message.includes("mental") || message.includes("focus")) return "Mental Game";
  if (message.includes("strategy") || message.includes("tactical")) return "Match Strategy";
  if (message.includes("consistency")) return "Consistency";
  if (message.includes("power")) return "Power Development";
  if (message.includes("net") || message.includes("volley")) return "Net Play";
  return null;
}

function getBallLevelColor(ballLevel: string | null): string {
  if (!ballLevel) return Colors.dark.textMuted;
  const level = ballLevel.toLowerCase();
  if (level.includes("blue")) return "#3B82F6";
  if (level.includes("red")) return "#EF4444";
  if (level.includes("orange")) return "#F97316";
  if (level.includes("green")) return "#22C55E";
  if (level.includes("yellow")) return "#EAB308";
  if (level.includes("adult") || level.includes("glow")) return "#00E5FF";
  return Colors.dark.primary;
}

function getXpProgress(level: number, xp: number): number {
  const xpPerLevel = 500 + (level - 1) * 100;
  let accumulatedXp = 0;
  for (let lvl = 1; lvl < level; lvl++) {
    accumulatedXp += 500 + (lvl - 1) * 100;
  }
  const currentLevelXp = Math.max(0, xp - accumulatedXp);
  return Math.min(currentLevelXp / xpPerLevel, 1);
}

export function PlayerStatusBar({ player, coach, lastFeedback, onAvatarPress }: PlayerStatusBarProps) {
  const [showCoachModal, setShowCoachModal] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const glowPulse = useSharedValue(0);
  const shimmerPosition = useSharedValue(-1);
  const profilePhotoUri = buildPhotoUrl(player.profilePhotoUrl) || null;
  
  const { data: levelStatus } = usePlayerLevel(player.id);
  
  useEffect(() => {
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    
    shimmerPosition.value = withRepeat(
      withTiming(2, { duration: 2500, easing: Easing.linear }),
      -1,
      false
    );
    
    return () => {
      cancelAnimation(glowPulse);
      cancelAnimation(shimmerPosition);
    };
  }, [glowPulse, shimmerPosition]);
  
  const earnedTitle = levelStatus?.title || getEarnedTitle(player);
  const currentFocus = getCurrentFocus(lastFeedback);
  const ballLevelColor = getBallLevelColor(player.ballLevel);
  
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
    return {
      opacity,
    };
  });

  const shimmerStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      shimmerPosition.value,
      [-1, 0, 1, 2],
      [-50, 0, 100, 150],
      Extrapolation.CLAMP
    );
    const shimmerOpacity = interpolate(
      shimmerPosition.value,
      [-1, 0, 0.5, 1, 2],
      [0, 0.3, 0.6, 0.3, 0],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ translateX }],
      opacity: shimmerOpacity,
    };
  });
  
  const handleCoachPress = () => {
    if (coach) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setShowCoachModal(true);
    }
  };

  const handleAvatarPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onAvatarPress) {
      onAvatarPress();
    } else {
      setShowPlayerModal(true);
    }
  };

  const streakColor = player.streak >= 6 ? "#FF4136" : player.streak >= 3 ? Colors.dark.orange : Colors.dark.xpCyan;

  return (
    <View style={styles.container}>
      <View style={styles.mainRow}>
        <Pressable 
          style={styles.avatarSection}
          onPress={handleAvatarPress}
        >
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
                colors={[Colors.dark.primary, "#A8E063"]}
                style={styles.avatarGradient}
              >
                <View style={styles.avatarInner}>
                  <Text style={styles.avatarText}>{(player.name || "P").charAt(0)}</Text>
                </View>
              </LinearGradient>
            )}
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>{player.level}</Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.infoSection}>
          <View style={styles.nameRow}>
            <Text style={styles.playerName} numberOfLines={1}>{player.name || "Player"}</Text>
          </View>
          <View style={styles.titleRow}>
            <Ionicons name="ribbon-outline" size={12} color={Colors.dark.textMuted} />
            <Text style={styles.earnedTitle}>{earnedTitle}</Text>
          </View>
          
          <View style={styles.xpBarContainer}>
            <View style={styles.xpBarTrackGaming}>
              {xpProgress > 0.02 ? (
                <View
                  style={[styles.xpBarFillGaming, { 
                    width: `${Math.max(xpProgress * 100, 5)}%`,
                    backgroundColor: Colors.dark.primary,
                    borderRadius: 3,
                  }]}
                />
              ) : (
                <View style={[styles.xpBarFillMinimal, { width: 4 }]} />
              )}
            </View>
            <View style={styles.xpLabelsGaming}>
              <View style={styles.levelBadgeGaming}>
                <Text style={styles.xpLevelLabelGaming}>LVL {currentLevel}</Text>
              </View>
              <Text style={styles.xpValueLabelGaming}>{xpInLevel}/{xpNeeded} XP</Text>
            </View>
          </View>
        </View>

        <View style={styles.streakSection}>
          <View style={[styles.streakBadge, { borderColor: streakColor }]}>
            <Ionicons name="flame" size={20} color={streakColor} />
            <Text style={[styles.streakValue, { color: streakColor }]}>{player.streak}</Text>
          </View>
          <Text style={styles.streakLabel}>streak</Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        {coach ? (
          <Pressable style={styles.coachChip} onPress={handleCoachPress}>
            <View style={styles.coachAvatar}>
              <Ionicons name="person" size={10} color={Colors.dark.primary} />
            </View>
            <Text style={styles.coachName}>{coach.name}</Text>
            <Ionicons name="chevron-forward" size={12} color={Colors.dark.textMuted} />
          </Pressable>
        ) : null}
        {currentFocus ? (
          <View style={styles.focusChip}>
            <Ionicons name="locate" size={12} color={Colors.dark.primary} />
            <Text style={styles.focusText}>{currentFocus}</Text>
          </View>
        ) : null}
      </View>

      <Modal
        visible={showCoachModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCoachModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable 
            style={styles.modalBackdrop}
            onPress={() => setShowCoachModal(false)}
          />
          <View style={styles.coachCard}>
            <View style={styles.coachHeader}>
              <View style={styles.coachAvatarLarge}>
                <Ionicons name="ribbon" size={24} color={Colors.dark.primary} />
              </View>
              <View style={styles.coachInfo}>
                <Text style={styles.coachNameLarge}>{coach?.name}</Text>
                {coach?.yearsExperience ? (
                  <Text style={styles.coachExperience}>
                    {coach.yearsExperience}+ years experience
                  </Text>
                ) : null}
              </View>
            </View>
            
            {coach?.philosophyTags && coach.philosophyTags.length > 0 ? (
              <View style={styles.philosophyRow}>
                {coach.philosophyTags.slice(0, 3).map((tag, idx) => (
                  <View key={idx} style={styles.philosophyTag}>
                    <Text style={styles.philosophyTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            
            {coach?.publicQuote ? (
              <View style={styles.quoteSection}>
                <Ionicons name="chatbubble-outline" size={14} color={Colors.dark.textMuted} />
                <Text style={styles.quoteText}>"{coach.publicQuote}"</Text>
              </View>
            ) : null}
            
            {lastFeedback ? (
              <View style={styles.lastFeedbackSection}>
                <Text style={styles.lastFeedbackLabel}>Latest Feedback</Text>
                <Text style={styles.lastFeedbackText} numberOfLines={3}>
                  "{lastFeedback.message}"
                </Text>
                <Text style={styles.lastFeedbackDate}>
                  {new Date(lastFeedback.date).toLocaleDateString()}
                </Text>
              </View>
            ) : null}
            
            <Pressable 
              style={styles.closeButton}
              onPress={() => setShowCoachModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPlayerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPlayerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable 
            style={styles.modalBackdrop}
            onPress={() => setShowPlayerModal(false)}
          />
          <View style={styles.playerCard}>
            <View style={styles.playerModalHeader}>
              {profilePhotoUri ? (
                Platform.OS === 'web' ? (
                  <RNImage
                    source={{ uri: profilePhotoUri }}
                    style={styles.playerAvatarPhotoLarge}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={{ uri: profilePhotoUri }}
                    style={styles.playerAvatarPhotoLarge}
                    contentFit="cover"
                  />
                )
              ) : (
                <LinearGradient
                  colors={[Colors.dark.primary, "#A8E063"]}
                  style={styles.playerAvatarLarge}
                >
                  <View style={styles.playerAvatarInner}>
                    <Text style={styles.playerAvatarText}>{(player.name || "P").charAt(0)}</Text>
                  </View>
                </LinearGradient>
              )}
              <Text style={styles.playerModalName}>{player.name || "Player"}</Text>
              <View style={styles.titleBadge}>
                <Ionicons name="ribbon-outline" size={14} color={Colors.dark.textMuted} />
                <Text style={styles.titleBadgeText}>{earnedTitle}</Text>
              </View>
            </View>

            <View style={styles.playerStatsGrid}>
              <View style={styles.playerStatBox}>
                <Ionicons name="star" size={20} color={Colors.dark.gold} />
                <Text style={styles.playerStatValue}>Level {player.level}</Text>
                <Text style={styles.playerStatLabel}>Progress</Text>
              </View>
              <View style={styles.playerStatBox}>
                <Ionicons name="flash" size={20} color={Colors.dark.primary} />
                <Text style={styles.playerStatValue}>{player.glowScore}</Text>
                <Text style={styles.playerStatLabel}>Glow Score</Text>
              </View>
              <View style={styles.playerStatBox}>
                <Ionicons name="flame" size={20} color={Colors.dark.orange} />
                <Text style={styles.playerStatValue}>{player.streak}</Text>
                <Text style={styles.playerStatLabel}>Day Streak</Text>
              </View>
              <View style={styles.playerStatBox}>
                <Ionicons name="trending-up" size={20} color={Colors.dark.primary} />
                <Text style={styles.playerStatValue}>{player.xp.toLocaleString()}</Text>
                <Text style={styles.playerStatLabel}>Total XP</Text>
              </View>
            </View>

            {player.ballLevel ? (
              <View style={styles.ballLevelSection}>
                <Ionicons name="tennisball" size={18} color={ballLevelColor} />
                <Text style={[styles.ballLevelText, { color: ballLevelColor }]}>
                  {player.ballLevel} Ball Level
                </Text>
              </View>
            ) : null}

            {currentFocus ? (
              <View style={styles.focusSection}>
                <Text style={styles.focusSectionLabel}>Current Focus</Text>
                <View style={styles.focusSectionChip}>
                  <Ionicons name="locate" size={16} color={Colors.dark.primary} />
                  <Text style={styles.focusSectionText}>{currentFocus}</Text>
                </View>
              </View>
            ) : null}

            <Pressable 
              style={styles.closeButton}
              onPress={() => setShowPlayerModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  avatarSection: {
    position: "relative",
  },
  avatarWrapper: {
    position: "relative",
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  glowRing: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(200, 255, 61, 0.4)",
    backgroundColor: "transparent",
  },
  avatarGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPhoto: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  avatarInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  levelBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  infoSection: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerName: {
    ...Typography.h4,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  earnedTitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  xpBarContainer: {
    marginTop: 6,
  },
  xpBarTrack: {
    height: 6,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 3,
    overflow: "hidden",
    position: "relative",
  },
  xpBarFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.dark.primary,
    borderRadius: 3,
  },
  xpBarGlow: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 8,
    backgroundColor: "transparent",
  },
  xpLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
  },
  xpLevelLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  xpValueLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  xpBarTrackGaming: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 3,
    overflow: "hidden",
    position: "relative",
  },
  xpBarFillGaming: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
    overflow: "hidden",
  },
  xpBarFillMinimal: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
    backgroundColor: ProTennisColors.neonCyan,
  },
  xpBarShimmer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },
  shimmerGradient: {
    flex: 1,
  },
  xpBarGlowEffect: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    backgroundColor: "transparent",
  },
  xpLabelsGaming: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  levelBadgeGaming: {
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  xpLevelLabelGaming: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.dark.gold,
    letterSpacing: 1,
  },
  xpValueLabelGaming: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  streakSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: Spacing.sm,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  streakValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  streakLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 2,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    flexWrap: "wrap",
  },
  focusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${Colors.dark.primary}20`,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}40`,
  },
  focusText: {
    fontSize: 11,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  coachChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  coachAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  coachName: {
    fontSize: 11,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  coachCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 340,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  coachHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  coachAvatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  coachInfo: {
    flex: 1,
  },
  coachNameLarge: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  coachExperience: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  philosophyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  philosophyTag: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  philosophyTagText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  quoteSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  quoteText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.text,
    fontStyle: "italic",
    lineHeight: 20,
  },
  lastFeedbackSection: {
    backgroundColor: `${Colors.dark.primary}10`,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.primary,
    marginBottom: Spacing.md,
  },
  lastFeedbackLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    marginBottom: 4,
  },
  lastFeedbackText: {
    fontSize: 13,
    color: Colors.dark.text,
    lineHeight: 18,
  },
  lastFeedbackDate: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 6,
  },
  closeButton: {
    backgroundColor: Colors.dark.backgroundRoot,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  playerCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 340,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  playerModalHeader: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  playerAvatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    padding: 4,
    marginBottom: Spacing.md,
  },
  playerAvatarPhotoLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  playerAvatarInner: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  playerAvatarText: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  playerModalName: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  titleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  titleBadgeText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  playerStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  playerStatBox: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    gap: 4,
  },
  playerStatValue: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  playerStatLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  ballLevelSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  ballLevelText: {
    fontSize: 14,
    fontWeight: "600",
  },
  focusSection: {
    marginBottom: Spacing.md,
  },
  focusSectionLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  focusSectionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: `${Colors.dark.primary}15`,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  focusSectionText: {
    fontSize: 14,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
});
