import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
} from "react-native-reanimated";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, FontSizes, Backgrounds, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { BaselineFlowCard, AnimatedCheckbox, ProgressRing } from "./BaselineFlowCard";
import { PostActionModal } from "@/components/PostActionModal";
import { AnimatedCheck } from "@/components/AnimatedCheck";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Player {
  id: string;
  name: string;
  age?: number | null;
  dateOfBirth?: string | null;
  ballLevel?: string | null;
}

interface PremiumBaselineFlowProps {
  visible: boolean;
  player: Player | null;
  onClose: () => void;
  onComplete: () => void;
  onStartDeepAssessment?: () => void;
}

type FlowStep = "intro" | "intake" | "level-suggest" | "requirements" | "summary" | "complete";
type TennisExperience = "0-6m" | "6-18m" | "18m+";
type PlaysCompetition = "never" | "sometimes" | "often";
type ServeAbility = "none" | "basic" | "consistent";

interface LevelSuggestion {
  suggestedLevelId: string;
  suggestedStage: string;
  suggestedRank: number;
  confidenceScore: number;
  age: number;
  isAdult: boolean;
}

interface LevelSkill {
  id: string;
  name: string;
  pillar: string;
  stage: string;
  targetScore: number;
  weight: number;
  isRequired: boolean;
}

interface LevelDetails {
  id: string;
  stage: string;
  rank: number;
  displayNamePlayer: string;
  displayNameCoach: string;
  identity: string;
  promotionRequirements: {
    skillAchievedCount: number;
    pillarMinimum: Record<string, number>;
    tests: string[];
    evidenceMin: number;
    matchEvents: number;
    matchWins?: number;
  };
  skillsByPillar: Record<string, LevelSkill[]>;
  tests: any[];
}

const PILLARS = [
  { id: "TECHNIQUE", name: "Technique", icon: "tennisball" as keyof typeof Ionicons.glyphMap, color: "#10B981" },
  { id: "TACTICAL", name: "Tactical", icon: "bulb" as keyof typeof Ionicons.glyphMap, color: "#F59E0B" },
  { id: "PHYSICAL", name: "Physical", icon: "barbell" as keyof typeof Ionicons.glyphMap, color: "#EF4444" },
  { id: "MENTAL", name: "Mental", icon: "brain" as keyof typeof Ionicons.glyphMap, color: "#8B5CF6" },
  { id: "SOCIAL", name: "Social", icon: "people" as keyof typeof Ionicons.glyphMap, color: "#EC4899" },
  { id: "MATCH", name: "Match", icon: "trophy" as keyof typeof Ionicons.glyphMap, color: "#3B82F6" },
];

const STAGE_COLORS: Record<string, string> = {
  BLUE: "#60A5FA",
  RED: "#EF4444",
  ORANGE: "#F97316",
  GREEN: "#22C55E",
  YELLOW: "#FACC15",
  GLOW: GlowColors.primary,
};

const OVERRIDE_REASONS = [
  { value: "player_clearly_advanced", label: "Player clearly advanced" },
  { value: "late_starter_athletic", label: "Late starter, athletic" },
  { value: "other_academy", label: "Came from another academy" },
  { value: "competition_experience", label: "Competition experience" },
  { value: "age_mismatch", label: "Age doesn't match ability" },
];

