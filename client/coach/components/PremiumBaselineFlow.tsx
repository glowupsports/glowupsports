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
import { Colors, Backgrounds, Spacing, BorderRadius, FontSizes, GlowColors } from "@/constants/theme";
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

type FlowStep = "intro" | "player-type" | "ball-level" | "glow-level" | "sublevel" | "requirements" | "summary" | "complete";
type PlayerType = "kid" | "adult";
type BallLevel = "BLUE" | "RED" | "ORANGE" | "GREEN" | "YELLOW";
type GlowLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

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

// Helper to calculate age from dateOfBirth
const calculateAge = (dateOfBirth: string | null | undefined): number | null => {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Determine player type from age (adult = 18+)
const determinePlayerType = (age: number | null, playerAge?: number | null): PlayerType | null => {
  const ageToUse = age ?? playerAge;
  if (ageToUse === null || ageToUse === undefined) return null;
  return ageToUse >= 18 ? "adult" : "kid";
};

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
  
  // Player type and level selection state
  const [playerType, setPlayerType] = useState<PlayerType | null>(null);
  const [playerTypeAutoDetected, setPlayerTypeAutoDetected] = useState(false);
  const [selectedBallLevel, setSelectedBallLevel] = useState<BallLevel | null>(null);
  const [selectedGlowLevel, setSelectedGlowLevel] = useState<GlowLevel | null>(null);
  const [selectedSublevel, setSelectedSublevel] = useState<1 | 2 | 3 | null>(null);
  
  // Level state
  const [confirmedLevel, setConfirmedLevel] = useState<string | null>(null);
  
  // Requirements checklist state
  const [checkedSkills, setCheckedSkills] = useState<Set<string>>(new Set());
  
  // UI state
  const [showPostActionModal, setShowPostActionModal] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  
  // Compute the level ID based on selection
  useEffect(() => {
    if (playerType === "kid" && selectedBallLevel && selectedSublevel) {
      setConfirmedLevel(`${selectedBallLevel}_${selectedSublevel}`);
    } else if (playerType === "adult" && selectedGlowLevel) {
      setConfirmedLevel(`GLOW_${selectedGlowLevel}`);
    }
  }, [playerType, selectedBallLevel, selectedGlowLevel, selectedSublevel]);
  
  // Fetch level details when we have a confirmed level
  const { data: levelDetails, isLoading: loadingLevel } = useQuery<LevelDetails>({
    queryKey: [`/api/glow/levels/${confirmedLevel}`],
    enabled: !!confirmedLevel && step === "requirements",
  });
  
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!player || !confirmedLevel) throw new Error("Missing data");
      
      // Build pillar ratings from checked skills
      const pillarProgress = PILLARS.reduce((acc, pillar) => {
        const pillarSkills = levelDetails?.skillsByPillar[pillar.id] || [];
        const checkedCount = pillarSkills.filter(s => checkedSkills.has(s.id)).length;
        const total = pillarSkills.length;
        acc[pillar.id.toLowerCase()] = total > 0 ? Math.round((checkedCount / total) * 3) : 1;
        return acc;
      }, {} as Record<string, number>);
      
      return apiRequest("POST", `/api/players/${player.id}/baseline`, {
        suggestedLevelId: confirmedLevel,
        confirmedLevelId: confirmedLevel,
        confidenceScore: 100, // Coach selected directly
        playerType,
        selectedBallLevel,
        selectedGlowLevel,
        selectedSublevel,
        ...pillarProgress,
        checkedSkillIds: Array.from(checkedSkills),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/baseline-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/players-without-baseline"] });
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setStep("complete");
      }, 300);
    },
  });
  
  // Quick save mutation - saves just the level without skill checks
  const quickSaveMutation = useMutation({
    mutationFn: async () => {
      if (!player || !confirmedLevel) throw new Error("Missing data");
      
      // Default pillar ratings (all set to 1 = starting)
      const defaultPillarProgress = PILLARS.reduce((acc, pillar) => {
        acc[pillar.id.toLowerCase()] = 1;
        return acc;
      }, {} as Record<string, number>);
      
      return apiRequest("POST", `/api/players/${player.id}/baseline`, {
        suggestedLevelId: confirmedLevel,
        confirmedLevelId: confirmedLevel,
        confidenceScore: 100,
        playerType,
        selectedBallLevel,
        selectedGlowLevel,
        selectedSublevel,
        ...defaultPillarProgress,
        checkedSkillIds: [],
        quickSave: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/baseline-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/players-without-baseline"] });
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setStep("complete");
      }, 300);
    },
  });
  
  // Handle quick save from sublevel/glow-level card
  const handleQuickSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    quickSaveMutation.mutate();
  };
  
  // Reset state when modal opens
  useEffect(() => {
    if (visible && player) {
      setStep("intro");
      setCurrentPillarIndex(0);
      
      // Auto-detect player type from dateOfBirth or age
      const calculatedAge = calculateAge(player.dateOfBirth);
      const autoDetectedType = determinePlayerType(calculatedAge, player.age);
      
      if (autoDetectedType) {
        setPlayerType(autoDetectedType);
        setPlayerTypeAutoDetected(true);
      } else {
        setPlayerType(null);
        setPlayerTypeAutoDetected(false);
      }
      
      setSelectedBallLevel(null);
      setSelectedGlowLevel(null);
      setSelectedSublevel(null);
      setConfirmedLevel(null);
      setCheckedSkills(new Set());
      setShowSuccessAnimation(false);
      setShowPostActionModal(false);
    }
  }, [visible, player?.id]);
  
  // Calculate total steps based on flow
  const getTotalSteps = () => {
    const requirementPillars = levelDetails?.skillsByPillar 
      ? Object.keys(levelDetails.skillsByPillar).length 
      : 6;
    // intro + player-type (if not auto) + (ball-level OR glow-level) + sublevel (for kids) + pillars + summary
    let basesteps = 1; // intro
    if (!playerTypeAutoDetected) basesteps += 1; // player-type step
    basesteps += 1; // ball-level or glow-level
    if (playerType === "kid") basesteps += 1; // sublevel for kids
    return basesteps + requirementPillars + 1; // +1 for summary
  };
  
  const getCurrentStepNumber = () => {
    const typeStepOffset = playerTypeAutoDetected ? 0 : 1;
    switch (step) {
      case "intro": return 1;
      case "player-type": return 2;
      case "ball-level": return 2 + typeStepOffset;
      case "glow-level": return 2 + typeStepOffset;
      case "sublevel": return 3 + typeStepOffset;
      case "requirements": {
        const baseStep = playerType === "kid" ? 4 + typeStepOffset : 3 + typeStepOffset;
        return baseStep + currentPillarIndex;
      }
      case "summary": return getTotalSteps();
      default: return 1;
    }
  };
  
  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    switch (step) {
      case "intro":
        // Skip player-type step if we auto-detected from dateOfBirth/age
        if (playerTypeAutoDetected && playerType) {
          if (playerType === "kid") {
            setStep("ball-level");
          } else {
            setStep("glow-level");
          }
        } else {
          setStep("player-type");
        }
        break;
      case "player-type":
        if (playerType === "kid") {
          setStep("ball-level");
        } else {
          setStep("glow-level");
        }
        break;
      case "ball-level":
        setStep("sublevel");
        break;
      case "glow-level":
        setStep("requirements");
        setCurrentPillarIndex(0);
        break;
      case "sublevel":
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
      case "player-type":
        setStep("intro");
        break;
      case "ball-level":
        // Go back to intro if player type was auto-detected, otherwise to player-type
        if (playerTypeAutoDetected) {
          setStep("intro");
        } else {
          setStep("player-type");
        }
        break;
      case "glow-level":
        // Go back to intro if player type was auto-detected, otherwise to player-type
        if (playerTypeAutoDetected) {
          setStep("intro");
        } else {
          setStep("player-type");
        }
        break;
      case "sublevel":
        setStep("ball-level");
        break;
      case "requirements":
        if (currentPillarIndex > 0) {
          setCurrentPillarIndex(prev => prev - 1);
        } else {
          if (playerType === "kid") {
            setStep("sublevel");
          } else {
            setStep("glow-level");
          }
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
  
  const renderIntroCard = () => {
    const calculatedAge = calculateAge(player?.dateOfBirth);
    const displayAge = calculatedAge ?? player?.age;
    
    return (
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
            In just a few steps, we&apos;ll determine the perfect starting level and track which skills {player?.name} already has.
          </Text>
          
          {/* Show auto-detected player type info */}
          {playerTypeAutoDetected && playerType && (
            <View style={styles.autoDetectedBadge}>
              <Ionicons 
                name={playerType === "kid" ? "tennisball" : "person"} 
                size={18} 
                color={playerType === "kid" ? STAGE_COLORS.RED : GlowColors.primary} 
              />
              <Text style={styles.autoDetectedText}>
                {playerType === "kid" ? "Youth" : "Adult"} player
                {displayAge ? ` (${displayAge} years)` : ""}
              </Text>
              <View style={[styles.autoDetectedDot, { backgroundColor: playerType === "kid" ? STAGE_COLORS.RED : GlowColors.primary }]} />
              <Text style={styles.autoDetectedLabel}>Auto-detected</Text>
            </View>
          )}
          
          <View style={styles.introSteps}>
            {!playerTypeAutoDetected && (
              <View style={styles.introStep}>
                <View style={[styles.introStepNumber, { backgroundColor: `${STAGE_COLORS.ORANGE}20` }]}>
                  <Text style={[styles.introStepNumberText, { color: STAGE_COLORS.ORANGE }]}>1</Text>
                </View>
                <Text style={styles.introStepText}>Choose player type (Adult/Kid)</Text>
              </View>
            )}
            <View style={styles.introStep}>
              <View style={[styles.introStepNumber, { backgroundColor: `${STAGE_COLORS.GREEN}20` }]}>
                <Text style={[styles.introStepNumberText, { color: STAGE_COLORS.GREEN }]}>
                  {playerTypeAutoDetected ? "1" : "2"}
                </Text>
              </View>
              <Text style={styles.introStepText}>
                Select their {playerType === "adult" ? "Glow" : "ball"} level
              </Text>
            </View>
            <View style={styles.introStep}>
              <View style={[styles.introStepNumber, { backgroundColor: `${GlowColors.primary}20` }]}>
                <Text style={[styles.introStepNumberText, { color: GlowColors.primary }]}>
                  {playerTypeAutoDetected ? "2" : "3"}
                </Text>
              </View>
              <Text style={styles.introStepText}>Check off skills they can do</Text>
            </View>
          </View>
        </View>
      </BaselineFlowCard>
    );
  };
  
  // Player Type selector card (Adult/Kid)
  const renderPlayerTypeCard = () => (
    <BaselineFlowCard
      title="Player Type"
      subtitle="Who is this player?"
      icon="person"
      iconColor={STAGE_COLORS.ORANGE}
      step={2}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel="Next"
      nextDisabled={!playerType}
      glowColor={STAGE_COLORS.ORANGE}
    >
      <View style={styles.levelSuggestContent}>
        <Text style={styles.typeSelectionTitle}>Is this player a child or adult?</Text>
        
        <View style={styles.typeButtonRow}>
          <Pressable
            style={[
              styles.typeButton,
              playerType === "kid" && styles.typeButtonActive,
              { borderColor: STAGE_COLORS.RED }
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setPlayerType("kid");
            }}
          >
            <LinearGradient
              colors={playerType === "kid" ? [`${STAGE_COLORS.RED}40`, `${STAGE_COLORS.RED}20`] : ["transparent", "transparent"]}
              style={styles.typeButtonGradient}
            >
              <Ionicons name="tennisball" size={40} color={playerType === "kid" ? STAGE_COLORS.RED : "#FFFFFF"} />
              <Text style={[styles.typeButtonLabel, playerType === "kid" && { color: STAGE_COLORS.RED }]}>Kid</Text>
              <Text style={styles.typeButtonSubtext}>Ball levels (BLUE/RED/ORANGE/GREEN/YELLOW)</Text>
            </LinearGradient>
          </Pressable>
          
          <Pressable
            style={[
              styles.typeButton,
              playerType === "adult" && styles.typeButtonActive,
              { borderColor: GlowColors.primary }
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setPlayerType("adult");
            }}
          >
            <LinearGradient
              colors={playerType === "adult" ? [`${GlowColors.primary}40`, `${GlowColors.primary}20`] : ["transparent", "transparent"]}
              style={styles.typeButtonGradient}
            >
              <Ionicons name="fitness" size={40} color={playerType === "adult" ? GlowColors.primary : "#FFFFFF"} />
              <Text style={[styles.typeButtonLabel, playerType === "adult" && { color: GlowColors.primary }]}>Adult</Text>
              <Text style={styles.typeButtonSubtext}>Glow levels 1-9</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </BaselineFlowCard>
  );
  
  // Ball Level selector for kids
  const renderBallLevelCard = () => {
    const ballLevels: { level: BallLevel; color: string; description: string }[] = [
      { level: "BLUE", color: STAGE_COLORS.BLUE, description: "Foundation (ages 2-4)" },
      { level: "RED", color: STAGE_COLORS.RED, description: "Beginners (ages 5-8)" },
      { level: "ORANGE", color: STAGE_COLORS.ORANGE, description: "Developing (ages 8-10)" },
      { level: "GREEN", color: STAGE_COLORS.GREEN, description: "Intermediate (ages 9-12)" },
      { level: "YELLOW", color: STAGE_COLORS.YELLOW, description: "Advanced (ages 10+)" },
    ];
    
    return (
      <BaselineFlowCard
        title="Ball Level"
        subtitle="Which ball does this player use?"
        icon="tennisball"
        iconColor={selectedBallLevel ? STAGE_COLORS[selectedBallLevel] : STAGE_COLORS.RED}
        step={3}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel="Choose Sublevel"
        nextDisabled={!selectedBallLevel}
        glowColor={selectedBallLevel ? STAGE_COLORS[selectedBallLevel] : STAGE_COLORS.RED}
      >
        <ScrollView style={styles.cardScrollContent} showsVerticalScrollIndicator={false}>
          {ballLevels.map(({ level, color, description }) => (
            <Pressable
              key={level}
              style={[
                styles.ballLevelButton,
                { borderColor: color },
                selectedBallLevel === level && styles.ballLevelButtonActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSelectedBallLevel(level);
              }}
            >
              <LinearGradient
                colors={selectedBallLevel === level ? [`${color}40`, `${color}15`] : ["transparent", "transparent"]}
                style={styles.ballLevelGradient}
              >
                <View style={[styles.ballLevelDot, { backgroundColor: color }]} />
                <View style={styles.ballLevelTextContainer}>
                  <Text style={[styles.ballLevelName, { color: selectedBallLevel === level ? color : "#FFFFFF" }]}>
                    {level} Ball
                  </Text>
                  <Text style={styles.ballLevelDescription}>{description}</Text>
                </View>
                {selectedBallLevel === level && (
                  <Ionicons name="checkmark-circle" size={24} color={color} />
                )}
              </LinearGradient>
            </Pressable>
          ))}
        </ScrollView>
      </BaselineFlowCard>
    );
  };
  
  // Glow Level selector for adults
  const renderGlowLevelCard = () => {
    const glowLevels: { level: GlowLevel; description: string }[] = [
      { level: 1, description: "Pro / Tour level" },
      { level: 2, description: "Advanced competitor" },
      { level: 3, description: "Tournament player" },
      { level: 4, description: "Competition ready" },
      { level: 5, description: "Strong club player" },
      { level: 6, description: "Club player" },
      { level: 7, description: "Game understanding" },
      { level: 8, description: "Rally capable" },
      { level: 9, description: "Beginner" },
    ];
    
    return (
      <BaselineFlowCard
        title="Glow Level"
        subtitle="What level is this adult player?"
        icon="flash"
        iconColor={GlowColors.primary}
        step={3}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        onQuickSave={handleQuickSave}
        nextLabel="Check Skills"
        quickSaveLabel="Save Level"
        nextDisabled={!selectedGlowLevel}
        quickSaveDisabled={!selectedGlowLevel || quickSaveMutation.isPending}
        glowColor={GlowColors.primary}
      >
        <ScrollView style={styles.cardScrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.glowLevelGrid}>
            {glowLevels.map(({ level, description }) => (
              <Pressable
                key={level}
                style={[
                  styles.glowLevelButton,
                  selectedGlowLevel === level && styles.glowLevelButtonActive,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setSelectedGlowLevel(level);
                }}
              >
                <Text style={[
                  styles.glowLevelNumber, 
                  selectedGlowLevel === level && styles.glowLevelNumberActive
                ]}>
                  {level}
                </Text>
                <Text style={styles.glowLevelDescription}>{description}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </BaselineFlowCard>
    );
  };
  
  // Sublevel selector for kids (1, 2, 3 within ball level)
  const renderSublevelCard = () => {
    const color = selectedBallLevel ? STAGE_COLORS[selectedBallLevel] : GlowColors.primary;
    const sublevels: { level: 1 | 2 | 3; name: string; description: string }[] = [
      { level: 3, name: "Stage 3", description: "Just starting at this level" },
      { level: 2, name: "Stage 2", description: "Developing competency" },
      { level: 1, name: "Stage 1", description: "Ready for next ball level" },
    ];
    
    return (
      <BaselineFlowCard
        title={`${selectedBallLevel} Level Stage`}
        subtitle="How far along at this level?"
        icon="layers"
        iconColor={color}
        step={4}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        onQuickSave={handleQuickSave}
        nextLabel="Check Skills"
        quickSaveLabel="Save Level"
        nextDisabled={!selectedSublevel}
        quickSaveDisabled={!selectedSublevel || quickSaveMutation.isPending}
        glowColor={color}
      >
        <View style={styles.levelSuggestContent}>
          <Text style={styles.sublevelIntro}>
            Which stage best describes {player?.name}&apos;s current ability at {selectedBallLevel} level?
          </Text>
          
          {sublevels.map(({ level, name, description }) => (
            <Pressable
              key={level}
              style={[
                styles.sublevelButton,
                { borderColor: color },
                selectedSublevel === level && styles.sublevelButtonActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSelectedSublevel(level);
              }}
            >
              <LinearGradient
                colors={selectedSublevel === level ? [`${color}40`, `${color}15`] : ["transparent", "transparent"]}
                style={styles.sublevelGradient}
              >
                <View style={[styles.sublevelNumber, { backgroundColor: selectedSublevel === level ? color : "rgba(255,255,255,0.2)" }]}>
                  <Text style={styles.sublevelNumberText}>{level}</Text>
                </View>
                <View style={styles.sublevelTextContainer}>
                  <Text style={[styles.sublevelName, selectedSublevel === level && { color }]}>{name}</Text>
                  <Text style={styles.sublevelDescription}>{description}</Text>
                </View>
                {selectedSublevel === level && (
                  <Ionicons name="checkmark-circle" size={24} color={color} />
                )}
              </LinearGradient>
            </Pressable>
          ))}
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
              <Ionicons name="checkmark-done-circle" size={40} color="#FFFFFF" />
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
    
    // Get stage and rank from selected values
    const displayStage = playerType === "kid" ? selectedBallLevel : "GLOW";
    const displayRank = playerType === "kid" ? selectedSublevel : selectedGlowLevel;
    const stageColor = displayStage && STAGE_COLORS[displayStage] 
      ? STAGE_COLORS[displayStage] 
      : GlowColors.primary;
    
    return (
      <BaselineFlowCard
        title="Summary"
        subtitle="Ready to save baseline"
        icon="checkmark-circle"
        iconColor={stageColor}
        step={getTotalSteps()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel={saveMutation.isPending ? "Saving..." : "Save Baseline"}
        nextDisabled={saveMutation.isPending}
        glowColor={stageColor}
      >
        <ScrollView style={styles.cardScrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryHeader}>
            <View style={[styles.summaryLevelBadge, { borderColor: stageColor }]}>
              <Text style={[styles.summaryLevelText, { color: stageColor }]}>
                {displayStage} {displayRank}
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
          {player?.name}&apos;s starting level and skills have been saved
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
      case "player-type": return renderPlayerTypeCard();
      case "ball-level": return renderBallLevelCard();
      case "glow-level": return renderGlowLevelCard();
      case "sublevel": return renderSublevelCard();
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
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
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
    backgroundColor: Backgrounds.card,
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
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "500",
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
    fontSize: FontSizes.xxl,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  introDescription: {
    fontSize: FontSizes.lg,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
    fontWeight: "500",
  },
  autoDetectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  autoDetectedText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  autoDetectedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: Spacing.xs,
  },
  autoDetectedLabel: {
    fontSize: FontSizes.sm,
    color: "rgba(255, 255, 255, 0.6)",
    fontStyle: "italic",
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
    paddingVertical: Spacing.sm,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.xs,
  },
  introStepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  introStepNumberText: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
  },
  introStepText: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    flex: 1,
    fontWeight: "600",
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
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: "#FFFFFF",
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
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  optionButtonWide: {
    flex: 1,
  },
  optionButtonActive: {
    borderColor: GlowColors.primary,
    borderWidth: 2,
    backgroundColor: `${GlowColors.primary}25`,
  },
  optionText: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  optionTextActive: {
    color: GlowColors.primary,
    fontWeight: "700",
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
    fontSize: FontSizes.lg,
    color: "#FFFFFF",
    marginTop: Spacing.md,
    fontWeight: "600",
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
    color: "#FFFFFF",
    marginTop: -4,
  },
  levelSuggestTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: Spacing.md,
  },
  confidenceContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    width: "100%",
  },
  confidenceBar: {
    width: "80%",
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  confidenceFill: {
    height: "100%",
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  levelSuggestNote: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
    lineHeight: 24,
    fontWeight: "500",
  },
  // Requirements
  requirementsIntro: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    marginBottom: Spacing.lg,
    fontWeight: "500",
  },
  emptySkills: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
  },
  emptySkillsText: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    marginTop: Spacing.md,
    fontWeight: "500",
  },
  // Summary
  summaryHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  summaryLevelBadge: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    marginBottom: Spacing.sm,
  },
  summaryLevelText: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
  },
  summaryPlayerName: {
    fontSize: FontSizes.lg,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  summaryProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
  },
  summaryProgressRing: {},
  summaryProgressInfo: {},
  summaryProgressTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  summaryProgressSubtitle: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  pillarSummary: {
    gap: Spacing.md,
  },
  pillarSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  pillarSummaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pillarSummaryName: {
    width: 90,
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  pillarSummaryBar: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 4,
    overflow: "hidden",
  },
  pillarSummaryFill: {
    height: "100%",
    borderRadius: 4,
  },
  pillarSummaryCount: {
    width: 50,
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    textAlign: "right",
    fontWeight: "600",
  },
  deepAssessmentOption: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: `${Colors.dark.xpCyan}15`,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: `${Colors.dark.xpCyan}40`,
  },
  deepAssessmentTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.xs,
  },
  deepAssessmentSubtitle: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "500",
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
    color: "#FFFFFF",
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  completeSubtitle: {
    fontSize: FontSizes.lg,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.xl,
    fontWeight: "500",
  },
  completeActions: {
    width: "100%",
    gap: Spacing.md,
  },
  completePrimaryButton: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  completePrimaryGradient: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing["3xl"],
    alignItems: "center",
    justifyContent: "center",
  },
  completePrimaryText: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
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
  // Player type selection styles
  typeSelectionTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  typeButtonRow: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  typeButton: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    overflow: "hidden",
  },
  typeButtonActive: {
    borderWidth: 3,
  },
  typeButtonGradient: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  typeButtonLabel: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  typeButtonSubtext: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "500",
    opacity: 0.8,
  },
  // Ball level selection styles
  ballLevelButton: {
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  ballLevelButtonActive: {
    borderWidth: 3,
  },
  ballLevelGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  ballLevelDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  ballLevelTextContainer: {
    flex: 1,
  },
  ballLevelName: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  ballLevelDescription: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
    fontWeight: "500",
    opacity: 0.8,
  },
  // Glow level selection styles
  glowLevelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    justifyContent: "center",
  },
  glowLevelButton: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.sm,
  },
  glowLevelButtonActive: {
    borderColor: GlowColors.primary,
    borderWidth: 3,
    backgroundColor: `${GlowColors.primary}25`,
  },
  glowLevelNumber: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  glowLevelNumberActive: {
    color: GlowColors.primary,
  },
  glowLevelDescription: {
    fontSize: FontSizes.xs,
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "500",
    opacity: 0.8,
  },
  // Sublevel selection styles
  sublevelIntro: {
    fontSize: FontSizes.lg,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.xl,
    fontWeight: "500",
    paddingHorizontal: Spacing.md,
  },
  sublevelButton: {
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  sublevelButtonActive: {
    borderWidth: 3,
  },
  sublevelGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  sublevelNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sublevelNumberText: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sublevelTextContainer: {
    flex: 1,
  },
  sublevelName: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sublevelDescription: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
    fontWeight: "500",
    opacity: 0.8,
  },
});
