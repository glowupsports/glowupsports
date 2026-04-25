import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, BorderRadius, FontSizes, GlowColors } from "@/constants/theme";
import { apiRequest, queryClient } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface GlowAssessmentFlowProps {
  playerId: string;
  playerName: string;
  currentLevel?: string;
  onComplete: (result: AssessmentResult) => void;
  onCancel: () => void;
}

interface AssessmentResult {
  playerId: string;
  levelId: string;
  pillarScores: Record<string, { achieved: number; total: number; percentage: number }>;
  weightedScore: number;
  promotionReady: boolean;
}

interface SkillRubric {
  score: number;
  label: string;
  observable: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  category?: string;
  rubric: SkillRubric[];
}

interface CategoryGroup {
  category: string;
  skills: Skill[];
}

interface LevelData {
  levelId: string;
  rank: number;
  name: string;
  subtitle: string;
  philosophy: string;
  pillarWeighting: Record<string, number>;
  skillsByPillar: Record<string, CategoryGroup[]>;
  totalSkills: number;
  isDataDriven: boolean;
}

const PILLARS = [
  { id: "TECHNIQUE", label: "Technique", icon: "tennisball-outline" as const, color: "#4CAF50" },
  { id: "TACTICAL", label: "Tactical", icon: "bulb-outline" as const, color: "#2196F3" },
  { id: "PHYSICAL", label: "Physical", icon: "fitness-outline" as const, color: "#FF9800" },
  { id: "MENTAL", label: "Mental", icon: "analytics-outline" as const, color: "#9C27B0" },
  { id: "SOCIAL", label: "Social", icon: "people-outline" as const, color: "#E91E63" },
  { id: "MATCH", label: "Match", icon: "trophy-outline" as const, color: "#FFC107" },
];

const GLOW_LEVELS = [
  { id: "GLOW_9", rank: 9, name: "Absolute Beginner", color: "#6B7280" },
  { id: "GLOW_8", rank: 8, name: "Beginner+", color: "#10B981" },
  { id: "GLOW_7", rank: 7, name: "Intermediate", color: "#F59E0B" },
  { id: "GLOW_6", rank: 6, name: "Competitive", color: "#3B82F6" },
  { id: "GLOW_5", rank: 5, name: "Performance", color: "#8B5CF6" },
  { id: "GLOW_4", rank: 4, name: "Elite Performance", color: "#EC4899" },
  { id: "GLOW_3", rank: 3, name: "Elite", color: "#EF4444" },
  { id: "GLOW_2", rank: 2, name: "Performance Talent", color: "#F97316" },
  { id: "GLOW_1", rank: 1, name: "Elite Semi-Pro", color: "#FFD700" },
];

