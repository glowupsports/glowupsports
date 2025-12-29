import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  FlatList,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { 
  FadeIn, 
  FadeInDown,
  useAnimatedStyle, 
  withSpring,
  interpolate,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { saveAuthState, setAuthToken, AuthUser } from "@/lib/auth";
import { useAuth } from "@/coach/context/AuthContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingData {
  motivationType: string | null;
  age: number | null;
  dominantHand: string | null;
  experienceLevel: string | null;
  enjoymentTags: string[];
  focusGoals: string[];
  selfConfidenceFlags: string[];
}

interface StepProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
}

const MOTIVATION_OPTIONS = [
  { id: "fun", label: "I play tennis for fun", icon: "happy-outline" },
  { id: "improve", label: "I want to improve seriously", icon: "trending-up-outline" },
  { id: "compete", label: "I want to compete", icon: "trophy-outline" },
  { id: "unsure", label: "I'm not sure yet", icon: "help-circle-outline" },
];

const EXPERIENCE_OPTIONS = [
  { id: "new", label: "New to tennis" },
  { id: "6-12months", label: "6-12 months" },
  { id: "1-3years", label: "1-3 years" },
  { id: "3+years", label: "3+ years" },
];

const HAND_OPTIONS = [
  { id: "right", label: "Right-handed", icon: "hand-right-outline" },
  { id: "left", label: "Left-handed", icon: "hand-left-outline" },
];

const ENJOYMENT_OPTIONS = [
  { id: "rallies", label: "Hitting rallies", icon: "repeat-outline" },
  { id: "winning", label: "Winning points", icon: "star-outline" },
  { id: "technique", label: "Learning technique", icon: "school-outline" },
  { id: "social", label: "Playing with others", icon: "people-outline" },
  { id: "active", label: "Being active", icon: "fitness-outline" },
  { id: "competing", label: "Competing", icon: "ribbon-outline" },
];

const FOCUS_OPTIONS = [
  { id: "technique", label: "Technique", icon: "construct-outline" },
  { id: "confidence", label: "Confidence", icon: "shield-checkmark-outline" },
  { id: "fitness", label: "Fitness", icon: "barbell-outline" },
  { id: "focus", label: "Focus", icon: "eye-outline" },
  { id: "strategy", label: "Playing smarter", icon: "bulb-outline" },
  { id: "social", label: "Social / Teamwork", icon: "people-circle-outline" },
];

const CONFIDENCE_OPTIONS = [
  { id: "confident", label: "I feel confident on court" },
  { id: "basics", label: "I know the basics" },
  { id: "nervous", label: "I get nervous in matches" },
  { id: "learning", label: "I'm still learning fundamentals" },
];

const AGE_OPTIONS = Array.from({ length: 80 }, (_, i) => i + 4);

function ProgressBar({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <View style={styles.progressContainer}>
      {Array.from({ length: totalSteps }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.progressDot,
            index <= currentStep ? styles.progressDotActive : null,
          ]}
        />
      ))}
    </View>
  );
}

function SelectableCard({ 
  selected, 
  onPress, 
  label, 
  icon,
  disabled,
}: { 
  selected: boolean; 
  onPress: () => void; 
  label: string;
  icon?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.selectableCard,
        selected ? styles.selectableCardActive : null,
        disabled ? styles.selectableCardDisabled : null,
      ]}
      onPress={() => {
        if (!disabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }
      }}
      disabled={disabled}
    >
      {icon ? (
        <Ionicons 
          name={icon as any} 
          size={24} 
          color={selected ? Colors.dark.xpCyan : Colors.dark.textMuted} 
        />
      ) : null}
      <Text style={[
        styles.selectableCardText,
        selected ? styles.selectableCardTextActive : null,
      ]}>
        {label}
      </Text>
      {selected ? (
        <View style={styles.checkIcon}>
          <Ionicons name="checkmark" size={16} color={Colors.dark.backgroundRoot} />
        </View>
      ) : null}
    </Pressable>
  );
}

function WelcomeStep({ data, setData, onNext }: StepProps) {
  return (
    <View style={styles.stepContainer}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Welcome to Glow Up Sports</Text>
        <Text style={styles.stepSubtitle}>
          This app helps you grow as a player — at your own pace.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.optionsContainer}>
        {MOTIVATION_OPTIONS.map((option) => (
          <SelectableCard
            key={option.id}
            selected={data.motivationType === option.id}
            onPress={() => {
              setData((prev) => ({ ...prev, motivationType: option.id }));
              setTimeout(onNext, 300);
            }}
            label={option.label}
            icon={option.icon}
          />
        ))}
      </Animated.View>
    </View>
  );
}