export function PremiumBaselineFlow({
  visible,
  player,
  onClose,
  onComplete,
  onStartDeepAssessment,
}: PremiumBaselineFlowProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  
  // Flow state
  const [step, setStep] = useState<FlowStep>("intro");
  const [currentPillarIndex, setCurrentPillarIndex] = useState(0);
  
  // Intake state
  const [tennisExperience, setTennisExperience] = useState<TennisExperience>("0-6m");
  const [playsCompetition, setPlaysCompetition] = useState<PlaysCompetition>("never");
  const [canRallyFive, setCanRallyFive] = useState(false);
  const [serveAbility, setServeAbility] = useState<ServeAbility>("none");
  
  // Level state
  const [suggestion, setSuggestion] = useState<LevelSuggestion | null>(null);
  const [confirmedLevel, setConfirmedLevel] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState<string | null>(null);
  
  // Requirements checklist state
  const [checkedSkills, setCheckedSkills] = useState<Set<string>>(new Set());
  
  // UI state
  const [showPostActionModal, setShowPostActionModal] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  
  // Fetch level details when we have a confirmed level
  const { data: levelDetails, isLoading: loadingLevel } = useQuery<LevelDetails>({
    queryKey: [`/api/glow/levels/${confirmedLevel}`],
    enabled: !!confirmedLevel && step === "requirements",
  });
  
  // API mutations
  const suggestMutation = useMutation({
    mutationFn: async () => {
      if (!player) throw new Error("No player");
      return apiRequest("POST", `/api/players/${player.id}/baseline/suggest-level`, {
        tennisExperience,
        playsCompetition,
        canRallyFive,
        serveAbility,
      });
    },
    onSuccess: (data) => {
      setSuggestion(data);
      setConfirmedLevel(data.suggestedLevelId);
    },
  });
  
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!player || !suggestion) throw new Error("Missing data");
      
      // Build pillar ratings from checked skills
      const pillarProgress = PILLARS.reduce((acc, pillar) => {
        const pillarSkills = levelDetails?.skillsByPillar[pillar.id] || [];
        const checkedCount = pillarSkills.filter(s => checkedSkills.has(s.id)).length;
        const total = pillarSkills.length;
        acc[pillar.id.toLowerCase()] = total > 0 ? Math.round((checkedCount / total) * 3) : 1;
        return acc;
      }, {} as Record<string, number>);
      
      return apiRequest("POST", `/api/players/${player.id}/baseline`, {
        suggestedLevelId: suggestion.suggestedLevelId,
        confirmedLevelId: confirmedLevel,
        confidenceScore: suggestion.confidenceScore,
        tennisExperience,
        playsCompetition,
        canRallyFive,
        serveAbility,
        ...pillarProgress,
        overrideReason: confirmedLevel !== suggestion.suggestedLevelId ? overrideReason : null,
        checkedSkillIds: Array.from(checkedSkills),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/baseline-stats"] });
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setStep("complete");
      }, 300);
    },
  });
  
  // Reset state when modal opens
  useEffect(() => {
    if (visible && player) {
      setStep("intro");
      setCurrentPillarIndex(0);
      setTennisExperience("0-6m");
      setPlaysCompetition("never");
      setCanRallyFive(false);
      setServeAbility("none");
      setSuggestion(null);
      setConfirmedLevel(null);
      setOverrideReason(null);
      setCheckedSkills(new Set());
      setShowSuccessAnimation(false);
      setShowPostActionModal(false);
    }
  }, [visible, player?.id]);
  
  // Calculate total steps
  const getTotalSteps = () => {
    const requirementPillars = levelDetails?.skillsByPillar 
      ? Object.keys(levelDetails.skillsByPillar).length 
      : 6;
    return 3 + requirementPillars + 1; // intro + intake + level-suggest + pillars + summary
  };
  
  const getCurrentStepNumber = () => {
    switch (step) {
      case "intro": return 1;
      case "intake": return 2;
      case "level-suggest": return 3;
      case "requirements": return 4 + currentPillarIndex;
      case "summary": return getTotalSteps();
      default: return 1;
    }
  };
  
  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    switch (step) {
      case "intro":
        setStep("intake");
        break;
      case "intake":
        suggestMutation.mutate();
        setStep("level-suggest");
        break;
      case "level-suggest":
        setStep("requirements");
        setCurrentPillarIndex(0);
        break;
      case "requirements":
        const pillarKeys = levelDetails?.skillsByPillar 
          ? Object.keys(levelDetails.skillsByPillar) 
          : [];
        if (currentPillarIndex < pillarKeys.length - 1) {
          setCurrentPillarIndex(prev => prev + 1);
        } else {
          setStep("summary");
        }
        break;
      case "summary":
        saveMutation.mutate();
        break;
    }
  };
  
  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    switch (step) {
      case "intake":
        setStep("intro");
        break;
      case "level-suggest":
        setStep("intake");
        break;
      case "requirements":
        if (currentPillarIndex > 0) {
          setCurrentPillarIndex(prev => prev - 1);
        } else {
          setStep("level-suggest");
        }
        break;
      case "summary":
        const pillarKeys = levelDetails?.skillsByPillar 
          ? Object.keys(levelDetails.skillsByPillar) 
          : [];
        setStep("requirements");
        setCurrentPillarIndex(Math.max(0, pillarKeys.length - 1));
        break;
    }
  };
  
  const toggleSkill = (skillId: string) => {
    setCheckedSkills(prev => {
      const newSet = new Set(prev);
      if (newSet.has(skillId)) {
        newSet.delete(skillId);
      } else {
        newSet.add(skillId);
      }
      return newSet;
    });
  };
  
  const renderIntroCard = () => (
    <BaselineFlowCard
      title="Start Baseline"
      subtitle={player?.name}
      icon="rocket"
      iconColor={GlowColors.primary}
      step={1}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      showBack={false}
      nextLabel="Let's Go"
      glowColor={GlowColors.primary}
    >
      <View style={styles.introContent}>
        <View style={styles.introIconWrapper}>
          <LinearGradient
            colors={[`${GlowColors.primary}30`, `${GlowColors.primary}10`]}
            style={styles.introIconGradient}
          >
            <Ionicons name="analytics" size={48} color={GlowColors.primary} />
          </LinearGradient>
        </View>
        
        <Text style={styles.introTitle}>Welcome to the Baseline Assessment</Text>
        <Text style={styles.introDescription}>
          In just a few steps, we'll determine the perfect starting level and track which skills {player?.name} already has.
        </Text>
        
        <View style={styles.introSteps}>
          <View style={styles.introStep}>
            <View style={[styles.introStepNumber, { backgroundColor: `${STAGE_COLORS.ORANGE}20` }]}>
              <Text style={[styles.introStepNumberText, { color: STAGE_COLORS.ORANGE }]}>1</Text>
            </View>
            <Text style={styles.introStepText}>Quick questions about experience</Text>
          </View>
          <View style={styles.introStep}>
            <View style={[styles.introStepNumber, { backgroundColor: `${STAGE_COLORS.GREEN}20` }]}>
              <Text style={[styles.introStepNumberText, { color: STAGE_COLORS.GREEN }]}>2</Text>
            </View>
            <Text style={styles.introStepText}>AI suggests the right level</Text>
          </View>
          <View style={styles.introStep}>
            <View style={[styles.introStepNumber, { backgroundColor: `${GlowColors.primary}20` }]}>
              <Text style={[styles.introStepNumberText, { color: GlowColors.primary }]}>3</Text>
            </View>
            <Text style={styles.introStepText}>Check off skills they can do</Text>
          </View>
        </View>
      </View>
    </BaselineFlowCard>
  );
  
  const renderIntakeCard = () => (
    <BaselineFlowCard
      title="Quick Intake"
      subtitle="Answer a few questions"
      icon="help-circle"
      iconColor={STAGE_COLORS.ORANGE}
      step={2}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel="Get Suggestion"
      nextDisabled={suggestMutation.isPending}
      glowColor={STAGE_COLORS.ORANGE}
    >
      <ScrollView style={styles.cardScrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.questionGroup}>
          <Text style={styles.questionLabel}>Tennis Experience</Text>
          <View style={styles.optionRow}>
            {(["0-6m", "6-18m", "18m+"] as TennisExperience[]).map((opt) => (
              <Pressable
                key={opt}
                style={[
                  styles.optionButton,
                  tennisExperience === opt && styles.optionButtonActive,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTennisExperience(opt);
                }}
              >
                <Text style={[
                  styles.optionText,
                  tennisExperience === opt && styles.optionTextActive,
                ]}>
                  {opt === "0-6m" ? "< 6 months" : opt === "6-18m" ? "6-18 months" : "18+ months"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        
        <View style={styles.questionGroup}>
          <Text style={styles.questionLabel}>Plays Competition</Text>
          <View style={styles.optionRow}>
            {(["never", "sometimes", "often"] as PlaysCompetition[]).map((opt) => (
              <Pressable
                key={opt}
                style={[
                  styles.optionButton,
                  playsCompetition === opt && styles.optionButtonActive,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPlaysCompetition(opt);
                }}
              >
                <Text style={[
                  styles.optionText,
                  playsCompetition === opt && styles.optionTextActive,
                ]}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        
        <View style={styles.questionGroup}>
          <Text style={styles.questionLabel}>Can Rally 5+ Balls</Text>
          <View style={styles.optionRow}>
            <Pressable
              style={[
                styles.optionButton,
                styles.optionButtonWide,
                canRallyFive && styles.optionButtonActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setCanRallyFive(true);
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color={canRallyFive ? GlowColors.primary : Colors.dark.textMuted} />
              <Text style={[styles.optionText, canRallyFive && styles.optionTextActive]}>Yes</Text>
            </Pressable>
            <Pressable
              style={[
                styles.optionButton,
                styles.optionButtonWide,
                !canRallyFive && styles.optionButtonActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setCanRallyFive(false);
              }}
            >
              <Ionicons name="close-circle" size={20} color={!canRallyFive ? Colors.dark.error : Colors.dark.textMuted} />
              <Text style={[styles.optionText, !canRallyFive && styles.optionTextActive]}>Not Yet</Text>
            </Pressable>
          </View>
        </View>
        
        <View style={styles.questionGroup}>
          <Text style={styles.questionLabel}>Serve Ability</Text>
          <View style={styles.optionRow}>
            {(["none", "basic", "consistent"] as ServeAbility[]).map((opt) => (
              <Pressable
                key={opt}
                style={[
                  styles.optionButton,
                  serveAbility === opt && styles.optionButtonActive,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setServeAbility(opt);
                }}
              >
                <Text style={[styles.optionText, serveAbility === opt && styles.optionTextActive]}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </BaselineFlowCard>
  );
  
  const renderLevelSuggestCard = () => {
    const stageColor = suggestion?.suggestedStage 
      ? STAGE_COLORS[suggestion.suggestedStage] || GlowColors.primary
      : GlowColors.primary;
    
    return (
      <BaselineFlowCard
        title="Level Suggestion"
        subtitle="Based on your answers"
        icon="sparkles"
        iconColor={stageColor}
        step={3}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel="Check Skills"
        nextDisabled={!suggestion}
        glowColor={stageColor}
      >
        <View style={styles.levelSuggestContent}>
          {suggestMutation.isPending || !suggestion ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={GlowColors.primary} />
              <Text style={styles.loadingText}>Analyzing...</Text>
            </View>
          ) : (
            <>
              <View style={[styles.levelBadge, { borderColor: stageColor }]}>
                <LinearGradient
                  colors={[`${stageColor}30`, `${stageColor}10`]}
                  style={styles.levelBadgeGradient}
                >
                  <Text style={[styles.levelBadgeStage, { color: stageColor }]}>
                    {suggestion.suggestedStage}
                  </Text>
                  <Text style={styles.levelBadgeRank}>{suggestion.suggestedRank}</Text>
                </LinearGradient>
              </View>
              
              <Text style={styles.levelSuggestTitle}>
                Suggested: {suggestion.suggestedStage} {suggestion.suggestedRank}
              </Text>
              
              <View style={styles.confidenceContainer}>
                <View style={styles.confidenceBar}>
                  <View 
                    style={[
                      styles.confidenceFill, 
                      { width: `${suggestion.confidenceScore}%`, backgroundColor: stageColor }
                    ]} 
                  />
                </View>
                <Text style={styles.confidenceText}>{suggestion.confidenceScore}% confidence</Text>
              </View>
              
              <Text style={styles.levelSuggestNote}>
                Tap "Check Skills" to see what skills are expected at this level
              </Text>
            </>
          )}
        </View>
      </BaselineFlowCard>
    );
  };
  
  const renderRequirementsCard = () => {
    if (!levelDetails?.skillsByPillar) {
      return (
        <BaselineFlowCard
          title="Loading Skills..."
          step={getCurrentStepNumber()}
          totalSteps={getTotalSteps()}
          onBack={handleBack}
        >
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={GlowColors.primary} />
          </View>
        </BaselineFlowCard>
      );
    }
    
    const pillarKeys = Object.keys(levelDetails.skillsByPillar);
    const currentPillarKey = pillarKeys[currentPillarIndex] || pillarKeys[0];
    const currentPillar = PILLARS.find(p => p.id === currentPillarKey);
    const skills = levelDetails.skillsByPillar[currentPillarKey] || [];
    const checkedCount = skills.filter(s => checkedSkills.has(s.id)).length;
    
    return (
      <BaselineFlowCard
        title={currentPillar?.name || currentPillarKey}
        subtitle={`${checkedCount}/${skills.length} skills checked`}
        icon={currentPillar?.icon || "list"}
        iconColor={currentPillar?.color || GlowColors.primary}
        step={getCurrentStepNumber()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel={currentPillarIndex < pillarKeys.length - 1 ? "Next Pillar" : "See Summary"}
        glowColor={currentPillar?.color}
      >
        <ScrollView style={styles.cardScrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.requirementsIntro}>
            Check the skills {player?.name} can already do:
          </Text>
          
          {skills.map((skill) => (
            <AnimatedCheckbox
              key={skill.id}
              checked={checkedSkills.has(skill.id)}
              onToggle={() => toggleSkill(skill.id)}
              label={skill.name}
              sublabel={skill.isRequired ? "Required for level" : undefined}
              color={currentPillar?.color}
            />
          ))}
          
          {skills.length === 0 && (
            <View style={styles.emptySkills}>
              <Ionicons name="checkmark-done-circle" size={40} color={Colors.dark.textMuted} />
              <Text style={styles.emptySkillsText}>No skills for this pillar at this level</Text>
            </View>
          )}
        </ScrollView>
      </BaselineFlowCard>
    );
  };
  
  const renderSummaryCard = () => {
    const totalSkills = levelDetails?.skillsByPillar 
      ? Object.values(levelDetails.skillsByPillar).flat().length 
      : 0;
    const totalChecked = checkedSkills.size;
    const progress = totalSkills > 0 ? totalChecked / totalSkills : 0;
    
    const stageColor = suggestion?.suggestedStage 
      ? STAGE_COLORS[suggestion.suggestedStage] || GlowColors.primary
      : GlowColors.primary;
    
    return (
      <BaselineFlowCard
        title="Summary"
        subtitle="Ready to save baseline"
        icon="checkmark-circle"
        iconColor={GlowColors.primary}
        step={getTotalSteps()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel={saveMutation.isPending ? "Saving..." : "Save Baseline"}
        nextDisabled={saveMutation.isPending}
        glowColor={GlowColors.primary}
      >
        <ScrollView style={styles.cardScrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryHeader}>
            <View style={[styles.summaryLevelBadge, { borderColor: stageColor }]}>
              <Text style={[styles.summaryLevelText, { color: stageColor }]}>
                {suggestion?.suggestedStage} {suggestion?.suggestedRank}
              </Text>
            </View>
            <Text style={styles.summaryPlayerName}>{player?.name}</Text>
          </View>
          
          <View style={styles.summaryProgress}>
            <View style={styles.summaryProgressRing}>
              <ProgressRing
                progress={progress}
                size={80}
                strokeWidth={6}
                color={GlowColors.primary}
              />
            </View>
            <View style={styles.summaryProgressInfo}>
              <Text style={styles.summaryProgressTitle}>{totalChecked}/{totalSkills} Skills</Text>
              <Text style={styles.summaryProgressSubtitle}>Checked off</Text>
            </View>
          </View>
          
          <View style={styles.pillarSummary}>
            {PILLARS.map((pillar) => {
              const skills = levelDetails?.skillsByPillar[pillar.id] || [];
              const checked = skills.filter(s => checkedSkills.has(s.id)).length;
              const pillarProgress = skills.length > 0 ? checked / skills.length : 0;
              
              if (skills.length === 0) return null;
              
              return (
                <View key={pillar.id} style={styles.pillarSummaryRow}>
                  <View style={[styles.pillarSummaryIcon, { backgroundColor: `${pillar.color}20` }]}>
                    <Ionicons name={pillar.icon} size={16} color={pillar.color} />
                  </View>
                  <Text style={styles.pillarSummaryName}>{pillar.name}</Text>
                  <View style={styles.pillarSummaryBar}>
                    <View 
                      style={[
                        styles.pillarSummaryFill, 
                        { width: `${pillarProgress * 100}%`, backgroundColor: pillar.color }
                      ]} 
                    />
                  </View>
                  <Text style={styles.pillarSummaryCount}>{checked}/{skills.length}</Text>
                </View>
              );
            })}
          </View>
          
          {onStartDeepAssessment && (
            <View style={styles.deepAssessmentOption}>
              <Text style={styles.deepAssessmentTitle}>Want to go deeper?</Text>
              <Text style={styles.deepAssessmentSubtitle}>
                The full assessment has 145 skills for detailed tracking
              </Text>
            </View>
          )}
        </ScrollView>
      </BaselineFlowCard>
    );
  };
  
  const renderCompleteCard = () => (
    <View style={styles.completeCard}>
      <LinearGradient
        colors={[`${GlowColors.primary}20`, "transparent"]}
        style={styles.completeGradient}
      >
        <AnimatedCheck variant="glow" size={80} />
        
        <Text style={styles.completeTitle}>Baseline Complete!</Text>
        <Text style={styles.completeSubtitle}>
          {player?.name}'s starting level and skills have been saved
        </Text>
        
        <View style={styles.completeActions}>
          <Pressable 
            style={styles.completePrimaryButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onComplete();
            }}
          >
            <LinearGradient
              colors={[GlowColors.primary, GlowColors.primaryDark]}
              style={styles.completePrimaryGradient}
            >
              <Text style={styles.completePrimaryText}>Done</Text>
            </LinearGradient>
          </Pressable>
          
          {onStartDeepAssessment && (
            <Pressable 
              style={styles.completeSecondaryButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onStartDeepAssessment();
              }}
            >
              <Ionicons name="analytics" size={20} color={Colors.dark.xpCyan} />
              <Text style={styles.completeSecondaryText}>Start Deep Assessment (145 skills)</Text>
            </Pressable>
          )}
        </View>
      </LinearGradient>
    </View>
  );
  
  const renderCurrentStep = () => {
    switch (step) {
      case "intro": return renderIntroCard();
      case "intake": return renderIntakeCard();
      case "level-suggest": return renderLevelSuggestCard();
      case "requirements": return renderRequirementsCard();
      case "summary": return renderSummaryCard();
      case "complete": return renderCompleteCard();
      default: return null;
    }
  };
  
  if (!player) return null;
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Start Baseline</Text>
            <Text style={styles.headerSubtitle}>{player.name}</Text>
          </View>
          <View style={styles.headerRight} />
        </View>
        
        {/* Content */}
        <View style={styles.content}>
          <Animated.View 
            key={`${step}-${currentPillarIndex}`}
            entering={SlideInRight.duration(300).springify()}
            style={styles.cardContainer}
          >
            {renderCurrentStep()}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: Spacing.xl,
  },
  cardContainer: {
    flex: 1,
    justifyContent: "center",
  },
  // Intro card
  introContent: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  introIconWrapper: {
    marginBottom: Spacing.xl,
  },
  introIconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  introDescription: {
    fontSize: FontSizes.md,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  introSteps: {
    width: "100%",
    gap: Spacing.md,
  },
  introStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  introStepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  introStepNumberText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
  introStepText: {
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    flex: 1,
  },
  // Card content
  cardScrollContent: {
    flex: 1,
  },
  // Question groups
  questionGroup: {
    marginBottom: Spacing.lg,
  },
  questionLabel: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  optionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  optionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  optionButtonWide: {
    flex: 1,
  },
  optionButtonActive: {
    borderColor: GlowColors.primary,
    backgroundColor: `${GlowColors.primary}15`,
  },
  optionText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  optionTextActive: {
    color: GlowColors.primary,
  },
  // Level suggest
  levelSuggestContent: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxl,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.md,
  },
  levelBadge: {
    borderRadius: 20,
    borderWidth: 2,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  levelBadgeGradient: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    alignItems: "center",
  },
  levelBadgeStage: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  levelBadgeRank: {
    fontSize: 48,
    fontWeight: "800",
    color: Colors.dark.text,
    marginTop: -4,
  },
  levelSuggestTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  confidenceContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    width: "100%",
  },
  confidenceBar: {
    width: "80%",
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: Spacing.xs,
  },
  confidenceFill: {
    height: "100%",
    borderRadius: 3,
  },
  confidenceText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  levelSuggestNote: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
  },
  // Requirements
  requirementsIntro: {
    fontSize: FontSizes.md,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.lg,
  },
  emptySkills: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
  },
  emptySkillsText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  // Summary
  summaryHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  summaryLevelBadge: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    marginBottom: Spacing.sm,
  },
  summaryLevelText: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
  },
  summaryPlayerName: {
    fontSize: FontSizes.md,
    color: Colors.dark.textSecondary,
  },
  summaryProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: BorderRadius.lg,
  },
  summaryProgressRing: {},
  summaryProgressInfo: {},
  summaryProgressTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  summaryProgressSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  pillarSummary: {
    gap: Spacing.sm,
  },
  pillarSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pillarSummaryIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pillarSummaryName: {
    width: 80,
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  pillarSummaryBar: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 3,
    overflow: "hidden",
  },
  pillarSummaryFill: {
    height: "100%",
    borderRadius: 3,
  },
  pillarSummaryCount: {
    width: 40,
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    textAlign: "right",
  },
  deepAssessmentOption: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: `${Colors.dark.xpCyan}10`,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}30`,
  },
  deepAssessmentTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.xs,
  },
  deepAssessmentSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  // Complete
  completeCard: {
    flex: 1,
    justifyContent: "center",
    marginHorizontal: Spacing.xl,
  },
  completeGradient: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.xl,
  },
  completeTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  completeSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  completeActions: {
    width: "100%",
    gap: Spacing.md,
  },
  completePrimaryButton: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  completePrimaryGradient: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  completePrimaryText: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  completeSecondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan,
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  completeSecondaryText: {
    fontSize: FontSizes.md,
    fontWeight: "500",
    color: Colors.dark.xpCyan,
  },
});
