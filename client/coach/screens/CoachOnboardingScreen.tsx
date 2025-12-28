import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  FlatList,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { 
  FadeIn, 
  FadeInDown,
} from "react-native-reanimated";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingData {
  acknowledgements: {
    glowRules: boolean;
    feedbackRules: boolean;
    attendanceRules: boolean;
    fairness: boolean;
  };
  yearsExperience: string | null;
  backgroundTags: string[];
  philosophyTags: string[];
  publicQuote: string;
}

interface StepProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
}

const EXPERIENCE_OPTIONS = [
  { id: "0-2", label: "0-2 years" },
  { id: "3-5", label: "3-5 years" },
  { id: "6-10", label: "6-10 years" },
  { id: "10+", label: "10+ years" },
];

const BACKGROUND_OPTIONS = [
  { id: "former_player", label: "Former Player", icon: "tennisball-outline" },
  { id: "coaching_education", label: "Coaching Education", icon: "school-outline" },
  { id: "self_developed", label: "Self-Developed", icon: "book-outline" },
  { id: "mixed", label: "Mixed Background", icon: "layers-outline" },
];

const PHILOSOPHY_OPTIONS = [
  { id: "confidence", label: "Confidence", icon: "shield-checkmark-outline" },
  { id: "discipline", label: "Discipline", icon: "time-outline" },
  { id: "fun", label: "Fun", icon: "happy-outline" },
  { id: "technique", label: "Technique", icon: "construct-outline" },
  { id: "performance", label: "Performance", icon: "trending-up-outline" },
  { id: "growth", label: "Growth", icon: "leaf-outline" },
];

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
          if (Platform.OS !== "web") Haptics.selectionAsync();
          onPress();
        }
      }}
    >
      {icon ? (
        <Ionicons
          name={icon as any}
          size={24}
          color={selected ? Colors.dark.primary : Colors.dark.textSecondary}
          style={styles.cardIcon}
        />
      ) : null}
      <Text style={[styles.cardLabel, selected ? styles.cardLabelActive : null]}>
        {label}
      </Text>
      {selected ? (
        <Ionicons name="checkmark-circle" size={24} color={Colors.dark.primary} />
      ) : null}
    </Pressable>
  );
}

function CheckboxItem({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Pressable style={styles.checkboxRow} onPress={onToggle}>
      <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]}>
        {checked ? <Ionicons name="checkmark" size={16} color={Colors.dark.backgroundRoot} /> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function Step1Welcome({ onNext }: StepProps) {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.welcomeContent}>
        <View style={styles.welcomeIconContainer}>
          <Ionicons name="hand-right-outline" size={60} color={Colors.dark.primary} />
        </View>
        
        <Text style={styles.welcomeTitle}>Welcome, Coach</Text>
        <Text style={styles.welcomeSubtitle}>
          You're not just training players — you're shaping their journey.
        </Text>
        
        <View style={styles.roleList}>
          <View style={styles.roleItem}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
            <Text style={styles.roleText}>You manage sessions</Text>
          </View>
          <View style={styles.roleItem}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
            <Text style={styles.roleText}>You validate progress</Text>
          </View>
          <View style={styles.roleItem}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
            <Text style={styles.roleText}>You influence motivation</Text>
          </View>
        </View>
      </Animated.View>
      
      <View style={styles.bottomAction}>
        <Pressable style={styles.primaryButton} onPress={onNext}>
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.backgroundRoot} />
        </Pressable>
      </View>
    </View>
  );
}

function Step2HowGlowWorks({ data, setData, onNext }: StepProps) {
  const insets = useSafeAreaInsets();
  const canContinue = data.acknowledgements.glowRules;
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>How Glow Works</Text>
          <Text style={styles.stepSubtitle}>Understanding the system helps you coach effectively</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="star-outline" size={24} color={Colors.dark.xpCyan} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Skills are not XP</Text>
                <Text style={styles.infoDescription}>
                  Skill development is directional and qualitative. XP rewards engagement and effort.
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="analytics-outline" size={24} color={Colors.dark.primary} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>XP is not Level</Text>
                <Text style={styles.infoDescription}>
                  Level is based on overall progression. XP is a motivational tool, not a performance metric.
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="eye-off-outline" size={24} color={Colors.dark.textSecondary} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Players don't see numbers</Text>
                <Text style={styles.infoDescription}>
                  Players see progress indicators, not raw scores. You don't need to rate everything.
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.confirmSection}>
            <CheckboxItem
              checked={data.acknowledgements.glowRules}
              onToggle={() => setData(prev => ({
                ...prev,
                acknowledgements: {
                  ...prev.acknowledgements,
                  glowRules: !prev.acknowledgements.glowRules,
                },
              }))}
              label="I understand how the Glow system works"
            />
          </View>
        </Animated.View>
      </ScrollView>
      
      <View style={styles.bottomAction}>
        <Pressable
          style={[styles.primaryButton, !canContinue ? styles.primaryButtonDisabled : null]}
          onPress={canContinue ? onNext : undefined}
          disabled={!canContinue}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.backgroundRoot} />
        </Pressable>
      </View>
    </View>
  );
}