function ProfileStep({ data, setData, onNext }: StepProps) {
  return (
    <View style={styles.stepContainer}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Tell us about yourself</Text>
        <Text style={styles.stepSubtitle}>
          Just the basics — your coach will help with the rest.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>Your age</Text>
        <View style={styles.ageSelector}>
          {[6, 8, 10, 12, 14, 16, 18].map((age) => (
            <Pressable
              key={age}
              style={[
                styles.ageButton,
                data.age === age ? styles.ageButtonActive : null,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setData((prev) => ({ ...prev, age }));
              }}
            >
              <Text style={[
                styles.ageButtonText,
                data.age === age ? styles.ageButtonTextActive : null,
              ]}>
                {age}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={[
              styles.ageButton,
              data.age && data.age > 18 ? styles.ageButtonActive : null,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setData((prev) => ({ ...prev, age: 25 }));
            }}
          >
            <Text style={[
              styles.ageButtonText,
              data.age && data.age > 18 ? styles.ageButtonTextActive : null,
            ]}>
              18+
            </Text>
          </Pressable>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>Dominant hand</Text>
        <View style={styles.handSelector}>
          {HAND_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[
                styles.handButton,
                data.dominantHand === option.id ? styles.handButtonActive : null,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setData((prev) => ({ ...prev, dominantHand: option.id }));
              }}
            >
              <Ionicons 
                name={option.icon as any} 
                size={28} 
                color={data.dominantHand === option.id ? Colors.dark.xpCyan : Colors.dark.textMuted} 
              />
              <Text style={[
                styles.handButtonText,
                data.dominantHand === option.id ? styles.handButtonTextActive : null,
              ]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>Tennis experience</Text>
        <View style={styles.experienceGrid}>
          {EXPERIENCE_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[
                styles.experienceButton,
                data.experienceLevel === option.id ? styles.experienceButtonActive : null,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setData((prev) => ({ ...prev, experienceLevel: option.id }));
              }}
            >
              <Text style={[
                styles.experienceButtonText,
                data.experienceLevel === option.id ? styles.experienceButtonTextActive : null,
              ]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function EnjoymentStep({ data, setData, onNext }: StepProps) {
  const toggleEnjoyment = (id: string) => {
    setData((prev) => {
      const current = prev.enjoymentTags;
      if (current.includes(id)) {
        return { ...prev, enjoymentTags: current.filter((t) => t !== id) };
      }
      if (current.length >= 3) {
        return prev;
      }
      return { ...prev, enjoymentTags: [...current, id] };
    });
  };

  return (
    <View style={styles.stepContainer}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>What do you enjoy most?</Text>
        <Text style={styles.stepSubtitle}>
          Pick up to 3 things you love about tennis
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.optionsGrid}>
        {ENJOYMENT_OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            style={[
              styles.enjoymentCard,
              data.enjoymentTags.includes(option.id) ? styles.enjoymentCardActive : null,
              data.enjoymentTags.length >= 3 && !data.enjoymentTags.includes(option.id) 
                ? styles.enjoymentCardDisabled : null,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleEnjoyment(option.id);
            }}
          >
            <Ionicons 
              name={option.icon as any} 
              size={28} 
              color={data.enjoymentTags.includes(option.id) ? Colors.dark.xpCyan : Colors.dark.textMuted} 
            />
            <Text style={[
              styles.enjoymentCardText,
              data.enjoymentTags.includes(option.id) ? styles.enjoymentCardTextActive : null,
            ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>

      <Text style={styles.selectionCount}>
        {data.enjoymentTags.length}/3 selected
      </Text>
    </View>
  );
}

function FocusStep({ data, setData, onNext }: StepProps) {
  const toggleFocus = (id: string) => {
    setData((prev) => {
      const current = prev.focusGoals;
      if (current.includes(id)) {
        return { ...prev, focusGoals: current.filter((t) => t !== id) };
      }
      return { ...prev, focusGoals: [...current, id] };
    });
  };

  return (
    <View style={styles.stepContainer}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>What do you want to work on?</Text>
        <Text style={styles.stepSubtitle}>
          Select areas you'd like to improve
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.optionsGrid}>
        {FOCUS_OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            style={[
              styles.focusCard,
              data.focusGoals.includes(option.id) ? styles.focusCardActive : null,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleFocus(option.id);
            }}
          >
            <Ionicons 
              name={option.icon as any} 
              size={28} 
              color={data.focusGoals.includes(option.id) ? Colors.dark.xpCyan : Colors.dark.textMuted} 
            />
            <Text style={[
              styles.focusCardText,
              data.focusGoals.includes(option.id) ? styles.focusCardTextActive : null,
            ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

function BaselineStep({ data, setData, onNext }: StepProps) {
  const toggleConfidence = (id: string) => {
    setData((prev) => {
      const current = prev.selfConfidenceFlags;
      if (current.includes(id)) {
        return { ...prev, selfConfidenceFlags: current.filter((t) => t !== id) };
      }
      return { ...prev, selfConfidenceFlags: [...current, id] };
    });
  };

  return (
    <View style={styles.stepContainer}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Almost there!</Text>
        <Text style={styles.stepSubtitle}>
          Your coach will help set your level.{"\n"}This is just your starting point.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.baselineContainer}>
        <Text style={styles.sectionLabel}>How would you describe yourself? (optional)</Text>
        {CONFIDENCE_OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            style={[
              styles.confidenceOption,
              data.selfConfidenceFlags.includes(option.id) ? styles.confidenceOptionActive : null,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleConfidence(option.id);
            }}
          >
            <View style={[
              styles.checkbox,
              data.selfConfidenceFlags.includes(option.id) ? styles.checkboxActive : null,
            ]}>
              {data.selfConfidenceFlags.includes(option.id) ? (
                <Ionicons name="checkmark" size={14} color={Colors.dark.backgroundRoot} />
              ) : null}
            </View>
            <Text style={[
              styles.confidenceOptionText,
              data.selfConfidenceFlags.includes(option.id) ? styles.confidenceOptionTextActive : null,
            ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

interface Props {
  onComplete: () => void;
}

export default function PlayerOnboardingScreen({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user, refreshAuth } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    motivationType: null,
    age: null,
    dominantHand: null,
    experienceLevel: null,
    enjoymentTags: [],
    focusGoals: [],
    selfConfidenceFlags: [],
  });

  const saveMutation = useMutation({
    mutationFn: async (onboardingData: OnboardingData) => {
      const response = await apiRequest("POST", "/api/player/me/onboarding", onboardingData);
      return response.json();
    },
    onSuccess: async (responseData: { success: boolean; playerId: string; token?: string }) => {
      // If a new token was issued (player profile was created), save it
      if (responseData.token && user) {
        setAuthToken(responseData.token);
        const updatedUser: AuthUser = {
          ...user,
          playerId: responseData.playerId,
        };
        await saveAuthState(responseData.token, updatedUser);
      }
      
      // Refresh auth to get updated user data
      await refreshAuth();
      
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete();
    },
  });

  const handleNext = () => {
    if (currentStep < 4) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    saveMutation.mutate(data);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return !!data.motivationType;
      case 1:
        return !!data.age && !!data.dominantHand && !!data.experienceLevel;
      case 2:
        return data.enjoymentTags.length > 0;
      case 3:
        return data.focusGoals.length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep data={data} setData={setData} onNext={handleNext} />;
      case 1:
        return <ProfileStep data={data} setData={setData} onNext={handleNext} />;
      case 2:
        return <EnjoymentStep data={data} setData={setData} onNext={handleNext} />;
      case 3:
        return <FocusStep data={data} setData={setData} onNext={handleNext} />;
      case 4:
        return <BaselineStep data={data} setData={setData} onNext={handleNext} />;
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
      <LinearGradient
        colors={["rgba(0,212,255,0.1)", "transparent"]}
        style={styles.gradient}
      />

      <ProgressBar currentStep={currentStep} totalSteps={5} />

      <View style={styles.content}>
        {renderStep()}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {currentStep > 0 ? (
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Ionicons name="chevron-back" size={20} color={Colors.dark.textMuted} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}

        {currentStep === 4 ? (
          <Pressable
            style={[styles.nextButton, !canProceed() ? styles.nextButtonDisabled : null]}
            onPress={handleComplete}
            disabled={!canProceed() || saveMutation.isPending}
          >
            <Text style={styles.nextButtonText}>
              {saveMutation.isPending ? "Saving..." : "Let's Go!"}
            </Text>
            <Ionicons name="rocket-outline" size={20} color={Colors.dark.backgroundRoot} />
          </Pressable>
        ) : currentStep === 0 ? null : (
          <Pressable
            style={[styles.nextButton, !canProceed() ? styles.nextButtonDisabled : null]}
            onPress={handleNext}
            disabled={!canProceed()}
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.backgroundRoot} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  progressDotActive: {
    backgroundColor: Colors.dark.xpCyan,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    ...Typography.h1,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  optionsContainer: {
    gap: Spacing.md,
  },
  selectableCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectableCardActive: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  selectableCardDisabled: {
    opacity: 0.5,
  },
  selectableCardText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  selectableCardTextActive: {
    color: Colors.dark.xpCyan,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.xpCyan,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionContainer: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  ageSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  ageButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  ageButtonActive: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  ageButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  ageButtonTextActive: {
    color: Colors.dark.xpCyan,
  },
  handSelector: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  handButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  handButtonActive: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  handButtonText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  handButtonTextActive: {
    color: Colors.dark.xpCyan,
  },
  experienceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  experienceButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  experienceButtonActive: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  experienceButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  experienceButtonTextActive: {
    color: Colors.dark.xpCyan,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  enjoymentCard: {
    width: "47%",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  enjoymentCardActive: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  enjoymentCardDisabled: {
    opacity: 0.4,
  },
  enjoymentCardText: {
    ...Typography.small,
    color: Colors.dark.text,
    textAlign: "center",
  },
  enjoymentCardTextActive: {
    color: Colors.dark.xpCyan,
  },
  selectionCount: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.lg,
  },
  focusCard: {
    width: "47%",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  focusCardActive: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  focusCardText: {
    ...Typography.small,
    color: Colors.dark.text,
    textAlign: "center",
  },
  focusCardTextActive: {
    color: Colors.dark.xpCyan,
  },
  baselineContainer: {
    gap: Spacing.md,
  },
  confidenceOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  confidenceOptionActive: {
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: Colors.dark.xpCyan,
    borderColor: Colors.dark.xpCyan,
  },
  confidenceOptionText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  confidenceOptionTextActive: {
    color: Colors.dark.xpCyan,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    minWidth: 80,
  },
  backButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
});
