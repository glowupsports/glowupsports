import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Spacing, Colors, BorderRadius, GlowColors, TextColors } from "@/constants/theme";
import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";

interface AICoachHomeCardProps {
  aiStatus: { isPro: boolean; isCoach: boolean; callCount: number; limit: number } | null;
  aiCoachContext: {
    glowMirrorLayers?: {
      sessionCheckins: boolean;
      monthlyVoice: boolean;
      perceptionGaps: boolean;
    };
  } | null;
  weeklyDigest: { data: { focusArea?: string } | null } | null;
}

const LAYER_LABELS = ["Session Check-ins", "Monthly Voice", "Perception Gaps"] as const;

export const AICoachHomeCard = React.memo(function AICoachHomeCard({
  aiStatus,
  aiCoachContext,
  weeklyDigest,
}: AICoachHomeCardProps) {
  useThemeReactivity();
  const navigation = useNavigation<any>();

  const layers = aiCoachContext?.glowMirrorLayers;
  const layerStates = layers
    ? [layers.sessionCheckins, layers.monthlyVoice, layers.perceptionGaps]
    : [false, false, false];
  const activeCount = layerStates.filter(Boolean).length;
  const focusPreview = weeklyDigest?.data?.focusArea;
  const isNearLimit =
    aiStatus && aiStatus.limit > 0 && aiStatus.callCount / aiStatus.limit >= 0.9;
  const remaining =
    aiStatus && aiStatus.limit > 0
      ? Math.max(aiStatus.limit - aiStatus.callCount, 0)
      : null;

  const handleOpen = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerAICoach");
  };

  return (
    <Animated.View entering={FadeInDown.delay(160).duration(550)} style={s.outerWrap}>
      <LinearGradient
        colors={["rgba(99,102,241,0.30)", "rgba(59,130,246,0.15)", "rgba(0,212,255,0.08)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.gradientBorder}
      >
        <View style={s.card}>
          <View style={s.topBar}>
            <View style={s.topBarLeft}>
              <LinearGradient
                colors={["#6366F1", "#3B82F6"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.iconBadge}
              >
                <Ionicons name="sparkles" size={15} color="#fff" />
              </LinearGradient>
              <View>
                <Text style={s.sectionLabel}>AI COACH</Text>
                <Text style={s.sectionSub}>Powered by Glow Mirror</Text>
              </View>
            </View>

            <View style={s.layersBadge}>
              {layerStates.map((active, i) => (
                <View
                  key={i}
                  style={[
                    s.layerDot,
                    active ? s.layerDotActive : s.layerDotInactive,
                  ]}
                />
              ))}
              <Text style={s.layersCount}>{activeCount}/3</Text>
            </View>
          </View>

          {focusPreview ? (
            <View style={s.focusRow}>
              <Ionicons name="flag-outline" size={12} color="#818CF8" />
              <Text style={s.focusText} numberOfLines={2}>
                {focusPreview}
              </Text>
            </View>
          ) : (
            <View style={s.focusRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={12} color="#818CF8" />
              <Text style={s.focusTextEmpty} numberOfLines={1}>
                Ask about your game, progress and strategy
              </Text>
            </View>
          )}

          <View style={s.layerRow}>
            {LAYER_LABELS.map((label, i) => (
              <View key={label} style={[s.layerChip, layerStates[i] && s.layerChipActive]}>
                <View
                  style={[
                    s.layerChipDot,
                    layerStates[i] ? s.layerChipDotActive : s.layerChipDotInactive,
                  ]}
                />
                <Text
                  style={[s.layerChipText, layerStates[i] && s.layerChipTextActive]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {isNearLimit && remaining !== null ? (
            <View style={s.limitRow}>
              <Ionicons name="warning-outline" size={12} color={Colors.dark.error} />
              <Text style={s.limitText}>{remaining} messages left this month</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleOpen}
            style={({ pressed }) => [s.ctaBtn, pressed && s.ctaPressed]}
            accessibilityRole="button"
            accessibilityLabel="Open AI Coach"
          >
            <LinearGradient
              colors={["#6366F1", "#3B82F6", "#00D4FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.ctaGradient}
            >
              <Ionicons name="sparkles" size={15} color="#fff" />
              <Text style={s.ctaText}>Open AI Coach</Text>
              <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </Pressable>
        </View>
      </LinearGradient>
    </Animated.View>
  );
});

const s = makeReactiveStyles(() =>
  StyleSheet.create({
    outerWrap: {
      marginHorizontal: Spacing.lg,
      borderRadius: BorderRadius.lg + 2,
      overflow: "hidden",
    },
    gradientBorder: {
      padding: 1.5,
      borderRadius: BorderRadius.lg + 2,
    },
    card: {
      backgroundColor: Colors.dark.backgroundDefault,
      borderRadius: BorderRadius.lg,
      overflow: "hidden",
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    topBarLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    iconBadge: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "800",
      color: "#818CF8",
      letterSpacing: 1.8,
    },
    sectionSub: {
      fontSize: 11,
      fontWeight: "500",
      color: TextColors.secondary,
      marginTop: 1,
    },
    layersBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(99,102,241,0.12)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: "rgba(99,102,241,0.25)",
    },
    layerDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    layerDotActive: {
      backgroundColor: "#6366F1",
    },
    layerDotInactive: {
      backgroundColor: Colors.dark.chipBackgroundStrong,
    },
    layersCount: {
      fontSize: 11,
      fontWeight: "700",
      color: "#818CF8",
    },
    focusRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      backgroundColor: "rgba(99,102,241,0.08)",
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 7,
    },
    focusText: {
      flex: 1,
      fontSize: 12,
      color: TextColors.secondary,
      fontStyle: "italic",
      lineHeight: 17,
    },
    focusTextEmpty: {
      flex: 1,
      fontSize: 12,
      color: TextColors.muted,
    },
    layerRow: {
      flexDirection: "row",
      gap: 6,
      flexWrap: "wrap",
    },
    layerChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: Colors.dark.chipBackground,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: Colors.dark.chipBorder,
    },
    layerChipActive: {
      backgroundColor: "rgba(99,102,241,0.12)",
      borderColor: "rgba(99,102,241,0.30)",
    },
    layerChipDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    layerChipDotActive: {
      backgroundColor: "#6366F1",
    },
    layerChipDotInactive: {
      backgroundColor: Colors.dark.textMuted,
    },
    layerChipText: {
      fontSize: 10,
      fontWeight: "600",
      color: Colors.dark.textMuted,
    },
    layerChipTextActive: {
      color: "#818CF8",
    },
    limitRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    limitText: {
      fontSize: 11,
      fontWeight: "600",
      color: Colors.dark.error,
    },
    ctaBtn: {
      borderRadius: BorderRadius.lg,
      overflow: "hidden",
      marginTop: 2,
    },
    ctaPressed: {
      opacity: 0.82,
    },
    ctaGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingVertical: 12,
      borderRadius: BorderRadius.lg,
    },
    ctaText: {
      fontSize: 14,
      fontWeight: "800",
      color: "#fff",
      flex: 1,
      textAlign: "center",
    },
  })
);
