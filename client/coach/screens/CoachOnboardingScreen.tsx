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
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
        <View key={index} style={styles.progressDotWrapper}>
          <LinearGradient
            colors={index <= currentStep 
              ? [Colors.dark.primary, Colors.dark.xpCyan] 
              : [Colors.dark.backgroundSecondary, Colors.dark.backgroundSecondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressDot, index <= currentStep && styles.progressDotActive]}
          />
          {index <= currentStep && (
            <View style={styles.progressDotGlow} />
          )}
        </View>
      ))}
    </View>
  );
}

function GamingButton({ 
  onPress, 
  title, 
  icon,
  disabled = false,
  colors = [Colors.dark.primary, "#1FA030"],
}: { 
  onPress: () => void; 
  title: string; 
  icon?: string;
  disabled?: boolean;
  colors?: string[];
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[styles.gamingButton, animatedStyle, disabled && styles.gamingButtonDisabled]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gamingButtonGradient}
      >
        <Text style={styles.gamingButtonText}>{title}</Text>
        {icon ? (
          <Ionicons name={icon as any} size={20} color={Colors.dark.buttonText} />
        ) : null}
      </LinearGradient>
    </AnimatedPressable>
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
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(0.98, { damping: 15, stiffness: 400 });
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  return (
    <AnimatedPressable
      style={[
        styles.selectableCard,
        selected && styles.selectableCardActive,
        disabled && styles.selectableCardDisabled,
        animatedStyle,
      ]}
      onPress={() => {
        if (!disabled) {
          if (Platform.OS !== "web") Haptics.selectionAsync();
          onPress();
        }
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {selected && (
        <LinearGradient
          colors={[`${Colors.dark.primary}20`, "transparent"]}
          style={styles.cardGradientOverlay}
        />
      )}
      {icon ? (
        <Ionicons
          name={icon as any}
          size={24}
          color={selected ? Colors.dark.xpCyan : Colors.dark.textSecondary}
          style={styles.cardIcon}
        />
      ) : null}
      <Text style={[styles.cardLabel, selected && styles.cardLabelActive]}>
        {label}
      </Text>
      {selected ? (
        <Ionicons name="checkmark-circle" size={24} color={Colors.dark.primary} />
      ) : null}
    </AnimatedPressable>
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
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Ionicons name="checkmark" size={16} color={Colors.dark.buttonText} /> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function Step1Welcome({ onNext }: StepProps) {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerTopLine}
      />
      
      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.welcomeContent}>
        <View style={styles.welcomeIconContainer}>
          <LinearGradient
            colors={[`${Colors.dark.primary}30`, `${Colors.dark.xpCyan}20`]}
            style={StyleSheet.absoluteFillObject}
          />
          <Ionicons name="hand-right-outline" size={60} color={Colors.dark.primary} />
        </View>
        
        <Text style={styles.welcomeTitle}>WELCOME, COACH</Text>
        <Text style={styles.welcomeSubtitle}>
          You&apos;re not just training players — you&apos;re shaping their journey.
        </Text>
        
        <View style={styles.roleList}>
          <View style={styles.roleItem}>
            <View style={styles.roleIconBg}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
            </View>
            <Text style={styles.roleText}>You manage sessions</Text>
          </View>
          <View style={styles.roleItem}>
            <View style={styles.roleIconBg}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
            </View>
            <Text style={styles.roleText}>You validate progress</Text>
          </View>
          <View style={styles.roleItem}>
            <View style={styles.roleIconBg}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
            </View>
            <Text style={styles.roleText}>You influence motivation</Text>
          </View>
        </View>
      </Animated.View>
      
      <View style={styles.bottomAction}>
        <GamingButton onPress={onNext} title="CONTINUE" icon="arrow-forward" />
      </View>
    </View>
  );
}

function Step2HowGlowWorks({ data, setData, onNext }: StepProps) {
  const insets = useSafeAreaInsets();
  const canContinue = data.acknowledgements.glowRules;
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerTopLine}
      />
      
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>HOW GLOW WORKS</Text>
          <Text style={styles.stepSubtitle}>Understanding the system helps you coach effectively</Text>
          
          <View style={styles.glassCard}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIconContainer, { backgroundColor: `${Colors.dark.xpCyan}15` }]}>
                <Ionicons name="star-outline" size={24} color={Colors.dark.xpCyan} />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Skills are not XP</Text>
                <Text style={styles.infoDescription}>
                  Skill development is directional and qualitative. XP rewards engagement and effort.
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.glassCard}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIconContainer, { backgroundColor: `${Colors.dark.primary}15` }]}>
                <Ionicons name="analytics-outline" size={24} color={Colors.dark.primary} />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>XP is not Level</Text>
                <Text style={styles.infoDescription}>
                  Level is based on overall progression. XP is a motivational tool, not a performance metric.
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.glassCard}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIconContainer, { backgroundColor: `${Colors.dark.textSecondary}15` }]}>
                <Ionicons name="eye-off-outline" size={24} color={Colors.dark.textSecondary} />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Players don&apos;t see numbers</Text>
                <Text style={styles.infoDescription}>
                  Players see progress indicators, not raw scores. You don&apos;t need to rate everything.
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
        <GamingButton
          onPress={canContinue ? onNext : () => {}}
          title="CONTINUE"
          icon="arrow-forward"
          disabled={!canContinue}
        />
      </View>
    </View>
  );
}

