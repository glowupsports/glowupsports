import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { useTabNavigation } from "@/components/TabNavigationContext";

const GUIDE_DONE_KEY = "@glow_new_player_guide_done_v1";

interface GuideStep {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaAction: () => void;
  isCompleted: boolean;
}

interface NewPlayerGuideCardProps {
  dnaPct: number;
  sessionCount: number;
  hasGoal: boolean;
  onBookSession: () => void;
}

export function NewPlayerGuideCard({
  dnaPct,
  sessionCount,
  hasGoal,
  onBookSession,
}: NewPlayerGuideCardProps) {
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  const [hidden, setHidden] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const dnaComplete = dnaPct >= 80;
  const sessionBooked = sessionCount > 0;
  const goalSet = hasGoal;
  const allDone = dnaComplete && sessionBooked && goalSet;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(GUIDE_DONE_KEY).then((val) => {
      if (!cancelled && val === "true") setHidden(true);
      if (!cancelled) setHydrated(true);
    }).catch(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (allDone && hydrated && !hidden) {
      AsyncStorage.setItem(GUIDE_DONE_KEY, "true").catch(() => {});
      const t = setTimeout(() => setHidden(true), 2400);
      return () => clearTimeout(t);
    }
  }, [allDone, hydrated, hidden]);

  const steps: GuideStep[] = [
    {
      id: "dna",
      icon: "analytics-outline",
      title: "Complete your Player DNA",
      subtitle: `${dnaPct}% done — tell us about your game`,
      ctaLabel: "Open DNA",
      ctaAction: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("PlayerDNAWizard");
      },
      isCompleted: dnaComplete,
    },
    {
      id: "session",
      icon: "tennisball-outline",
      title: "Book your first session",
      subtitle: "Find a coach and get on the court",
      ctaLabel: "Book Now",
      ctaAction: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onBookSession();
      },
      isCompleted: sessionBooked,
    },
    {
      id: "goal",
      icon: "flag-outline",
      title: "Set your weekly goal",
      subtitle: "How many sessions per week?",
      ctaLabel: "Set Goal",
      ctaAction: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigateToTab("Growth", { screen: "QuestsMain" });
      },
      isCompleted: goalSet,
    },
  ];

  const completedCount = steps.filter((s) => s.isCompleted).length;

  if (!hydrated || hidden) return null;
  if (allDone) return null;

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={s.wrapper}>
      <LinearGradient
        colors={["rgba(99,102,241,0.16)", "rgba(59,130,246,0.08)", "rgba(16,185,129,0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.card}
      >
        <View style={s.header}>
          <View style={s.iconBadge}>
            <Ionicons name="rocket" size={18} color={GlowColors.primary} />
          </View>
          <View style={s.headerText}>
            <Text style={s.title}>Get started with Glow</Text>
            <Text style={s.progress}>{completedCount} of 3 complete</Text>
          </View>
        </View>

        <View style={s.progressTrack}>
          <View
            style={[
              s.progressFill,
              { width: `${Math.round((completedCount / 3) * 100)}%` as any },
            ]}
          />
        </View>

        <View style={s.steps}>
          {steps.map((step, idx) => (
            <View key={step.id} style={s.stepRow}>
              <View style={[s.checkCircle, step.isCompleted && s.checkCircleDone]}>
                {step.isCompleted ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <Text style={s.stepNum}>{idx + 1}</Text>
                )}
              </View>
              <View style={s.stepContent}>
                <Text style={[s.stepTitle, step.isCompleted && s.stepTitleDone]}>
                  {step.title}
                </Text>
                {!step.isCompleted ? (
                  <Text style={s.stepSubtitle}>{step.subtitle}</Text>
                ) : null}
              </View>
              {!step.isCompleted ? (
                <Pressable
                  style={({ pressed }) => [s.stepCta, pressed && { opacity: 0.75 }]}
                  onPress={step.ctaAction}
                  accessibilityRole="button"
                  accessibilityLabel={step.ctaLabel}
                >
                  <Text style={s.stepCtaText}>{step.ctaLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.25)",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${GlowColors.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  progress: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  progressTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: GlowColors.primary,
    borderRadius: 2,
  },
  steps: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.dark.chipBackgroundStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  checkCircleDone: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  stepNum: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  stepTitleDone: {
    color: Colors.dark.textMuted,
    textDecorationLine: "line-through",
  },
  stepSubtitle: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  stepCta: {
    backgroundColor: `${GlowColors.primary}20`,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${GlowColors.primary}35`,
  },
  stepCtaText: {
    fontSize: 11,
    fontWeight: "700",
    color: GlowColors.primary,
  },
});
