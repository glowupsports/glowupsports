/**
 * Task #1531 — GlowAssessmentCard
 *
 * Home-screen card that invites the player to discover their Glow Level.
 * Shown when the player is at the default rank (9) or hasn't assessed yet.
 * Dismisses persistently via AsyncStorage.
 */

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Spacing, Colors, BorderRadius, TextColors } from "@/constants/theme";
import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";
import { GlowLevelAssessment } from "@/player/components/GlowLevelAssessment";

const DISMISS_KEY = "@glow_assessment_card_dismissed_v2";

interface GlowAssessmentCardProps {
  glowRank?: number;
  playerId?: string;
}

export function GlowAssessmentCard({ glowRank = 9 }: GlowAssessmentCardProps) {
  useThemeReactivity();
  const [dismissed, setDismissed] = useState(true); // start hidden until checked
  const [showWizard, setShowWizard] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DISMISS_KEY).then((val) => {
      if (val === "true") {
        setDismissed(true);
      } else {
        setDismissed(false);
      }
    });
  }, []);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissed(true);
    AsyncStorage.setItem(DISMISS_KEY, "true");
  }, []);

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowWizard(true);
  }, []);

  const handleComplete = useCallback((_rank: number, _rankName: string) => {
    setShowWizard(false);
    setCompleted(true);
    setDismissed(true);
    AsyncStorage.setItem(DISMISS_KEY, "true");
  }, []);

  // Only show for players at default/beginner rank (8–9) who haven't dismissed
  const shouldShow = !dismissed && !completed && glowRank >= 8;
  if (!shouldShow) return null;

  return (
    <>
      <Animated.View
        entering={FadeInDown.delay(200).duration(600)}
        exiting={FadeOutUp.duration(300)}
        style={s.outerWrap}
      >
        <LinearGradient
          colors={["rgba(99,102,241,0.35)", "rgba(168,85,247,0.22)", "rgba(0,0,0,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.gradientBorder}
        >
          <View style={s.card}>
            {/* Dismiss button */}
            <Pressable
              onPress={handleDismiss}
              style={s.dismissBtn}
              hitSlop={12}
              accessibilityLabel="Dismiss glow assessment card"
            >
              <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
            </Pressable>

            {/* Header row */}
            <View style={s.topRow}>
              <LinearGradient
                colors={["#6366F1", "#8B5CF6", "#A855F7"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.iconBadge}
              >
                <Ionicons name="trophy" size={18} color="#fff" />
              </LinearGradient>
              <View style={s.headerTexts}>
                <Text style={s.eyebrow}>GLOW LEVEL</Text>
                <Text style={s.title}>Discover Your Level</Text>
              </View>
              <View style={s.newBadge}>
                <Text style={s.newBadgeText}>NEW</Text>
              </View>
            </View>

            {/* Body */}
            <Text style={s.body}>
              Take a 2-minute assessment to find your starting Glow Rank. It helps
              your coach plan the right sessions for your game.
            </Text>

            {/* Rank preview pills */}
            <View style={s.pillsRow}>
              {[
                { rank: 9, name: "Beginner", color: "#6B7280" },
                { rank: 7, name: "Intermediate", color: "#F59E0B" },
                { rank: 5, name: "Performance", color: "#8B5CF6" },
                { rank: 1, name: "Elite", color: "#FFD700" },
              ].map((r) => (
                <View key={r.rank} style={[s.pill, { borderColor: r.color + "55", backgroundColor: r.color + "18" }]}>
                  <View style={[s.pillDot, { backgroundColor: r.color }]} />
                  <Text style={[s.pillText, { color: r.color }]}>{r.name}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            <Pressable
              onPress={handleOpen}
              accessibilityRole="button"
              accessibilityLabel="Start Glow Level Assessment"
              style={({ pressed }) => [s.ctaWrap, pressed && s.ctaPressed]}
            >
              <LinearGradient
                colors={["#6366F1", "#8B5CF6", "#A855F7"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.ctaGradient}
              >
                <Ionicons name="flash" size={16} color="#fff" />
                <Text style={s.ctaText}>Start Assessment</Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
              </LinearGradient>
            </Pressable>
          </View>
        </LinearGradient>
      </Animated.View>

      <GlowLevelAssessment
        visible={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={handleComplete}
      />
    </>
  );
}

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
      padding: Spacing.md,
      gap: Spacing.sm,
      overflow: "hidden",
    },
    dismissBtn: {
      position: "absolute",
      top: Spacing.sm,
      right: Spacing.sm,
      zIndex: 10,
      padding: 4,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      paddingRight: 32,
    },
    iconBadge: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTexts: {
      flex: 1,
    },
    eyebrow: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.8,
      color: "#818CF8",
    },
    title: {
      fontSize: 15,
      fontWeight: "700",
      color: Colors.dark.text,
      marginTop: 1,
    },
    newBadge: {
      backgroundColor: "rgba(99,102,241,0.20)",
      borderRadius: BorderRadius.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: "rgba(99,102,241,0.40)",
    },
    newBadgeText: {
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.2,
      color: "#818CF8",
    },
    body: {
      fontSize: 13,
      color: TextColors.secondary,
      lineHeight: 19,
    },
    pillsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
    },
    pillDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    pillText: {
      fontSize: 11,
      fontWeight: "600",
    },
    ctaWrap: {
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
      paddingVertical: 13,
      borderRadius: BorderRadius.lg,
    },
    ctaText: {
      fontSize: 14,
      fontWeight: "800",
      color: "#fff",
      flex: 1,
      textAlign: "center",
    },
  }),
);
