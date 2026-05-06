import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Switch, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, CardStyles, TextColors, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const COACH_SHARE_PREF_KEY = "technique_share_with_coach_default";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
type PrivacyLevel = "everyone" | "platform" | "academy" | "hidden";

interface PrivacyOption {
  id: PrivacyLevel;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
}

const PRIVACY_OPTIONS: PrivacyOption[] = [
  {
    id: "everyone",
    icon: "globe-outline",
    title: "Visible to Everyone",
    description: "Other players can find you for Open Matches and see your profile",
    color: Colors.dark.accentText,
  },
  {
    id: "academy",
    icon: "school-outline",
    title: "Academy Only",
    description: "Only players in your academy can see you and invite you to matches",
    color: "#4DA3FF",
  },
  {
    id: "hidden",
    icon: "eye-off-outline",
    title: "Hidden",
    description: "Nobody can find you - you must invite others to play",
    color: "#FFB020",
  },
];

interface PrivacySettingsScreenProps {
  isOnboarding?: boolean;
  onComplete?: () => void;
  currentLevel?: PrivacyLevel;
  onGoBack?: () => void;
}

export default function PrivacySettingsScreen({
  isOnboarding = false,
  onComplete,
  currentLevel = "everyone",
  onGoBack,
}: PrivacySettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  
  const [selected, setSelected] = useState<PrivacyLevel>(currentLevel);
  const [shareWithCoach, setShareWithCoach] = useState(true);

  // Fetch server-backed coach-share preference (source of truth)
  const { data: privacyData } = useQuery<{ shareAnalysesWithCoach: boolean }>({
    queryKey: ["/api/player/me/technique-privacy"],
  });

  useEffect(() => {
    if (privacyData?.shareAnalysesWithCoach !== undefined) {
      setShareWithCoach(privacyData.shareAnalysesWithCoach);
      // Keep AsyncStorage cache in sync (used by upload flow)
      AsyncStorage.setItem(
        COACH_SHARE_PREF_KEY,
        privacyData.shareAnalysesWithCoach ? "true" : "false"
      ).catch(() => {});
    } else {
      // Fallback to local cache while server response is loading
      AsyncStorage.getItem(COACH_SHARE_PREF_KEY).then((val) => {
        if (val !== null) setShareWithCoach(val === "true");
      }).catch(() => {});
    }
  }, [privacyData]);

  const handleCoachShareToggle = (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShareWithCoach(val);
  };

  const updatePrivacyMutation = useMutation({
    mutationFn: async (params: { privacyLevel: PrivacyLevel; shareAnalysesWithCoach: boolean }) => {
      const response = await apiRequest("PATCH", "/api/player/me/social", {
        privacyLevel: params.privacyLevel,
        shareAnalysesWithCoach: params.shareAnalysesWithCoach,
      });
      return response;
    },
    onSuccess: (_data, params) => {
      // Write-through: keep local cache in sync with server
      AsyncStorage.setItem(
        COACH_SHARE_PREF_KEY,
        params.shareAnalysesWithCoach ? "true" : "false"
      ).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/technique-privacy"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (onComplete) {
        onComplete();
      } else if (onGoBack) {
        onGoBack();
      }
    },
    onError: (_error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Could not save",
        "Please try again or log in again if the problem persists.",
        [{ text: "OK" }]
      );
    },
  });

  const handleSelect = (level: PrivacyLevel) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(level);
  };

  const handleConfirm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updatePrivacyMutation.mutate({ privacyLevel: selected, shareAnalysesWithCoach: shareWithCoach });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          {!isOnboarding && onGoBack && (
            <Pressable 
              style={styles.backButton} 
              onPress={onGoBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={24} color={TextColors.primary} />
            </Pressable>
          )}
          <View style={styles.headerContent}>
            <View style={styles.iconContainer}>
              <Ionicons name="shield-checkmark" size={32} color={Colors.dark.accentText} />
            </View>
            <Text style={styles.title}>Privacy Settings</Text>
            <Text style={styles.subtitle}>
              {isOnboarding 
                ? "Choose who can find you in the app"
                : "Update your visibility preferences"
              }
            </Text>
          </View>
        </View>

        <View style={styles.optionsContainer}>
          {PRIVACY_OPTIONS.map((option) => {
            const isSelected = selected === option.id;
            
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.optionCard,
                  isSelected && styles.optionCardSelected,
                  isSelected && { borderColor: option.color },
                ]}
                onPress={() => handleSelect(option.id)}
              >
                {isSelected && (
                  <LinearGradient
                    colors={[`${option.color}15`, `${option.color}05`]}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                )}
                
                <View style={styles.optionContent}>
                  <View style={[styles.optionIcon, { backgroundColor: `${option.color}20` }]}>
                    <Ionicons name={option.icon} size={24} color={option.color} />
                  </View>
                  
                  <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionDescription}>{option.description}</Text>
                  </View>
                  
                  <View style={[
                    styles.radioOuter,
                    isSelected && { borderColor: option.color },
                  ]}>
                    {isSelected && (
                      <View style={[styles.radioInner, { backgroundColor: option.color }]} />
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={TextColors.muted} />
          <Text style={styles.infoText}>
            You can change this anytime in Settings. Your choice affects who can see your profile and invite you to matches.
          </Text>
        </View>

        <View style={styles.coachSectionCard}>
          <View style={styles.coachSectionRow}>
            <View style={styles.coachSectionIcon}>
              <Ionicons name="videocam-outline" size={22} color={GlowColors.primary} />
            </View>
            <View style={styles.coachSectionText}>
              <Text style={styles.coachSectionTitle}>Share Technique Analyses</Text>
              <Text style={styles.coachSectionSub}>
                Allow your coach to view your AI technique feedback by default
              </Text>
            </View>
            <Switch
              value={shareWithCoach}
              onValueChange={handleCoachShareToggle}
              trackColor={{ false: Backgrounds.card, true: GlowColors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable
          style={[styles.confirmButton, updatePrivacyMutation.isPending && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={updatePrivacyMutation.isPending}
        >
          <LinearGradient
            colors={[GlowColors.primary, "#A6E92A"]}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          {updatePrivacyMutation.isPending ? (
            <TennisBallSpinner color={Backgrounds.root} />
          ) : (
            <Text style={styles.confirmButtonText}>
              {isOnboarding ? "Continue" : "Save Changes"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  backButton: {
    position: "absolute",
    left: 0,
    top: 0,
    padding: Spacing.sm,
    zIndex: 1,
  },
  headerContent: {
    alignItems: "center",
    paddingTop: Spacing.xl,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dark.accentTextSoft,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    color: TextColors.primary,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: TextColors.secondary,
    textAlign: "center",
  },
  optionsContainer: {
    gap: Spacing.md,
  },
  optionCard: {
    ...CardStyles.base,
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
  },
  optionCardSelected: {
    borderWidth: 2,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  optionText: {
    flex: 1,
    marginRight: Spacing.md,
  },
  optionTitle: {
    ...Typography.h4,
    color: TextColors.primary,
    marginBottom: 4,
  },
  optionDescription: {
    ...Typography.caption,
    color: TextColors.secondary,
    lineHeight: 18,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: TextColors.muted,
    justifyContent: "center",
    alignItems: "center",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  infoText: {
    ...Typography.caption,
    color: TextColors.muted,
    flex: 1,
    lineHeight: 18,
  },
  coachSectionCard: {
    ...CardStyles.base,
    marginTop: Spacing.md,
  },
  coachSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  coachSectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${GlowColors.primary}20`,
    justifyContent: "center",
    alignItems: "center",
  },
  coachSectionText: {
    flex: 1,
  },
  coachSectionTitle: {
    ...Typography.body,
    color: TextColors.primary,
    fontWeight: "600",
    marginBottom: 2,
  },
  coachSectionSub: {
    ...Typography.caption,
    color: TextColors.secondary,
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Backgrounds.card,
  },
  confirmButton: {
    height: 56,
    borderRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  confirmButtonDisabled: {
    opacity: 0.7,
  },
  confirmButtonText: {
    ...Typography.h4,
    color: Backgrounds.root,
    fontWeight: "700",
  },
}));