function Step3FeedbackExpectations({ data, setData, onNext }: StepProps) {
  const insets = useSafeAreaInsets();
  const canContinue = data.acknowledgements.feedbackRules;
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerTopLine}
      />
      
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>GIVING FEEDBACK</Text>
          <Text style={styles.stepSubtitle}>Keep it simple and honest</Text>
          
          <View style={styles.glassCard}>
            <LinearGradient
              colors={[`${Colors.dark.primary}15`, "transparent"]}
              style={styles.cardGradientOverlay}
            />
            <Text style={styles.feedbackTitle}>Feedback = Observation, not Judgment</Text>
            <Text style={styles.feedbackDescription}>
              Take 30-60 seconds per session. Focus on what moved, not everything.
            </Text>
          </View>
          
          <Text style={styles.exampleLabel}>GOOD EXAMPLES:</Text>
          <View style={styles.exampleCard}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
            <Text style={styles.exampleText}>&quot;Footwork improved&quot;</Text>
          </View>
          <View style={styles.exampleCard}>
            <Ionicons name="alert-circle" size={20} color={Colors.dark.gold} />
            <Text style={styles.exampleText}>&quot;Focus needs work&quot;</Text>
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
        <GamingButton
          onPress={canContinue ? onNext : () => {}}
          title="CONTINUE"
          icon="arrow-forward"
          disabled={!canContinue}
        />
      </View>
    </View>
  );
}

