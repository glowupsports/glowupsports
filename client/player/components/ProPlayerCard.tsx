import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Image as RNImage, Modal } from "react-native";
import { usePlayerAppearance, PlayerAppearancePreference } from "@/player/context/PlayerAppearanceContext";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  interpolate,
  Extrapolation,
  LinearTransition,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Spacing, BorderRadius, GlowColors, Backgrounds, TextColors, Colors } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { isRTL } from "@/i18n";
import { formatCredits } from "@/lib/dateUtils";
import { usePlayerLevel } from "../hooks/usePlayerLevel";
import { useNavigation } from "@react-navigation/native";
import { useAcademyTheme } from "@/contexts/AcademyThemeContext";
import { useTranslation } from "react-i18next";
import { HelpCenterModal } from "@/components/HelpCenterModal";
import type { FAQItem } from "@/components/HelpCenterModal";
import MyThemeEditor from "@/player/components/MyThemeEditor";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
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
  const { t, i18n: i18nInstance } = useTranslation();
  const navigation = useNavigation<any>();
  const glowPulse = useSharedValue(0);
  const bounceY = useSharedValue(0);
  const rtl = isRTL(i18nInstance.language);
  const profilePhotoUri = buildPhotoUrl(player.profilePhotoUrl);

  const collapsedKey = `proPlayerCard.collapsed.${player.id}`;
  const openCountKey = `proPlayerCard.openCount.${player.id}`;
  const everTappedKey = `proPlayerCard.everTapped.${player.id}`;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const everTappedRef = React.useRef(false);
  const cleanupRef = React.useRef<null | (() => void)>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [[, collapsedRaw], [, openCountRaw], [, everTappedRaw]] =
          await AsyncStorage.multiGet([collapsedKey, openCountKey, everTappedKey]);
        if (cancelled) return;
        const collapsed = collapsedRaw === "1";
        const everTapped = everTappedRaw === "1";
        const openCount = Math.max(0, parseInt(openCountRaw ?? "0", 10) || 0);
        everTappedRef.current = everTapped;
        setIsCollapsed(collapsed);
        setHydrated(true);

        const nextCount = openCount + 1;
        if (openCount < 3) {
          AsyncStorage.setItem(openCountKey, String(Math.min(nextCount, 3))).catch(() => {});
        }
        if (!collapsed && !everTapped && openCount < 3) {
          const timeout = setTimeout(() => {
            bounceY.value = withSequence(
              withTiming(-6, { duration: 180 }),
              withSpring(0, { damping: 6, stiffness: 180 }),
              withTiming(-4, { duration: 160 }),
              withSpring(0, { damping: 6, stiffness: 180 }),
            );
          }, 2000);
          cleanupRef.current = () => clearTimeout(timeout);
        }
      } catch {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id]);

  const handleToggleCollapse = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    bounceY.value = withTiming(0, { duration: 120 });
    if (!everTappedRef.current) {
      everTappedRef.current = true;
      AsyncStorage.setItem(everTappedKey, "1").catch(() => {});
    }
    setIsCollapsed((prev) => {
      const next = !prev;
      AsyncStorage.setItem(collapsedKey, next ? "1" : "0").catch(() => {});
      return next;
    });
  };

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));
  const { logoUrl: academyLogoFromTheme, playerOverride, setPlayerOverride, resolved: resolvedTheme } = useAcademyTheme();
  const themePrimary = resolvedTheme?.primary ?? Colors.dark.accentText;
  const themePrimarySoft = `${themePrimary}40`;
  const academyLogoUrl = buildPhotoUrl(academyLogoFromTheme);
  const insets = useSafeAreaInsets();
  const [showHelp, setShowHelp] = useState(false);
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const { preference: appearancePref, resolvedScheme, setPreference: setAppearancePref } = usePlayerAppearance();

  const appearanceLabels: Record<PlayerAppearancePreference, string> = {
    light: t("player.home.appearance.light"),
    dark: t("player.home.appearance.dark"),
    system: t("player.home.appearance.system"),
  };
  const appearanceIcons: Record<PlayerAppearancePreference, React.ComponentProps<typeof Ionicons>["name"]> = {
    light: "sunny-outline",
    dark: "moon-outline",
    system: "phone-portrait-outline",
  };
  const didLongPressAppearance = React.useRef(false);
  const cycleAppearance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next: PlayerAppearancePreference =
      appearancePref === "system" ? "light" : appearancePref === "light" ? "dark" : "system";
    setAppearancePref(next);
  };

  const openThemeEditor = () => {
    if (didLongPressAppearance.current) {
      didLongPressAppearance.current = false;
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowThemeEditor(true);
  };

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

  const chevronCornerStyle = [
    styles.chevronCorner,
    rtl ? { left: 8 } : { right: 8 },
  ];

  if (!hydrated) {
    // Avoid flickering between expanded and collapsed before AsyncStorage
    // resolves. Render a placeholder of the same horizontal footprint so
    // the surrounding layout doesn't jump once we know the persisted state.
    return (
      <View>
        <View style={[styles.cardContainer, { height: 1, opacity: 0 }]} />
      </View>
    );
  }

  if (isCollapsed) {
    return (
      <View>
        <View style={styles.cardContainer}>
          <Animated.View style={[styles.cardGlow, glowRingStyle, { pointerEvents: "none" as const, borderColor: themePrimary }]} />
          <Animated.View style={styles.container} layout={LinearTransition.springify().damping(18)}>
            <View style={[styles.cardGradient, { backgroundColor: Backgrounds.root, borderColor: themePrimary }]}>
              <LinearGradient
                colors={[themePrimary, themePrimarySoft, themePrimary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.topAccentLine}
              />
              <View style={styles.collapsedRow}>
                <Pressable onPress={handleAvatarPress} hitSlop={6}>
                  <View style={styles.collapsedAvatarFrame}>
                    <LinearGradient
                      colors={[GlowColors.primary, GlowColors.soft]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.collapsedAvatarBorder}
                    >
                      {profilePhotoUri ? (
                        Platform.OS === "web" ? (
                          <RNImage source={{ uri: profilePhotoUri }} style={styles.collapsedAvatarPhoto} resizeMode="cover" />
                        ) : (
                          <Image source={{ uri: profilePhotoUri }} style={styles.collapsedAvatarPhoto} contentFit="cover" />
                        )
                      ) : (
                        <View style={styles.collapsedAvatarInner}>
                          <Text style={styles.avatarText}>{(player.name || "P").charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                    </LinearGradient>
                  </View>
                </Pressable>
                <View style={styles.collapsedIdentity}>
                  <Text style={styles.collapsedName} numberOfLines={1}>{player.name || "Player"}</Text>
                  <View style={styles.collapsedXpTrack}>
                    <LinearGradient
                      colors={[GlowColors.primary, GlowColors.soft]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.xpBarFill, { width: `${Math.max(xpProgress * 100, 2)}%` }]}
                    />
                  </View>
                </View>
                <Animated.View style={bounceStyle}>
                  <Pressable
                    onPress={handleToggleCollapse}
                    hitSlop={10}
                    style={styles.chevronBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t("player.home.expandCard", { defaultValue: "Expand player card" })}
                  >
                    <Ionicons name="chevron-down" size={14} color={Colors.dark.accentText} />
                  </Pressable>
                </Animated.View>
              </View>
            </View>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.cardContainer}>
        <Animated.View style={[styles.cardGlow, glowRingStyle, { pointerEvents: "none" as const, borderColor: themePrimary }]} />
        <Animated.View style={styles.container} layout={LinearTransition.springify().damping(18)}>
          <View
            style={[styles.cardGradient, { backgroundColor: Backgrounds.root, borderColor: themePrimary }]}
          >
          <LinearGradient
            colors={[themePrimary, themePrimarySoft, themePrimary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topAccentLine}
          />

          <Animated.View style={[chevronCornerStyle, bounceStyle]} pointerEvents="box-none">
            <Pressable
              onPress={handleToggleCollapse}
              hitSlop={10}
              style={styles.chevronBtn}
              accessibilityRole="button"
              accessibilityLabel={t("player.home.collapseCard", { defaultValue: "Collapse player card" })}
            >
              <Ionicons name="chevron-up" size={14} color={Colors.dark.accentText} />
            </Pressable>
          </Animated.View>

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
                {academyLogoUrl ? (
                  <RNImage
                    source={{ uri: academyLogoUrl }}
                    style={styles.academyLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <Ionicons name="tennisball" size={12} color={Colors.dark.accentText} />
                )}
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

          {(() => {
            // Coerce every credit field via Number(...) — pg numerics
            // deserialize as strings, and "12" + 12 = "1212" is the
            // exact bug this avoids. Sum from the per-type breakdown
            // so we never trust a pre-summed total that may have been
            // string-concatenated upstream.
            const cPrivate = Number(credits?.private ?? 0) || 0;
            const cGroup = Number(credits?.group ?? 0) || 0;
            const cSemi = Number(credits?.semi_private ?? 0) || 0;
            const totalNum = cPrivate + cGroup + cSemi;
            return (
          <View style={styles.cardBottomRow}>
            <Pressable 
              style={[
                styles.walletChip,
                totalNum <= 0 && styles.walletChipDanger,
              ]} 
              onPress={handleWalletPress}
            >
              {totalNum <= 0 ? (
                <Ionicons name="alert-circle" size={14} color="#FF4D4D" />
              ) : null}
              <Ionicons 
                name="wallet-outline" 
                size={14} 
                color={totalNum <= 0 ? "#FF4D4D" : Colors.dark.accentText} 
              />
              <Text style={[
                styles.walletText,
                totalNum <= 0 && styles.walletTextDanger,
              ]}>{formatCredits(totalNum)} {t("player.home.credits")}</Text>
            </Pressable>

            <View style={{ flex: 1 }} />

            <Pressable
              style={styles.bottomActionBtn}
              hitSlop={6}
              onPress={openThemeEditor}
              onLongPress={() => {
                didLongPressAppearance.current = true;
                cycleAppearance();
              }}
              accessibilityRole="button"
              accessibilityLabel="Open theme editor"
              accessibilityHint="Opens the theme editor. Long-press to cycle system, light, and dark."
            >
              <Ionicons name="color-palette-outline" size={16} color={Colors.dark.iconMuted} />
            </Pressable>
            <Pressable
              style={styles.bottomActionBtn}
              hitSlop={6}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowHelp(true);
              }}
            >
              <Ionicons name="help-circle-outline" size={16} color={Colors.dark.iconMuted} />
            </Pressable>
            {showSquadSwitch ? (
              <Pressable style={styles.familyChip} onPress={handleSquadPress}>
                <Ionicons name="people" size={14} color={Colors.dark.accentText} />
                <Text style={styles.familyChipText}>{t("player.home.family")}</Text>
              </Pressable>
            ) : null}
          </View>
            );
          })()}
        </View>
        </Animated.View>
      </View>
      <Modal
        visible={showThemeEditor}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowThemeEditor(false)}
      >
        <View style={[styles.themeEditorContainer, { paddingTop: insets.top + Spacing.md }]}>
          <View style={styles.themeEditorHeader}>
            <Text style={styles.themeEditorTitle}>Theme</Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowThemeEditor(false);
              }}
              style={styles.themeEditorCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="Close theme editor"
            >
              <Ionicons name="close" size={22} color={Colors.dark.text} />
            </Pressable>
          </View>

          <View style={styles.appearanceSegmentRow}>
            {(["light", "dark", "system"] as PlayerAppearancePreference[]).map((opt) => {
              const selected = appearancePref === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setAppearancePref(opt);
                  }}
                  style={[
                    styles.appearanceSegment,
                    selected && styles.appearanceSegmentSelected,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${appearanceLabels[opt]} appearance`}
                >
                  <Ionicons
                    name={appearanceIcons[opt]}
                    size={18}
                    color={selected ? Colors.dark.buttonText : Colors.dark.textMuted}
                  />
                  <Text
                    style={[
                      styles.appearanceSegmentLabel,
                      selected && styles.appearanceSegmentLabelSelected,
                    ]}
                  >
                    {appearanceLabels[opt]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.themeEditorBody}>
            <MyThemeEditor
              override={playerOverride}
              setOverride={setPlayerOverride}
              initialMode={resolvedScheme === "light" ? "light" : "dark"}
            />
          </View>
        </View>
      </Modal>
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

const styles = makeReactiveStyles(() => StyleSheet.create({
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
    borderColor: Colors.dark.accentText,
    opacity: 0.5,
  },
  cardGradient: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.accentTextBorder,
    overflow: "hidden",
  },
  topAccentLine: {
    height: 3,
    width: "100%",
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  avatarContainer: {
    position: "relative",
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOuterGlow: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
  },
  avatarGlowGradient: {
    width: "100%",
    height: "100%",
  },
  avatarFrame: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
  },
  avatarBorder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPhoto: {
    width: 43,
    height: 43,
    borderRadius: 21.5,
  },
  avatarInner: {
    width: 43,
    height: 43,
    borderRadius: 21.5,
    backgroundColor: Backgrounds.root,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.accentText,
  },
  levelBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    borderRadius: 9,
    overflow: "hidden",
  },
  levelBadgeGradient: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  levelBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.dark.onAccent,
  },
  identitySection: {
    flex: 1,
    gap: 1,
  },
  roleLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.accentText,
    letterSpacing: 1.4,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "800",
    color: TextColors.primary,
  },
  academyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  academyLogo: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  academyText: {
    fontSize: 11,
    fontWeight: "500",
    color: TextColors.muted,
  },
  xpSection: {
    marginTop: 3,
    gap: 1,
  },
  xpBarTrack: {
    height: 3,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 1.5,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 1.5,
  },
  xpLabels: {
    flexDirection: "row",
    gap: 4,
  },
  xpCurrent: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.accentText,
  },
  xpRequired: {
    fontSize: 10,
    color: TextColors.muted,
    fontWeight: "500",
  },
  chevronCorner: {
    position: "absolute",
    top: 8,
    zIndex: 2,
  },
  chevronBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  collapsedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 10,
  },
  collapsedAvatarFrame: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
  },
  collapsedAvatarBorder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  collapsedAvatarPhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  collapsedAvatarInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Backgrounds.root,
    justifyContent: "center",
    alignItems: "center",
  },
  collapsedIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  collapsedName: {
    fontSize: 15,
    fontWeight: "800",
    color: TextColors.primary,
  },
  collapsedXpTrack: {
    height: 3,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 1.5,
    overflow: "hidden",
  },
  bottomActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.dark.chipBackgroundStrong,
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
    color: TextColors.primary,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.dark.divider,
    marginHorizontal: Spacing.md,
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  walletChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.chipBackground,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  walletChipDanger: {
    backgroundColor: "rgba(255, 77, 77, 0.12)",
  },
  walletText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.accentText,
  },
  walletTextDanger: {
    color: "#FF4D4D",
  },
  streakChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.chipBackground,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 3,
  },
  streakText: {
    fontSize: 12,
    fontWeight: "700",
  },
  familyChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.accentTextSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.accentTextBorder,
    gap: 5,
  },
  familyChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.accentText,
    letterSpacing: 0.5,
  },
  themeEditorContainer: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  themeEditorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  themeEditorTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  themeEditorCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  themeEditorBody: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  appearanceSegmentRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  appearanceSegment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.chipBackgroundStrong,
  },
  appearanceSegmentSelected: {
    backgroundColor: Colors.dark.accentText,
  },
  appearanceSegmentLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  appearanceSegmentLabelSelected: {
    color: Colors.dark.buttonText,
  },
}));