function Step3FeedbackExpectations({ data, setData, onNext }: StepProps) {
  const insets = useSafeAreaInsets();
  const canContinue = data.acknowledgements.feedbackRules;
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>Giving Feedback</Text>
          <Text style={styles.stepSubtitle}>Keep it simple and honest</Text>
          
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackTitle}>Feedback = Observation, not Judgment</Text>
            <Text style={styles.feedbackDescription}>
              Take 30-60 seconds per session. Focus on what moved, not everything.
            </Text>
          </View>
          
          <Text style={styles.exampleLabel}>Good Examples:</Text>
          <View style={styles.exampleCard}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
            <Text style={styles.exampleText}>"Footwork improved"</Text>
          </View>
          <View style={styles.exampleCard}>
            <Ionicons name="alert-circle" size={20} color={Colors.dark.accentWarning} />
            <Text style={styles.exampleText}>"Focus needs work"</Text>
          </View>
          
          <View style={styles.confirmSection}>
            <CheckboxItem
              checked={data.acknowledgements.feedbackRules}
              onToggle={() => setData(prev => ({
                ...prev,
                acknowledgements: {
                  ...prev.acknowledgements,
                  feedbackRules: !prev.acknowledgements.feedbackRules,
                },
              }))}
              label="I will give honest, constructive feedback"
            />
          </View>
        </Animated.View>
      </ScrollView>
      
      <View style={styles.bottomAction}>
        <Pressable
          style={[styles.primaryButton, !canContinue ? styles.primaryButtonDisabled : null]}
          onPress={canContinue ? onNext : undefined}
          disabled={!canContinue}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.backgroundRoot} />
        </Pressable>
      </View>
    </View>
  );
}

function Step4AttendanceFairness({ data, setData, onNext }: StepProps) {
  const insets = useSafeAreaInsets();
  const canContinue = data.acknowledgements.attendanceRules;
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>Attendance & Fairness</Text>
          <Text style={styles.stepSubtitle}>Why accurate attendance matters</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="flame-outline" size={24} color={Colors.dark.accentWarning} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Attendance affects streaks</Text>
                <Text style={styles.infoDescription}>
                  Players build streaks based on consistent attendance. Accurate records keep it fair.
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={24} color={Colors.dark.xpCyan} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Late vs Absent matters</Text>
                <Text style={styles.infoDescription}>
                  Being 10 minutes late is different from not showing up. Mark it correctly.
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.scenarioBox}>
            <Text style={styles.scenarioTitle}>Scenario:</Text>
            <Text style={styles.scenarioText}>
              "A player is late 12 minutes — what do you do?"
            </Text>
            <Text style={styles.scenarioAnswer}>
              Mark as "Late" not "Absent". Holiday mode exists for planned absences.
            </Text>
          </View>
          
          <View style={styles.confirmSection}>
            <CheckboxItem
              checked={data.acknowledgements.attendanceRules}
              onToggle={() => setData(prev => ({
                ...prev,
                acknowledgements: {
                  ...prev.acknowledgements,
                  attendanceRules: !prev.acknowledgements.attendanceRules,
                },
              }))}
              label="I understand attendance impacts player progress"
            />
          </View>
        </Animated.View>
      </ScrollView>
      
      <View style={styles.bottomAction}>
        <Pressable
          style={[styles.primaryButton, !canContinue ? styles.primaryButtonDisabled : null]}
          onPress={canContinue ? onNext : undefined}
          disabled={!canContinue}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.backgroundRoot} />
        </Pressable>
      </View>
    </View>
  );
}