function Step4AttendanceFairness({ data, setData, onNext }: StepProps) {
  const insets = useSafeAreaInsets();
  const canContinue = data.acknowledgements.attendanceRules;
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerTopLine}
      />
      
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>ATTENDANCE & FAIRNESS</Text>
          <Text style={styles.stepSubtitle}>Why accurate attendance matters</Text>
          
          <View style={styles.glassCard}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIconContainer, { backgroundColor: `${Colors.dark.gold}15` }]}>
                <Ionicons name="flame-outline" size={24} color={Colors.dark.gold} />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Attendance affects streaks</Text>
                <Text style={styles.infoDescription}>
                  Players build streaks based on consistent attendance. Accurate records keep it fair.
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.glassCard}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIconContainer, { backgroundColor: `${Colors.dark.xpCyan}15` }]}>
                <Ionicons name="time-outline" size={24} color={Colors.dark.xpCyan} />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Late vs Absent matters</Text>
                <Text style={styles.infoDescription}>
                  Being 10 minutes late is different from not showing up. Mark it correctly.
                </Text>
              </View>
            </View>
          </View>
          
          <View style={[styles.glassCard, styles.scenarioBox]}>
            <LinearGradient
              colors={[`${Colors.dark.xpCyan}10`, "transparent"]}
              style={styles.cardGradientOverlay}
            />
            <Text style={styles.scenarioTitle}>SCENARIO:</Text>
            <Text style={styles.scenarioText}>
              &quot;A player is late 12 minutes — what do you do?&quot;
            </Text>
            <Text style={styles.scenarioAnswer}>
              Mark as &quot;Late&quot; not &quot;Absent&quot;. Holiday mode exists for planned absences.
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
        <GamingButton
          onPress={canContinue ? onNext : () => {}}
          title="CONTINUE"
          icon="arrow-forward"
          disabled={!canContinue}
        />
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
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerTopLine}
      />
      
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>YOUR COACHING PROFILE</Text>
          <Text style={styles.stepSubtitle}>Players like to know who is guiding them</Text>
          
          <Text style={styles.sectionLabel}>YEARS OF EXPERIENCE</Text>
          <View style={styles.optionsGrid}>
            {EXPERIENCE_OPTIONS.map(option => (
              <Pressable
                key={option.id}
                style={[
                  styles.chipOption,
                  data.yearsExperience === option.id && styles.chipOptionActive,
                ]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  setData(prev => ({ ...prev, yearsExperience: option.id }));
                }}
              >
                {data.yearsExperience === option.id && (
                  <LinearGradient
                    colors={[`${Colors.dark.primary}30`, `${Colors.dark.xpCyan}20`]}
                    style={StyleSheet.absoluteFillObject}
                  />
                )}
                <Text style={[
                  styles.chipText,
                  data.yearsExperience === option.id && styles.chipTextActive,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          
          <Text style={styles.sectionLabel}>BACKGROUND (SELECT ALL THAT APPLY)</Text>
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
          
          <Text style={styles.sectionLabel}>COACHING PHILOSOPHY (MAX 3)</Text>
          <View style={styles.philosophyCounter}>
            <Text style={styles.sectionHint}>
              {data.philosophyTags.length}/3 selected
            </Text>
          </View>
          <View style={styles.optionsGrid}>
            {PHILOSOPHY_OPTIONS.map(option => (
              <Pressable
                key={option.id}
                style={[
                  styles.philosophyChip,
                  data.philosophyTags.includes(option.id) && styles.philosophyChipActive,
                  data.philosophyTags.length >= 3 && !data.philosophyTags.includes(option.id) && styles.chipDisabled,
                ]}
                onPress={() => togglePhilosophy(option.id)}
              >
                {data.philosophyTags.includes(option.id) && (
                  <LinearGradient
                    colors={[`${Colors.dark.primary}30`, `${Colors.dark.xpCyan}20`]}
                    style={StyleSheet.absoluteFillObject}
                  />
                )}
                <Ionicons
                  name={option.icon as any}
                  size={18}
                  color={data.philosophyTags.includes(option.id) ? Colors.dark.xpCyan : Colors.dark.textSecondary}
                />
                <Text style={[
                  styles.philosophyChipText,
                  data.philosophyTags.includes(option.id) && styles.philosophyChipTextActive,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
      
      <View style={styles.bottomAction}>
        <GamingButton
          onPress={canContinue ? onNext : () => {}}
          title="CONTINUE"
          icon="arrow-forward"
          disabled={!canContinue}
        />
      </View>
    </View>
  );
}

function Step6FinalConfirmation({ data, setData, onNext }: StepProps) {
  const insets = useSafeAreaInsets();
  const canContinue = data.acknowledgements.fairness;
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerTopLine}
      />
      
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <View style={styles.finalIconContainer}>
            <LinearGradient
              colors={[`${Colors.dark.primary}30`, `${Colors.dark.xpCyan}20`]}
              style={StyleSheet.absoluteFillObject}
            />
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
          
          <View style={styles.glassCard}>
            <LinearGradient
              colors={[`${Colors.dark.xpCyan}15`, "transparent"]}
              style={styles.cardGradientOverlay}
            />
            <Text style={styles.summaryTitle}>YOUR PROFILE SUMMARY</Text>
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
        <GamingButton
          onPress={canContinue ? onNext : () => {}}
          title="START COACHING"
          icon="rocket"
          disabled={!canContinue}
          colors={[Colors.dark.successNeon, Colors.dark.primary]}
        />
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
        publicQuote: data.publicQuote,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/me"] });
      onComplete();
    },
    onError: (error) => {
      console.error("Failed to save onboarding:", error);
      onComplete();
    },
  });
  
  const STEPS = [
    Step1Welcome,
    Step2HowGlowWorks,
    Step3FeedbackExpectations,
    Step4AttendanceFairness,
    Step5CoachIdentity,
    Step6FinalConfirmation,
  ];
  
  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentStep(prev => prev + 1);
      flatListRef.current?.scrollToIndex({ index: currentStep + 1, animated: true });
    } else {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      saveOnboardingMutation.mutate();
    }
  };
  
  const renderStep = ({ item: StepComponent, index }: { item: React.FC<StepProps>; index: number }) => (
    <View style={{ width: SCREEN_WIDTH }}>
      <StepComponent data={data} setData={setData} onNext={handleNext} />
    </View>
  );
  
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.progressWrapper, { paddingTop: insets.top + Spacing.md }]}>
        <ProgressBar currentStep={currentStep} totalSteps={STEPS.length} />
      </View>
      <FlatList
        ref={flatListRef}
        data={STEPS}
        renderItem={renderStep}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        keyExtractor={(_, index) => `step-${index}`}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerTopLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  progressWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: Spacing.xl,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingTop: Spacing.md,
  },
  progressDotWrapper: {
    alignItems: "center",
  },
  progressDot: {
    width: 32,
    height: 4,
    borderRadius: 2,
  },
  progressDotActive: {
  },
  progressDotGlow: {
    position: "absolute",
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.primary,
    opacity: 0.3,
  },
  stepContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  scrollContent: {
    flex: 1,
    paddingTop: Spacing.xl * 2,
  },
  welcomeContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Spacing.xl * 2,
  },
  welcomeIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  welcomeTitle: {
    ...Typography.h1,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.md,
    letterSpacing: 2,
  },
  welcomeSubtitle: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  roleList: {
    width: "100%",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.lg,
  },
  roleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  roleIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${Colors.dark.successNeon}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  roleText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  stepTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
    letterSpacing: 1,
  },
  stepSubtitle: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xl,
  },
  glassCard: {
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
    overflow: "hidden",
  },
  cardGradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  infoIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  infoDescription: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  feedbackTitle: {
    ...Typography.h3,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.sm,
  },
  feedbackDescription: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
  },
  exampleLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
    letterSpacing: 1,
  },
  exampleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}15`,
  },
  exampleText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontStyle: "italic",
  },
  scenarioBox: {
  },
  scenarioTitle: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.sm,
    letterSpacing: 1,
  },
  scenarioText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontStyle: "italic",
    marginBottom: Spacing.md,
  },
  scenarioAnswer: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  confirmSection: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: `${Colors.dark.primary}20`,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.dark.textSecondary,
    alignItems: "center",
    justifyContent: "center",
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
  sectionLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
    letterSpacing: 1,
  },
  philosophyCounter: {
    marginBottom: Spacing.sm,
  },
  sectionHint: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  optionsColumn: {
    gap: Spacing.sm,
  },
  chipOption: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
    overflow: "hidden",
  },
  chipOptionActive: {
    borderColor: Colors.dark.primary,
  },
  chipText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
  },
  chipTextActive: {
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  chipDisabled: {
    opacity: 0.4,
  },
  selectableCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
    overflow: "hidden",
  },
  selectableCardActive: {
    borderColor: Colors.dark.primary,
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
    color: Colors.dark.xpCyan,
  },
  philosophyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
    overflow: "hidden",
  },
  philosophyChipActive: {
    borderColor: Colors.dark.primary,
  },
  philosophyChipText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
  },
  philosophyChipTextActive: {
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  finalIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: Spacing.xl,
    marginTop: Spacing.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
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
  summaryTitle: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.md,
    letterSpacing: 1,
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
  gamingButton: {
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  gamingButtonDisabled: {
    opacity: 0.5,
  },
  gamingButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  gamingButtonText: {
    ...Typography.h4,
    color: Colors.dark.buttonText,
    letterSpacing: 1,
  },
});