export function GlowAssessmentFlow({
  playerId,
  playerName,
  currentLevel = "GLOW_9",
  onComplete,
  onCancel,
}: GlowAssessmentFlowProps) {
  const [step, setStep] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState(currentLevel);
  const [currentPillarIndex, setCurrentPillarIndex] = useState(0);
  const [skillScores, setSkillScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");

  const { data: levelData, isLoading: loadingLevel } = useQuery<LevelData>({
    queryKey: ["/api/glow/adult-levels", selectedLevel],
    enabled: step >= 1 && !!selectedLevel,
  });

  const saveAssessment = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/glow/players/${playerId}/assessment`, {
        levelId: selectedLevel,
        skillScores,
        notes,
      });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/glow/players", playerId] });
      onComplete(result);
    },
  });

  const currentPillar = PILLARS[currentPillarIndex];
  const pillarCategories = levelData?.skillsByPillar?.[currentPillar.id] || [];
  const isDataDriven = levelData?.isDataDriven || false;

  const getPillarProgress = useCallback((pillarId: string) => {
    if (!levelData?.skillsByPillar?.[pillarId]) return { scored: 0, total: 0 };
    const categories = levelData.skillsByPillar[pillarId];
    let scored = 0;
    let total = 0;
    for (const cat of categories) {
      for (const skill of cat.skills) {
        total++;
        if (skillScores[skill.id] !== undefined) scored++;
      }
    }
    return { scored, total };
  }, [levelData, skillScores]);

  const handleScoreSkill = (skillId: string, score: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSkillScores((prev) => ({ ...prev, [skillId]: score }));
  };

  const handleNextPillar = () => {
    if (currentPillarIndex < PILLARS.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCurrentPillarIndex(currentPillarIndex + 1);
    } else {
      setStep(3);
    }
  };

  const handlePrevPillar = () => {
    if (currentPillarIndex > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentPillarIndex(currentPillarIndex - 1);
    } else {
      setStep(0);
    }
  };

  const totalSkillsScored = Object.keys(skillScores).length;
  const totalSkills = levelData?.totalSkills || 0;
  const allScored = totalSkillsScored === totalSkills && totalSkills > 0;

  if (step === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.textMuted} />
          </Pressable>
          <Text style={styles.title}>Glow Assessment</Text>
          <Text style={styles.subtitle}>{playerName}</Text>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Select Glow Level to Assess</Text>
          <Text style={styles.sectionHint}>
            Choose the level you want to evaluate this player at
          </Text>

          <View style={styles.levelGrid}>
            {GLOW_LEVELS.map((level) => {
              const isSelected = selectedLevel === level.id;
              return (
                <Pressable
                  key={level.id}
                  style={[
                    styles.levelCard,
                    isSelected && { borderColor: level.color, borderWidth: 2 },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedLevel(level.id);
                  }}
                >
                  <View style={[styles.levelBadge, { backgroundColor: level.color }]}>
                    <Text style={styles.levelRank}>{level.rank}</Text>
                  </View>
                  <Text style={styles.levelName}>{level.name}</Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={level.color} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.nextButton, !selectedLevel && styles.disabledButton]}
            onPress={() => {
              if (selectedLevel) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setStep(1);
              }
            }}
            disabled={!selectedLevel}
          >
            <LinearGradient
              colors={[GlowColors.primary, GlowColors.dark]}
              style={styles.nextButtonGradient}
            >
              <Text style={styles.nextButtonText}>Start Assessment</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.dark.buttonText} />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === 1 && loadingLevel) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={GlowColors.primary} />
        <Text style={styles.loadingText}>Loading skills...</Text>
      </View>
    );
  }

  if (step === 1 && isDataDriven) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setStep(0)} style={styles.closeButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.textMuted} />
          </Pressable>
          <Text style={styles.title}>{levelData?.name}</Text>
          <Text style={styles.subtitle}>Data-Driven Level</Text>
        </View>

        <View style={[styles.content, styles.centered]}>
          <View style={styles.dataDrivenCard}>
            <Ionicons name="analytics-outline" size={64} color={GlowColors.primary} />
            <Text style={styles.dataDrivenTitle}>Match Data Required</Text>
            <Text style={styles.dataDrivenText}>
              {levelData?.philosophy}
            </Text>
            <Text style={styles.dataDrivenHint}>
              Glow levels 5-1 are determined by match history, win rates, and consistency over time.
              Coach assessments supplement but don&apos;t replace match data at these levels.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.cancelButton} onPress={() => setStep(0)}>
            <Text style={styles.cancelButtonText}>Back</Text>
          </Pressable>
          <Pressable
            style={styles.nextButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setStep(2);
            }}
          >
            <LinearGradient
              colors={[GlowColors.primary, GlowColors.dark]}
              style={styles.nextButtonGradient}
            >
              <Text style={styles.nextButtonText}>Continue Anyway</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.dark.buttonText} />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === 1 || step === 2) {
    if (step === 1) setStep(2);

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handlePrevPillar} style={styles.closeButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.textMuted} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>{currentPillar.label}</Text>
            <Text style={styles.subtitle}>
              {levelData?.name} - Pillar {currentPillarIndex + 1}/6
            </Text>
          </View>
          <View style={[styles.pillarBadge, { backgroundColor: currentPillar.color }]}>
            <Text style={styles.pillarWeight}>
              {levelData?.pillarWeighting?.[currentPillar.id.toLowerCase()]}%
            </Text>
          </View>
        </View>

        <View style={styles.pillarNav}>
          {PILLARS.map((pillar, idx) => {
            const progress = getPillarProgress(pillar.id);
            const isComplete = progress.scored === progress.total && progress.total > 0;
            const isCurrent = idx === currentPillarIndex;
            return (
              <Pressable
                key={pillar.id}
                style={[
                  styles.pillarTab,
                  isCurrent && { borderBottomColor: pillar.color, borderBottomWidth: 2 },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCurrentPillarIndex(idx);
                }}
              >
                <Ionicons
                  name={isComplete ? "checkmark-circle" : pillar.icon}
                  size={20}
                  color={isCurrent ? pillar.color : isComplete ? GlowColors.primary : Colors.dark.textMuted}
                />
              </Pressable>
            );
          })}
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {pillarCategories.length === 0 ? (
            <View style={styles.emptyPillar}>
              <Ionicons name="information-circle-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No skills for this pillar at this level</Text>
            </View>
          ) : (
            pillarCategories.map((catGroup, catIdx) => (
              <View key={catGroup.category + catIdx} style={styles.categorySection}>
                {catGroup.category !== "General" && (
                  <Text style={styles.categoryTitle}>{catGroup.category}</Text>
                )}
                {catGroup.skills.map((skill) => (
                  <SkillCheckItem
                    key={skill.id}
                    skill={skill}
                    score={skillScores[skill.id]}
                    onScore={(score) => handleScoreSkill(skill.id, score)}
                    color={currentPillar.color}
                  />
                ))}
              </View>
            ))
          )}
          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.progressInfo}>
            <Text style={styles.progressText}>
              {totalSkillsScored}/{totalSkills} skills scored
            </Text>
          </View>
          <Pressable
            style={styles.nextButton}
            onPress={handleNextPillar}
          >
            <LinearGradient
              colors={[currentPillar.color, currentPillar.color + "CC"]}
              style={styles.nextButtonGradient}
            >
              <Text style={styles.nextButtonText}>
                {currentPillarIndex < PILLARS.length - 1 ? "Next Pillar" : "Review"}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === 3) {
    const calculatePillarScores = () => {
      const scores: Record<string, { achieved: number; total: number; pct: number }> = {};
      for (const pillar of PILLARS) {
        const categories = levelData?.skillsByPillar?.[pillar.id] || [];
        let achieved = 0;
        let total = 0;
        for (const cat of categories) {
          for (const skill of cat.skills) {
            total += 2;
            achieved += skillScores[skill.id] || 0;
          }
        }
        scores[pillar.id] = {
          achieved,
          total,
          pct: total > 0 ? Math.round((achieved / total) * 100) : 0,
        };
      }
      return scores;
    };

    const pillarScores = calculatePillarScores();
    const weightedTotal = PILLARS.reduce((sum, p) => {
      const weight = levelData?.pillarWeighting?.[p.id.toLowerCase()] || 0;
      return sum + (pillarScores[p.id].pct * weight) / 100;
    }, 0);

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setStep(2)} style={styles.closeButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.textMuted} />
          </Pressable>
          <Text style={styles.title}>Review Assessment</Text>
          <Text style={styles.subtitle}>{playerName} - {levelData?.name}</Text>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <View style={styles.overallScore}>
              <Text style={styles.overallScoreValue}>{Math.round(weightedTotal)}%</Text>
              <Text style={styles.overallScoreLabel}>Weighted Score</Text>
            </View>

            {PILLARS.map((pillar) => {
              const score = pillarScores[pillar.id];
              const weight = levelData?.pillarWeighting?.[pillar.id.toLowerCase()] || 0;
              return (
                <View key={pillar.id} style={styles.pillarScoreRow}>
                  <View style={styles.pillarScoreLeft}>
                    <Ionicons name={pillar.icon} size={20} color={pillar.color} />
                    <Text style={styles.pillarScoreName}>{pillar.label}</Text>
                    <Text style={styles.pillarWeight}>({weight}%)</Text>
                  </View>
                  <View style={styles.pillarScoreRight}>
                    <View style={styles.pillarBar}>
                      <View
                        style={[
                          styles.pillarBarFill,
                          { width: `${score.pct}%`, backgroundColor: pillar.color },
                        ]}
                      />
                    </View>
                    <Text style={styles.pillarScoreValue}>{score.pct}%</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.promotionCard}>
            <Ionicons
              name={weightedTotal >= 60 ? "checkmark-circle" : "alert-circle"}
              size={32}
              color={weightedTotal >= 60 ? GlowColors.primary : Colors.dark.accentWarning}
            />
            <Text style={styles.promotionTitle}>
              {weightedTotal >= 60 ? "Promotion Ready" : "More Work Needed"}
            </Text>
            <Text style={styles.promotionText}>
              {weightedTotal >= 60
                ? `Player meets the criteria for ${levelData?.name}`
                : `Player needs more development at this level`}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.cancelButton} onPress={() => setStep(2)}>
            <Text style={styles.cancelButtonText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[styles.nextButton, saveAssessment.isPending && styles.disabledButton]}
            onPress={() => saveAssessment.mutate()}
            disabled={saveAssessment.isPending}
          >
            <LinearGradient
              colors={[GlowColors.primary, GlowColors.dark]}
              style={styles.nextButtonGradient}
            >
              {saveAssessment.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <>
                  <Text style={styles.nextButtonText}>Save Assessment</Text>
                  <Ionicons name="checkmark" size={18} color={Colors.dark.buttonText} />
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return null;
}

interface SkillCheckItemProps {
  skill: Skill;
  score?: number;
  onScore: (score: number) => void;
  color: string;
}

function SkillCheckItem({ skill, score, onScore, color }: SkillCheckItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.skillItem}>
      <Pressable
        style={styles.skillHeader}
        onPress={() => setExpanded(!expanded)}
      >
        <View style={styles.skillInfo}>
          <Text style={styles.skillName}>{skill.name}</Text>
          <Text style={styles.skillDesc}>{skill.description}</Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={Colors.dark.textMuted}
        />
      </Pressable>

      {expanded && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.rubricList}>
          {skill.rubric.map((r) => {
            const isSelected = score === r.score;
            return (
              <Pressable
                key={r.score}
                style={[
                  styles.rubricItem,
                  isSelected && { borderColor: color, backgroundColor: `${color}15` },
                ]}
                onPress={() => onScore(r.score)}
              >
                <View style={[styles.rubricScore, isSelected && { backgroundColor: color }]}>
                  <Text style={[styles.rubricScoreText, isSelected && { color: "#FFF" }]}>
                    {r.score}
                  </Text>
                </View>
                <View style={styles.rubricContent}>
                  <Text style={[styles.rubricLabel, isSelected && { color }]}>{r.label}</Text>
                  <Text style={styles.rubricObservable}>{r.observable}</Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={20} color={color} />
                )}
              </Pressable>
            );
          })}
        </Animated.View>
      )}

      {!expanded && score !== undefined && (
        <View style={styles.quickScore}>
          {[0, 1, 2].map((s) => (
            <Pressable
              key={s}
              style={[
                styles.quickScoreBtn,
                score === s && { backgroundColor: color },
              ]}
              onPress={() => onScore(s)}
            >
              <Text style={[styles.quickScoreText, score === s && { color: "#FFF" }]}>
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerCenter: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  closeButton: {
    padding: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.lg,
  },
  sectionHint: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  levelGrid: {
    gap: Spacing.sm,
  },
  levelCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.md,
  },
  levelBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  levelRank: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: "#FFF",
  },
  levelName: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    gap: Spacing.md,
  },
  cancelButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  cancelButtonText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  nextButton: {
    flex: 1,
  },
  nextButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  nextButtonText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  disabledButton: {
    opacity: 0.5,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  dataDrivenCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    marginHorizontal: Spacing.lg,
  },
  dataDrivenTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  dataDrivenText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  dataDrivenHint: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.md,
    fontStyle: "italic",
  },
  pillarNav: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  pillarTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  pillarBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  pillarWeight: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: "#FFF",
  },
  categorySection: {
    marginTop: Spacing.lg,
  },
  categoryTitle: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: GlowColors.primary,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  skillItem: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  skillHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
  },
  skillInfo: {
    flex: 1,
  },
  skillName: {
    fontSize: FontSizes.md,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  skillDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  rubricList: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  rubricItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  rubricScore: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
  },
  rubricScoreText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  rubricContent: {
    flex: 1,
  },
  rubricLabel: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  rubricObservable: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  quickScore: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  quickScoreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Backgrounds.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  quickScoreText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  emptyPillar: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  progressInfo: {
    flex: 1,
  },
  progressText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  summaryCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
  },
  overallScore: {
    alignItems: "center",
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    marginBottom: Spacing.lg,
  },
  overallScoreValue: {
    fontSize: 48,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  overallScoreLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  pillarScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  pillarScoreLeft: {
    flexDirection: "row",
    alignItems: "center",
    width: 140,
    gap: Spacing.sm,
  },
  pillarScoreName: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  pillarScoreRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pillarBar: {
    flex: 1,
    height: 8,
    backgroundColor: Backgrounds.surface,
    borderRadius: 4,
    overflow: "hidden",
  },
  pillarBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  pillarScoreValue: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.text,
    width: 40,
    textAlign: "right",
  },
  promotionCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.md,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  promotionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  promotionText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
});
