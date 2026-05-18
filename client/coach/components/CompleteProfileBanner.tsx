import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

const DISMISSED_KEY_PREFIX = "coach_profile_banner_dismissed_at";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function dismissedKey(userId: string | undefined): string {
  return userId ? `${DISMISSED_KEY_PREFIX}_${userId}` : DISMISSED_KEY_PREFIX;
}

interface CoachProfileData {
  onboardingCompleted?: boolean;
  photoUrl?: string | null;
  bio?: string | null;
  specialty?: string | null;
  yearsExperience?: string | null;
  philosophyTags?: string[] | null;
}

interface CoachProfile {
  coach?: CoachProfileData;
}

type CompletenessKey = keyof Pick<CoachProfileData, "photoUrl" | "bio" | "specialty" | "yearsExperience" | "philosophyTags">;

const COMPLETENESS_FIELDS: Array<{ key: CompletenessKey; label: string }> = [
  { key: "photoUrl", label: "Profile photo" },
  { key: "bio", label: "Bio" },
  { key: "specialty", label: "Specialty" },
  { key: "yearsExperience", label: "Years of experience" },
  { key: "philosophyTags", label: "Coaching philosophy" },
];

function isFieldComplete(coach: CoachProfileData, key: CompletenessKey): boolean {
  const value = coach[key];
  if (Array.isArray(value)) return value.length > 0;
  return !!value;
}

interface Props {
  onPressCTA: () => void;
}

export function CompleteProfileBanner({ onPressCTA }: Props) {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(true);

  const { data: profile } = useQuery<CoachProfile>({
    queryKey: ["/api/coach/me/profile"],
  });

  useEffect(() => {
    const key = dismissedKey(user?.id);
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (raw) {
          const ts = parseInt(raw, 10);
          if (Date.now() - ts < TTL_MS) {
            setDismissed(true);
            return;
          }
          AsyncStorage.removeItem(key).catch(() => {});
        }
        setDismissed(false);
      })
      .catch(() => {
        setDismissed(false);
      });
  }, [user?.id]);

  useEffect(() => {
    if (!profile?.coach) return;
    const coach = profile.coach;
    const onboardingDone = coach.onboardingCompleted === true;
    const completedCount = COMPLETENESS_FIELDS.filter(({ key }) =>
      isFieldComplete(coach, key)
    ).length;
    if (onboardingDone && completedCount === COMPLETENESS_FIELDS.length) {
      AsyncStorage.removeItem(dismissedKey(user?.id)).catch(() => {});
    }
  }, [profile, user?.id]);

  const handleDismiss = async () => {
    await AsyncStorage.setItem(dismissedKey(user?.id), String(Date.now()));
    setDismissed(true);
  };

  if (dismissed) return null;
  if (!profile?.coach) return null;

  const coach = profile.coach;
  const onboardingDone = coach.onboardingCompleted === true;

  const completedCount = COMPLETENESS_FIELDS.filter(({ key }) =>
    isFieldComplete(coach, key)
  ).length;
  const totalCount = COMPLETENESS_FIELDS.length;

  if (onboardingDone && completedCount === totalCount) return null;

  const progressFraction = completedCount / totalCount;

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={["rgba(46,204,64,0.12)", "rgba(0,212,255,0.08)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <View style={styles.topRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="person-circle-outline" size={22} color={Colors.dark.primary} />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.title}>Complete your profile</Text>
            <Text style={styles.subtitle}>
              {completedCount} of {totalCount} fields filled
            </Text>
          </View>
          <Pressable
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        <View style={styles.progressTrack}>
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.xpCyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${Math.round(progressFraction * 100)}%` }]}
          />
        </View>

        <Pressable style={styles.ctaRow} onPress={onPressCTA}>
          <Text style={styles.ctaText}>Finish your coach profile</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.dark.primary} />
        </Pressable>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
    overflow: "hidden",
  },
  gradient: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  subtitle: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 2,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 2,
    marginBottom: 10,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ctaText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
});