function Step5CoachIdentity({ data, setData, onNext }: StepProps) {
  const insets = useSafeAreaInsets();
  const canContinue = data.yearsExperience && data.philosophyTags.length > 0 && data.philosophyTags.length <= 3;
  
  const toggleBackground = (id: string) => {
    setData(prev => {
      const current = prev.backgroundTags;
      if (current.includes(id)) {
        return { ...prev, backgroundTags: current.filter(t => t !== id) };
      }
      return { ...prev, backgroundTags: [...current, id] };
    });
  };
  
  const togglePhilosophy = (id: string) => {
    setData(prev => {
      const current = prev.philosophyTags;
      if (current.includes(id)) {
        return { ...prev, philosophyTags: current.filter(t => t !== id) };
      }
      if (current.length >= 3) return prev;
      return { ...prev, philosophyTags: [...current, id] };
    });
  };
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>Your Coaching Profile</Text>
          <Text style={styles.stepSubtitle}>Players like to know who is guiding them</Text>
          
          <Text style={styles.sectionLabel}>Years of Experience</Text>
          <View style={styles.optionsGrid}>
            {EXPERIENCE_OPTIONS.map(option => (
              <Pressable
                key={option.id}
                style={[
                  styles.chipOption,
                  data.yearsExperience === option.id ? styles.chipOptionActive : null,
                ]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  setData(prev => ({ ...prev, yearsExperience: option.id }));
                }}
              >
                <Text style={[
                  styles.chipText,
                  data.yearsExperience === option.id ? styles.chipTextActive : null,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          
          <Text style={styles.sectionLabel}>Background (select all that apply)</Text>
          <View style={styles.optionsColumn}>
            {BACKGROUND_OPTIONS.map(option => (
              <SelectableCard
                key={option.id}
                selected={data.backgroundTags.includes(option.id)}
                onPress={() => toggleBackground(option.id)}
                label={option.label}
                icon={option.icon}
              />
            ))}
          </View>
          
          <Text style={styles.sectionLabel}>Coaching Philosophy (max 3)</Text>
          <Text style={styles.sectionHint}>
            {data.philosophyTags.length}/3 selected
          </Text>
          <View style={styles.optionsGrid}>
            {PHILOSOPHY_OPTIONS.map(option => (
              <Pressable
                key={option.id}
                style={[
                  styles.philosophyChip,
                  data.philosophyTags.includes(option.id) ? styles.philosophyChipActive : null,
                  data.philosophyTags.length >= 3 && !data.philosophyTags.includes(option.id) ? styles.chipDisabled : null,
                ]}
                onPress={() => togglePhilosophy(option.id)}
              >
                <Ionicons
                  name={option.icon as any}
                  size={18}
                  color={data.philosophyTags.includes(option.id) ? Colors.dark.primary : Colors.dark.textSecondary}
                />
                <Text style={[
                  styles.philosophyChipText,
                  data.philosophyTags.includes(option.id) ? styles.philosophyChipTextActive : null,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
      
      <View style={styles.bottomAction}>
        <Pressable
          style={[styles.primaryButton, !canContinue ? styles.primaryButtonDisabled : null]}
          onPress={canContinue ? onNext : undefined}
          disabled={!canContinue}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.backgroundRoot} />
        </Pressable>
      </View>
    </View>
  );
}

function Step6FinalConfirmation({ data, setData, onNext }: StepProps) {
  const insets = useSafeAreaInsets();
  const canContinue = data.acknowledgements.fairness;
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <View style={styles.finalIconContainer}>
            <Ionicons name="shield-checkmark" size={60} color={Colors.dark.primary} />
          </View>
          
          <Text style={styles.finalTitle}>Glow works because coaches are fair</Text>
          <Text style={styles.finalSubtitle}>
            Your commitment to honest coaching builds trust with players and parents.
          </Text>
          
          <View style={styles.confirmSection}>
            <CheckboxItem
              checked={data.acknowledgements.fairness}
              onToggle={() => setData(prev => ({
                ...prev,
                acknowledgements: {
                  ...prev.acknowledgements,
                  fairness: !prev.acknowledgements.fairness,
                },
              }))}
              label="I coach responsibly and understand misuse is monitored"
            />
          </View>
          
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Your Profile Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Experience:</Text>
              <Text style={styles.summaryValue}>{data.yearsExperience || "Not set"} years</Text>
            </View>
            {data.backgroundTags.length > 0 ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Background:</Text>
                <Text style={styles.summaryValue}>
                  {data.backgroundTags.map(t => 
                    BACKGROUND_OPTIONS.find(o => o.id === t)?.label
                  ).join(", ")}
                </Text>
              </View>
            ) : null}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Philosophy:</Text>
              <Text style={styles.summaryValue}>
                {data.philosophyTags.map(t => 
                  PHILOSOPHY_OPTIONS.find(o => o.id === t)?.label
                ).join(", ")}
              </Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
      
      <View style={styles.bottomAction}>
        <Pressable
          style={[styles.primaryButton, styles.finalButton, !canContinue ? styles.primaryButtonDisabled : null]}
          onPress={canContinue ? onNext : undefined}
          disabled={!canContinue}
        >
          <Text style={styles.primaryButtonText}>Start Coaching</Text>
          <Ionicons name="rocket" size={20} color={Colors.dark.backgroundRoot} />
        </Pressable>
      </View>
    </View>
  );
}

interface CoachOnboardingScreenProps {
  onComplete: () => void;
}

export default function CoachOnboardingScreen({ onComplete }: CoachOnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    acknowledgements: {
      glowRules: false,
      feedbackRules: false,
      attendanceRules: false,
      fairness: false,
    },
    yearsExperience: null,
    backgroundTags: [],
    philosophyTags: [],
    publicQuote: "",
  });
  
  const saveOnboardingMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/coach/me/onboarding", {
        yearsExperience: data.yearsExperience,
        backgroundTags: data.backgroundTags,
        philosophyTags: data.philosophyTags,
        acknowledgements: {
          fairness: data.acknowledgements.fairness,
          feedbackRules: data.acknowledgements.feedbackRules,
          attendanceRules: data.acknowledgements.attendanceRules,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/dashboard"] });
      onComplete();
    },
    onError: (error) => {
      console.error("Onboarding save error:", error);
    },
  });
  
  const totalSteps = 6;
  
  const goToNext = () => {
    if (currentStep < totalSteps - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      flatListRef.current?.scrollToIndex({ index: nextStep, animated: true });
    } else {
      saveOnboardingMutation.mutate();
    }
  };
  
  const steps = [
    { key: "welcome", Component: Step1Welcome },
    { key: "glow", Component: Step2HowGlowWorks },
    { key: "feedback", Component: Step3FeedbackExpectations },
    { key: "attendance", Component: Step4AttendanceFairness },
    { key: "identity", Component: Step5CoachIdentity },
    { key: "confirm", Component: Step6FinalConfirmation },
  ];
  
  const renderStep = ({ item }: { item: typeof steps[0] }) => {
    const { Component } = item;
    return (
      <View style={styles.stepWrapper}>
        <Component data={data} setData={setData} onNext={goToNext} />
      </View>
    );
  };
  
  return (
    <LinearGradient
      colors={[Colors.dark.backgroundRoot, "#0D1117", Colors.dark.backgroundRoot]}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
        <Text style={styles.stepIndicator}>
          Step {currentStep + 1} of {totalSteps}
        </Text>
      </View>
      
      <FlatList
        ref={flatListRef}
        data={steps}
        renderItem={renderStep}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
  },
  progressContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: Spacing.sm,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.border,
  },
  progressDotActive: {
    backgroundColor: Colors.dark.primary,
  },
  stepIndicator: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  stepWrapper: {
    width: SCREEN_WIDTH,
  },
  stepContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  scrollContent: {
    flex: 1,
  },
  welcomeContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  welcomeIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(46, 204, 64, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  welcomeTitle: {
    ...Typography.h1,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  welcomeSubtitle: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  roleList: {
    alignSelf: "stretch",
    gap: Spacing.md,
  },
  roleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  roleText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  stepTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xl,
  },
  infoCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  infoDescription: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  confirmSection: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  checkboxLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  feedbackBox: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  feedbackTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  feedbackDescription: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  exampleLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
  },
  exampleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  exampleText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  scenarioBox: {
    backgroundColor: "rgba(46, 204, 64, 0.1)",
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginTop: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.dark.primary,
  },
  scenarioTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.dark.primary,
    marginBottom: Spacing.sm,
  },
  scenarioText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontStyle: "italic",
    marginBottom: Spacing.sm,
  },
  scenarioAnswer: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  sectionLabel: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  sectionHint: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  optionsColumn: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  chipOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  chipOptionActive: {
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    borderColor: Colors.dark.primary,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  chipTextActive: {
    color: Colors.dark.primary,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  philosophyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  philosophyChipActive: {
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    borderColor: Colors.dark.primary,
  },
  philosophyChipText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  philosophyChipTextActive: {
    color: Colors.dark.primary,
  },
  selectableCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  selectableCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(46, 204, 64, 0.1)",
  },
  selectableCardDisabled: {
    opacity: 0.5,
  },
  cardIcon: {
    marginRight: Spacing.md,
  },
  cardLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  cardLabelActive: {
    color: Colors.dark.primary,
  },
  finalIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(46, 204, 64, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: Spacing.xl,
    marginTop: Spacing.xl,
  },
  finalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  finalSubtitle: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  summaryCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
  },
  summaryTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  summaryValue: {
    ...Typography.caption,
    color: Colors.dark.text,
    flex: 1,
    textAlign: "right",
  },
  bottomAction: {
    paddingVertical: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    ...Typography.h4,
    color: Colors.dark.backgroundRoot,
  },
  finalButton: {
    backgroundColor: Colors.dark.primary,
  },
});
