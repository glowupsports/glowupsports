import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, FontSizes, getPlayerLevelColor } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface Player {
  id: string;
  name: string;
  age?: number | null;
  dateOfBirth?: string | null;
  ballLevel?: string | null;
}

interface QuickBaselineDrawerProps {
  visible: boolean;
  player: Player | null;
  onClose: () => void;
  onComplete: () => void;
}

type PillarRating = 0 | 1 | 2 | 3;
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

const PILLAR_RATING_LABELS: Record<PillarRating, { label: string; color: string }> = {
  0: { label: "Not Yet", color: Colors.dark.textMuted },
  1: { label: "Developing", color: Colors.dark.orange },
  2: { label: "Meets", color: Colors.dark.primary },
  3: { label: "Above", color: Colors.dark.xpCyan },
};

const PILLARS = [
  { id: "technique", name: "Technique", icon: "construct" as keyof typeof Ionicons.glyphMap, color: "#10B981" },
  { id: "tactical", name: "Tactical", icon: "bulb" as keyof typeof Ionicons.glyphMap, color: "#F59E0B" },
  { id: "physical", name: "Physical", icon: "barbell" as keyof typeof Ionicons.glyphMap, color: "#EF4444" },
  { id: "mental", name: "Mental", icon: "brain" as keyof typeof Ionicons.glyphMap, color: "#8B5CF6" },
  { id: "social", name: "Social", icon: "people" as keyof typeof Ionicons.glyphMap, color: "#EC4899" },
  { id: "match", name: "Match", icon: "trophy" as keyof typeof Ionicons.glyphMap, color: "#3B82F6" },
];

const CHILD_BALL_STAGES = ["BLUE", "RED", "ORANGE", "GREEN", "YELLOW"];
const ADULT_BALL_STAGES = ["GLOW"];
const CHILD_LEVEL_RANKS = [3, 2, 1];
const ADULT_LEVEL_RANKS = [9, 8, 7, 6, 5, 4, 3, 2, 1];

const getStagesForPlayer = (isAdult: boolean) => isAdult ? ADULT_BALL_STAGES : CHILD_BALL_STAGES;
const getRanksForStage = (stage: string) => stage === "GLOW" ? ADULT_LEVEL_RANKS : CHILD_LEVEL_RANKS;

const OVERRIDE_REASONS = [
  { value: "player_clearly_advanced", label: "Player clearly advanced" },
  { value: "late_starter_athletic", label: "Late starter, athletic" },
  { value: "other_academy", label: "Came from another academy" },
  { value: "competition_experience", label: "Competition experience" },
  { value: "age_mismatch", label: "Age doesn't match ability" },
];

export default function QuickBaselineDrawer({
  visible,
  player,
  onClose,
  onComplete,
}: QuickBaselineDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"intake" | "pillars" | "confirm">("intake");
  
  const [tennisExperience, setTennisExperience] = useState<TennisExperience>("0-6m");
  const [playsCompetition, setPlaysCompetition] = useState<PlaysCompetition>("never");
  const [canRallyFive, setCanRallyFive] = useState(false);
  const [serveAbility, setServeAbility] = useState<ServeAbility>("none");
  
  const [pillarRatings, setPillarRatings] = useState<Record<string, PillarRating>>({
    technique: 1,
    tactical: 1,
    physical: 1,
    mental: 1,
    social: 1,
    match: 0,
  });
  
  const [suggestion, setSuggestion] = useState<LevelSuggestion | null>(null);
  const [confirmedLevel, setConfirmedLevel] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState<string | null>(null);
  const [overrideNote, setOverrideNote] = useState("");
  
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
      return apiRequest("POST", `/api/players/${player.id}/baseline`, {
        suggestedLevelId: suggestion.suggestedLevelId,
        confirmedLevelId: confirmedLevel,
        confidenceScore: suggestion.confidenceScore,
        tennisExperience,
        playsCompetition,
        canRallyFive,
        serveAbility,
        techniqueRating: pillarRatings.technique,
        tacticalRating: pillarRatings.tactical,
        physicalRating: pillarRatings.physical,
        mentalRating: pillarRatings.mental,
        socialRating: pillarRatings.social,
        matchRating: pillarRatings.match,
        overrideReason: confirmedLevel !== suggestion.suggestedLevelId ? overrideReason : null,
        overrideNote: confirmedLevel !== suggestion.suggestedLevelId ? overrideNote : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/baseline-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players", player?.id, "baseline"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete();
    },
  });
  
  useEffect(() => {
    if (visible && player) {
      setStep("intake");
      setTennisExperience("0-6m");
      setPlaysCompetition("never");
      setCanRallyFive(false);
      setServeAbility("none");
      setPillarRatings({
        technique: 1,
        tactical: 1,
        physical: 1,
        mental: 1,
        social: 1,
        match: 0,
      });
      setSuggestion(null);
      setConfirmedLevel(null);
      setOverrideReason(null);
      setOverrideNote("");
    }
  }, [visible, player?.id]);
  
  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === "intake") {
      suggestMutation.mutate();
      setStep("pillars");
    } else if (step === "pillars") {
      setStep("confirm");
    }
  };
  
  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === "pillars") {
      setStep("intake");
    } else if (step === "confirm") {
      setStep("pillars");
    }
  };
  
  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    saveMutation.mutate();
  };
  
  const renderIntakeStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Quick Intake Questions</Text>
      <Text style={styles.stepSubtitle}>
        Answer a few questions to help suggest the right starting level
      </Text>
      
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
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={canRallyFive ? Colors.dark.primary : Colors.dark.textMuted}
            />
            <Text style={[
              styles.optionText,
              canRallyFive && styles.optionTextActive,
            ]}>
              Yes
            </Text>
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
            <Ionicons
              name="close-circle"
              size={20}
              color={!canRallyFive ? Colors.dark.error : Colors.dark.textMuted}
            />
            <Text style={[
              styles.optionText,
              !canRallyFive && styles.optionTextActive,
            ]}>
              Not Yet
            </Text>
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
              <Text style={[
                styles.optionText,
                serveAbility === opt && styles.optionTextActive,
              ]}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
  
  const renderPillarsStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Quick Pillar Assessment</Text>
      <Text style={styles.stepSubtitle}>
        Rate each pillar based on your first impression
      </Text>
      
      {PILLARS.map((pillar) => (
        <View key={pillar.id} style={styles.pillarRow}>
          <View style={styles.pillarHeader}>
            <View style={[styles.pillarIcon, { backgroundColor: pillar.color + "20" }]}>
              <Ionicons name={pillar.icon} size={18} color={pillar.color} />
            </View>
            <Text style={styles.pillarName}>{pillar.name}</Text>
          </View>
          <View style={styles.ratingButtons}>
            {([0, 1, 2, 3] as PillarRating[]).map((rating) => (
              <Pressable
                key={rating}
                style={[
                  styles.ratingButton,
                  pillarRatings[pillar.id] === rating && {
                    backgroundColor: PILLAR_RATING_LABELS[rating].color + "30",
                    borderColor: PILLAR_RATING_LABELS[rating].color,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPillarRatings((prev) => ({ ...prev, [pillar.id]: rating }));
                }}
              >
                <Text style={[
                  styles.ratingButtonText,
                  pillarRatings[pillar.id] === rating && {
                    color: PILLAR_RATING_LABELS[rating].color,
                  },
                ]}>
                  {rating}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      
      <View style={styles.legendContainer}>
        {([0, 1, 2, 3] as PillarRating[]).map((rating) => (
          <View key={rating} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PILLAR_RATING_LABELS[rating].color }]} />
            <Text style={styles.legendText}>
              {rating} = {PILLAR_RATING_LABELS[rating].label}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
  
  const renderConfirmStep = () => {
    const isOverride = confirmedLevel && suggestion && confirmedLevel !== suggestion.suggestedLevelId;
    
    return (
      <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepTitle}>Confirm Starting Level</Text>
        
        {suggestion && (
          <View style={styles.suggestionCard}>
            <View style={styles.suggestionHeader}>
              <Ionicons name="sparkles" size={20} color={Colors.dark.xpCyan} />
              <Text style={styles.suggestionLabel}>AI Suggested Level</Text>
            </View>
            <View style={styles.suggestionLevel}>
              <Text style={[
                styles.suggestionLevelText,
                { color: getPlayerLevelColor((suggestion.suggestedStage || "red").toLowerCase()) },
              ]}>
                {suggestion.suggestedStage || "RED"} {suggestion.suggestedRank || 3}
              </Text>
              <View style={styles.confidenceBadge}>
                <Text style={styles.confidenceText}>
                  {suggestion.confidenceScore}% confidence
                </Text>
              </View>
            </View>
            <Text style={styles.ageNote}>
              Based on age {suggestion.age} and intake answers
            </Text>
          </View>
        )}
        
        <Text style={styles.selectLabel}>Select Starting Level</Text>
        <View style={styles.levelGrid}>
          {getStagesForPlayer(suggestion?.isAdult || false).map((stage) => (
            <View key={stage} style={styles.stageColumn}>
              <View style={[
                styles.stageBadge,
                { backgroundColor: getPlayerLevelColor(stage.toLowerCase()) + "20" },
              ]}>
                <Text style={[
                  styles.stageBadgeText,
                  { color: getPlayerLevelColor(stage.toLowerCase()) },
                ]}>
                  {stage}
                </Text>
              </View>
              {getRanksForStage(stage).map((rank) => {
                const levelId = `${stage}_${rank}`;
                const isSelected = confirmedLevel === levelId;
                const isSuggested = suggestion?.suggestedLevelId === levelId;
                return (
                  <Pressable
                    key={levelId}
                    style={[
                      styles.levelButton,
                      isSelected && {
                        backgroundColor: getPlayerLevelColor(stage.toLowerCase()) + "30",
                        borderColor: getPlayerLevelColor(stage.toLowerCase()),
                      },
                      isSuggested && !isSelected && styles.levelButtonSuggested,
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setConfirmedLevel(levelId);
                    }}
                  >
                    <Text style={[
                      styles.levelButtonText,
                      isSelected && { color: getPlayerLevelColor(stage.toLowerCase()) },
                    ]}>
                      {stage.charAt(0)}{rank}
                    </Text>
                    {isSuggested && (
                      <Ionicons
                        name="sparkles"
                        size={12}
                        color={Colors.dark.xpCyan}
                        style={styles.suggestedIcon}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        
        {isOverride && (
          <View style={styles.overrideSection}>
            <Text style={styles.overrideLabel}>Override Reason</Text>
            <View style={styles.overrideOptions}>
              {OVERRIDE_REASONS.map((reason) => (
                <Pressable
                  key={reason.value}
                  style={[
                    styles.overrideOption,
                    overrideReason === reason.value && styles.overrideOptionActive,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setOverrideReason(reason.value);
                  }}
                >
                  <Text style={[
                    styles.overrideOptionText,
                    overrideReason === reason.value && styles.overrideOptionTextActive,
                  ]}>
                    {reason.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.overrideNoteInput}
              placeholder="Additional notes (optional)"
              placeholderTextColor={Colors.dark.textMuted}
              value={overrideNote}
              onChangeText={setOverrideNote}
              multiline
            />
          </View>
        )}
      </ScrollView>
    );
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
        <LinearGradient
          colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Start Baseline</Text>
            <Text style={styles.headerSubtitle}>{player.name}</Text>
          </View>
          <View style={styles.stepIndicator}>
            <Text style={styles.stepText}>
              {step === "intake" ? "1" : step === "pillars" ? "2" : "3"} / 3
            </Text>
          </View>
        </View>
        
        <View style={styles.progressBar}>
          <View style={[
            styles.progressFill,
            { width: step === "intake" ? "33%" : step === "pillars" ? "66%" : "100%" },
          ]} />
        </View>
        
        {step === "intake" && renderIntakeStep()}
        {step === "pillars" && renderPillarsStep()}
        {step === "confirm" && renderConfirmStep()}
        
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          {step !== "intake" && (
            <Pressable style={styles.backButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          )}
          
          {step !== "confirm" ? (
            <Pressable
              style={[styles.nextButton, suggestMutation.isPending && styles.buttonDisabled]}
              onPress={handleNext}
              disabled={suggestMutation.isPending}
            >
              {suggestMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
              ) : (
                <>
                  <Text style={styles.nextButtonText}>Next</Text>
                  <Ionicons name="arrow-forward" size={20} color={Colors.dark.backgroundRoot} />
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[
                styles.saveButton,
                (saveMutation.isPending || (!confirmedLevel)) && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={saveMutation.isPending || !confirmedLevel}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.dark.backgroundRoot} />
                  <Text style={styles.saveButtonText}>Confirm Baseline</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: 700,
    color: Colors.dark.text,
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  stepIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    fontSize: FontSizes.sm,
    fontWeight: 600,
    color: Colors.dark.primary,
  },
  progressBar: {
    height: 3,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginHorizontal: Spacing.lg,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  stepContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  stepTitle: {
    fontSize: FontSizes.xl,
    fontWeight: 700,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xl,
  },
  questionGroup: {
    marginBottom: Spacing.xl,
  },
  questionLabel: {
    fontSize: FontSizes.md,
    fontWeight: 600,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  optionButtonWide: {
    flex: 1,
  },
  optionButtonActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  optionText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  optionTextActive: {
    color: Colors.dark.primary,
    fontWeight: 600,
  },
  pillarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  pillarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pillarIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pillarName: {
    fontSize: FontSizes.md,
    fontWeight: 500,
    color: Colors.dark.text,
  },
  ratingButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  ratingButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingButtonText: {
    fontSize: FontSizes.md,
    fontWeight: 700,
    color: Colors.dark.textMuted,
  },
  legendContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  suggestionCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  suggestionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  suggestionLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.xpCyan,
    fontWeight: 500,
  },
  suggestionLevel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  suggestionLevelText: {
    fontSize: FontSizes["2xl"],
    fontWeight: 700,
  },
  confidenceBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.xpCyan + "20",
    borderRadius: BorderRadius.sm,
  },
  confidenceText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.xpCyan,
    fontWeight: 500,
  },
  ageNote: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  selectLabel: {
    fontSize: FontSizes.md,
    fontWeight: 600,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  levelGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  stageColumn: {
    flex: 1,
    gap: Spacing.sm,
  },
  stageBadge: {
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  stageBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: 700,
  },
  levelButton: {
    position: "relative",
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
  },
  levelButtonSuggested: {
    borderColor: Colors.dark.xpCyan + "50",
    borderStyle: "dashed",
  },
  levelButtonText: {
    fontSize: FontSizes.md,
    fontWeight: 600,
    color: Colors.dark.textMuted,
  },
  suggestedIcon: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  overrideSection: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.orange + "40",
  },
  overrideLabel: {
    fontSize: FontSizes.sm,
    fontWeight: 600,
    color: Colors.dark.orange,
    marginBottom: Spacing.md,
  },
  overrideOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  overrideOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  overrideOptionActive: {
    backgroundColor: Colors.dark.orange + "20",
    borderColor: Colors.dark.orange,
  },
  overrideOptionText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  overrideOptionTextActive: {
    color: Colors.dark.orange,
    fontWeight: 500,
  },
  overrideNoteInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    minHeight: 60,
    textAlignVertical: "top",
  },
  footer: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  backButtonText: {
    fontSize: FontSizes.md,
    color: Colors.dark.text,
  },
  nextButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
  },
  nextButtonText: {
    fontSize: FontSizes.md,
    fontWeight: 600,
    color: Colors.dark.backgroundRoot,
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
  },
  saveButtonText: {
    fontSize: FontSizes.md,
    fontWeight: 600,
    color: Colors.dark.backgroundRoot,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
