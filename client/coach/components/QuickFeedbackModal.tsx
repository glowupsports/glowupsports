import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, getPlayerLevelColor, GlowColors, TextColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { AnimatedCheck } from "@/components/AnimatedCheck";
import { SuccessToast } from "@/components/SuccessToast";

interface Player {
  id: string;
  name: string;
  ballLevel?: string | null;
}

interface Session {
  id: string;
  players?: Player[];
}

interface Skill {
  id: string;
  name: string;
  pillarId: string;
  pillarName?: string;
}

interface Rubric {
  id: string;
  skillId: string;
  score: number;
  observable: string;
}

interface QuickFeedbackModalProps {
  visible: boolean;
  session: Session | null;
  onClose: () => void;
  onComplete: () => void;
}

type RatingValue = 0 | 1 | 2;
type OverallStatus = "improved" | "stable" | "declined";

interface SkillScore {
  skillId: string;
  score: RatingValue;
}

interface PlayerFeedback {
  playerId: string;
  effort: RatingValue;
  execution: RatingValue;
  understanding: RatingValue;
  overall: OverallStatus;
  skillScores: SkillScore[];
}

const RUBRIC_LABELS: Record<RatingValue, { label: string; shortLabel: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  0: { label: "Not Yet", shortLabel: "0", color: Colors.dark.error, icon: "close-circle" },
  1: { label: "Emerging", shortLabel: "1", color: Colors.dark.orange, icon: "ellipse-outline" },
  2: { label: "Achieved", shortLabel: "2", color: Colors.dark.primary, icon: "checkmark-circle" },
};

const OVERALL_OPTIONS: { value: OverallStatus; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { value: "improved", label: "Improved", icon: "trending-up", color: Colors.dark.primary },
  { value: "stable", label: "Stable", icon: "remove", color: Colors.dark.orange },
  { value: "declined", label: "Declined", icon: "trending-down", color: Colors.dark.error },
];

const PILLAR_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  TECHNIQUE: "construct",
  TACTICAL: "bulb",
  PHYSICAL: "barbell",
  MENTAL: "brain",
  SOCIAL: "people",
  MATCH: "trophy",
};

const PILLAR_COLORS: Record<string, string> = {
  TECHNIQUE: "#10B981",
  TACTICAL: "#F59E0B",
  PHYSICAL: "#EF4444",
  MENTAL: "#8B5CF6",
  SOCIAL: "#EC4899",
  MATCH: "#3B82F6",
};

export default function QuickFeedbackModal({
  visible,
  session,
  onClose,
  onComplete,
}: QuickFeedbackModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [feedbacks, setFeedbacks] = useState<Map<string, PlayerFeedback>>(new Map());
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [selectedSkillForRubric, setSelectedSkillForRubric] = useState<string | null>(null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [successToastVisible, setSuccessToastVisible] = useState(false);
  
  const players = session?.players || [];
  const currentPlayer = players[currentPlayerIndex];
  
  const { data: suggestedSkills, isLoading: loadingSkills } = useQuery<Skill[]>({
    queryKey: ["/api/glow/players", currentPlayer?.id, "suggested-skills"],
    queryFn: async () => {
      if (!currentPlayer) return [];
      const url = new URL(`/api/glow/players/${currentPlayer.id}/suggested-skills`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: visible && !!currentPlayer?.id,
  });

  const { data: rubrics } = useQuery<Rubric[]>({
    queryKey: ["/api/glow/skills", selectedSkillForRubric, "rubrics"],
    queryFn: async () => {
      if (!selectedSkillForRubric) return [];
      const url = new URL(`/api/glow/skills/${selectedSkillForRubric}/rubrics`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedSkillForRubric,
  });
  
  useEffect(() => {
    if (visible && players.length > 0) {
      const initial = new Map<string, PlayerFeedback>();
      players.forEach(p => {
        initial.set(p.id, {
          playerId: p.id,
          effort: 1,
          execution: 1,
          understanding: 1,
          overall: "stable",
          skillScores: [],
        });
      });
      setFeedbacks(initial);
      setCurrentPlayerIndex(0);
      setSelectedSkillForRubric(null);
    }
  }, [visible, players.length]);
  
  const submitMutation = useMutation({
    mutationFn: async (data: PlayerFeedback[]) => {
      if (!session) throw new Error("No session");
      const results = [];
      for (const feedback of data) {
        const skillRatings = feedback.skillScores.reduce((acc, ss) => {
          acc[ss.skillId] = { score: ss.score };
          return acc;
        }, {} as Record<string, { score: number }>);
        
        const res = await apiRequest("POST", `/api/glow/sessions/${session.id}/feedback`, {
          playerId: feedback.playerId,
          effort: feedback.effort,
          execution: feedback.execution,
          understanding: feedback.understanding,
          overall: feedback.overall,
          skillRatings: Object.keys(skillRatings).length > 0 ? skillRatings : undefined,
        });
        results.push(await res.json());
      }
      return results;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      setShowSuccessAnimation(true);
      setSuccessToastVisible(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setSuccessToastVisible(false);
        onComplete();
      }, 1500);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to save feedback");
    },
  });
  
  const getCurrentFeedback = (): PlayerFeedback | null => {
    if (!currentPlayer) return null;
    return feedbacks.get(currentPlayer.id) || null;
  };
  
  const updateFeedback = (field: keyof PlayerFeedback, value: any) => {
    if (!currentPlayer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFeedbacks(prev => {
      const updated = new Map(prev);
      const current = updated.get(currentPlayer.id);
      if (current) {
        updated.set(currentPlayer.id, { ...current, [field]: value });
      }
      return updated;
    });
  };
  
  const setSkillScore = (skillId: string, score: RatingValue) => {
    if (!currentPlayer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFeedbacks(prev => {
      const updated = new Map(prev);
      const current = updated.get(currentPlayer.id);
      if (current) {
        const existingIndex = current.skillScores.findIndex(ss => ss.skillId === skillId);
        let newSkillScores: SkillScore[];
        if (existingIndex >= 0) {
          newSkillScores = [...current.skillScores];
          newSkillScores[existingIndex] = { skillId, score };
        } else {
          newSkillScores = [...current.skillScores, { skillId, score }];
        }
        updated.set(currentPlayer.id, { ...current, skillScores: newSkillScores });
      }
      return updated;
    });
    setSelectedSkillForRubric(null);
  };

  const removeSkillScore = (skillId: string) => {
    if (!currentPlayer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFeedbacks(prev => {
      const updated = new Map(prev);
      const current = updated.get(currentPlayer.id);
      if (current) {
        const newSkillScores = current.skillScores.filter(ss => ss.skillId !== skillId);
        updated.set(currentPlayer.id, { ...current, skillScores: newSkillScores });
      }
      return updated;
    });
  };

  const getSkillScore = (skillId: string): RatingValue | null => {
    const feedback = getCurrentFeedback();
    if (!feedback) return null;
    const ss = feedback.skillScores.find(s => s.skillId === skillId);
    return ss ? ss.score : null;
  };
  
  const handleNext = () => {
    if (currentPlayerIndex < players.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCurrentPlayerIndex(prev => prev + 1);
      setShowSkillPicker(false);
      setSelectedSkillForRubric(null);
    } else {
      handleSubmit();
    }
  };
  
  const handlePrevious = () => {
    if (currentPlayerIndex > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentPlayerIndex(prev => prev - 1);
      setShowSkillPicker(false);
      setSelectedSkillForRubric(null);
    }
  };
  
  const handleSubmit = () => {
    const allFeedback = Array.from(feedbacks.values());
    submitMutation.mutate(allFeedback);
  };
  
  const currentFeedback = getCurrentFeedback();
  
  if (!visible || !session) return null;
  
  if (players.length === 0) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <LinearGradient colors={[Colors.dark.backgroundDefault, Colors.dark.backgroundRoot]} style={StyleSheet.absoluteFill} />
          <View style={styles.header}>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.title}>Quick Feedback</Text>
            <View style={{ width: 32 }} />
          </View>
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={Colors.dark.disabled} />
            <Text style={styles.emptyText}>No players in this session</Text>
          </View>
        </View>
      </Modal>
    );
  }

  const selectedSkill = suggestedSkills?.find(s => s.id === selectedSkillForRubric);
  
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <LinearGradient colors={[Colors.dark.backgroundDefault, Colors.dark.backgroundRoot]} style={StyleSheet.absoluteFill} />
        
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Quick Feedback</Text>
            <Text style={styles.progress}>{currentPlayerIndex + 1} of {players.length}</Text>
          </View>
          <View style={{ width: 32 }} />
        </View>
        
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((currentPlayerIndex + 1) / players.length) * 100}%` }]} />
        </View>
        
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.playerCard}>
            {currentPlayer?.ballLevel ? (
              <View style={[styles.levelBadge, { backgroundColor: getPlayerLevelColor(currentPlayer.ballLevel) }]}>
                <Text style={styles.levelText}>{currentPlayer.ballLevel}</Text>
              </View>
            ) : null}
            <Text style={styles.playerName}>{currentPlayer?.name}</Text>
          </View>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Effort</Text>
            <Text style={styles.sectionDesc}>How hard did they work today?</Text>
            <View style={styles.ratingRow}>
              {([0, 1, 2] as RatingValue[]).map(val => {
                const opt = RUBRIC_LABELS[val];
                const isSelected = currentFeedback?.effort === val;
                return (
                  <Pressable
                    key={val}
                    style={[styles.ratingButton, isSelected && { backgroundColor: opt.color + "30", borderColor: opt.color }]}
                    onPress={() => updateFeedback("effort", val)}
                  >
                    <Ionicons name={opt.icon} size={24} color={isSelected ? opt.color : Colors.dark.disabled} />
                    <Text style={[styles.ratingLabel, isSelected && { color: opt.color }]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Execution</Text>
            <Text style={styles.sectionDesc}>Technical skill application</Text>
            <View style={styles.ratingRow}>
              {([0, 1, 2] as RatingValue[]).map(val => {
                const opt = RUBRIC_LABELS[val];
                const isSelected = currentFeedback?.execution === val;
                return (
                  <Pressable
                    key={val}
                    style={[styles.ratingButton, isSelected && { backgroundColor: opt.color + "30", borderColor: opt.color }]}
                    onPress={() => updateFeedback("execution", val)}
                  >
                    <Ionicons name={opt.icon} size={24} color={isSelected ? opt.color : Colors.dark.disabled} />
                    <Text style={[styles.ratingLabel, isSelected && { color: opt.color }]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Understanding</Text>
            <Text style={styles.sectionDesc}>Grasped concepts and instructions</Text>
            <View style={styles.ratingRow}>
              {([0, 1, 2] as RatingValue[]).map(val => {
                const opt = RUBRIC_LABELS[val];
                const isSelected = currentFeedback?.understanding === val;
                return (
                  <Pressable
                    key={val}
                    style={[styles.ratingButton, isSelected && { backgroundColor: opt.color + "30", borderColor: opt.color }]}
                    onPress={() => updateFeedback("understanding", val)}
                  >
                    <Ionicons name={opt.icon} size={24} color={isSelected ? opt.color : Colors.dark.disabled} />
                    <Text style={[styles.ratingLabel, isSelected && { color: opt.color }]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overall Progress</Text>
            <Text style={styles.sectionDesc}>Compared to last session</Text>
            <View style={styles.overallRow}>
              {OVERALL_OPTIONS.map(opt => {
                const isSelected = currentFeedback?.overall === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.overallButton, isSelected && { backgroundColor: opt.color + "30", borderColor: opt.color }]}
                    onPress={() => updateFeedback("overall", opt.value)}
                  >
                    <Ionicons name={opt.icon} size={20} color={isSelected ? opt.color : Colors.dark.disabled} />
                    <Text style={[styles.overallLabel, isSelected && { color: opt.color }]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          
          <View style={styles.section}>
            <Pressable style={styles.skillsHeader} onPress={() => { setShowSkillPicker(!showSkillPicker); setSelectedSkillForRubric(null); }}>
              <View>
                <Text style={styles.sectionTitle}>Skill Observations (0/1/2)</Text>
                <Text style={styles.sectionDesc}>
                  {currentFeedback?.skillScores.length ? `${currentFeedback.skillScores.length} skills scored` : "Tap to add skill scores"}
                </Text>
              </View>
              <Ionicons name={showSkillPicker ? "chevron-up" : "chevron-down"} size={24} color={Colors.dark.disabled} />
            </Pressable>

            {currentFeedback && currentFeedback.skillScores.length > 0 ? (
              <View style={styles.scoredSkillsList}>
                {currentFeedback.skillScores.map(ss => {
                  const skill = suggestedSkills?.find(s => s.id === ss.skillId);
                  const opt = RUBRIC_LABELS[ss.score];
                  const pillarColor = skill ? PILLAR_COLORS[skill.pillarId] || Colors.dark.primary : Colors.dark.primary;
                  return (
                    <View key={ss.skillId} style={[styles.scoredSkillChip, { borderColor: pillarColor }]}>
                      <Ionicons name={opt.icon} size={14} color={opt.color} />
                      <Text style={[styles.scoredSkillName, { color: pillarColor }]} numberOfLines={1}>
                        {skill?.name || ss.skillId}
                      </Text>
                      <View style={[styles.scoreBadge, { backgroundColor: opt.color }]}>
                        <Text style={styles.scoreBadgeText}>{ss.score}</Text>
                      </View>
                      <Pressable onPress={() => removeSkillScore(ss.skillId)} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color={Colors.dark.disabled} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}
            
            {showSkillPicker && !selectedSkillForRubric ? (
              <View style={styles.skillsGrid}>
                {loadingSkills ? (
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
                ) : suggestedSkills && suggestedSkills.length > 0 ? (
                  suggestedSkills.map(skill => {
                    const existingScore = getSkillScore(skill.id);
                    const pillarColor = PILLAR_COLORS[skill.pillarId] || Colors.dark.primary;
                    const isScored = existingScore !== null;
                    return (
                      <Pressable
                        key={skill.id}
                        style={[
                          styles.skillChip, 
                          isScored && { backgroundColor: pillarColor + "20", borderColor: pillarColor }
                        ]}
                        onPress={() => setSelectedSkillForRubric(skill.id)}
                      >
                        <Ionicons
                          name={PILLAR_ICONS[skill.pillarId] || "ellipse"}
                          size={14}
                          color={isScored ? pillarColor : Colors.dark.disabled}
                        />
                        <Text style={[styles.skillChipText, isScored && { color: pillarColor }]} numberOfLines={1}>
                          {skill.name}
                        </Text>
                        {isScored ? (
                          <View style={[styles.miniScoreBadge, { backgroundColor: RUBRIC_LABELS[existingScore].color }]}>
                            <Text style={styles.miniScoreText}>{existingScore}</Text>
                          </View>
                        ) : (
                          <Ionicons name="add-circle-outline" size={14} color={Colors.dark.disabled} />
                        )}
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.noSkillsText}>No skills available for this level</Text>
                )}
              </View>
            ) : null}

            {selectedSkillForRubric && selectedSkill ? (
              <View style={styles.rubricPanel}>
                <View style={styles.rubricHeader}>
                  <View style={styles.rubricTitleRow}>
                    <Ionicons 
                      name={PILLAR_ICONS[selectedSkill.pillarId] || "ellipse"} 
                      size={18} 
                      color={PILLAR_COLORS[selectedSkill.pillarId] || Colors.dark.primary} 
                    />
                    <Text style={styles.rubricTitle}>{selectedSkill.name}</Text>
                  </View>
                  <Pressable onPress={() => setSelectedSkillForRubric(null)}>
                    <Ionicons name="close" size={20} color={Colors.dark.disabled} />
                  </Pressable>
                </View>
                
                <View style={styles.rubricOptions}>
                  {([0, 1, 2] as RatingValue[]).map(score => {
                    const opt = RUBRIC_LABELS[score];
                    const rubric = rubrics?.find(r => r.score === score);
                    const currentScore = getSkillScore(selectedSkill.id);
                    const isSelected = currentScore === score;
                    
                    return (
                      <Pressable
                        key={score}
                        style={[
                          styles.rubricOption,
                          isSelected && { backgroundColor: opt.color + "20", borderColor: opt.color }
                        ]}
                        onPress={() => setSkillScore(selectedSkill.id, score)}
                      >
                        <View style={styles.rubricScoreHeader}>
                          <View style={[styles.rubricScoreBadge, { backgroundColor: opt.color }]}>
                            <Text style={styles.rubricScoreText}>{score}</Text>
                          </View>
                          <Text style={[styles.rubricScoreLabel, isSelected && { color: opt.color }]}>
                            {opt.label}
                          </Text>
                          {isSelected ? (
                            <Ionicons name="checkmark-circle" size={18} color={opt.color} style={{ marginLeft: "auto" }} />
                          ) : null}
                        </View>
                        {rubric ? (
                          <Text style={styles.rubricObservable}>{rubric.observable}</Text>
                        ) : (
                          <Text style={styles.rubricObservablePlaceholder}>No observable criteria defined</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
          
          <View style={{ height: 100 }} />
        </ScrollView>
        
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Pressable
            style={[styles.navButton, currentPlayerIndex === 0 && styles.navButtonDisabled]}
            onPress={handlePrevious}
            disabled={currentPlayerIndex === 0}
          >
            <Ionicons name="chevron-back" size={20} color={currentPlayerIndex === 0 ? Colors.dark.disabled : Colors.dark.text} />
            <Text style={[styles.navButtonText, currentPlayerIndex === 0 && styles.navButtonTextDisabled]}>Back</Text>
          </Pressable>
          
          <Pressable
            style={[styles.nextButton, submitMutation.isPending && styles.nextButtonDisabled]}
            onPress={handleNext}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <>
                <Text style={styles.nextButtonText}>
                  {currentPlayerIndex === players.length - 1 ? "Submit All" : "Next"}
                </Text>
                <Ionicons
                  name={currentPlayerIndex === players.length - 1 ? "checkmark" : "chevron-forward"}
                  size={20}
                  color={Colors.dark.buttonText}
                />
              </>
            )}
          </Pressable>
        </View>

        {showSuccessAnimation && (
          <View style={styles.animationOverlay}>
            <AnimatedCheck
              size={64}
              variant="glow"
              autoPlay={true}
              onComplete={() => {
                setShowSuccessAnimation(false);
              }}
            />
          </View>
        )}

        <SuccessToast
          visible={successToastVisible}
          message="Feedback saved successfully"
          variant="success"
          duration={1500}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  animationOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  headerCenter: {
    alignItems: "center",
  },
  title: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  progress: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    marginTop: 2,
  },
  progressBar: {
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.disabled,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  levelBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  levelText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.buttonText,
    textTransform: "uppercase",
  },
  playerName: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  section: {
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    fontSize: Typography.sectionTitle.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionDesc: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  ratingButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    gap: Spacing.xs,
  },
  ratingLabel: {
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
    color: Colors.dark.disabled,
  },
  overallRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  overallButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    gap: Spacing.xs,
  },
  overallLabel: {
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
    color: Colors.dark.disabled,
  },
  skillsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scoredSkillsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  scoredSkillChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  scoredSkillName: {
    fontSize: Typography.small.fontSize,
    maxWidth: 100,
  },
  scoreBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  skillsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  skillChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  skillChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    maxWidth: 100,
  },
  miniScoreBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  miniScoreText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  noSkillsText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    fontStyle: "italic",
  },
  rubricPanel: {
    marginTop: Spacing.md,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    padding: Spacing.md,
  },
  rubricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  rubricTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rubricTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  rubricOptions: {
    gap: Spacing.sm,
  },
  rubricOption: {
    padding: Spacing.md,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  rubricScoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  rubricScoreBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rubricScoreText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  rubricScoreLabel: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.disabled,
  },
  rubricObservable: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textSecondary,
    marginLeft: 32,
  },
  rubricObservablePlaceholder: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    fontStyle: "italic",
    marginLeft: 32,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    backgroundColor: Colors.dark.backgroundDefault,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    padding: Spacing.md,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  navButtonTextDisabled: {
    color: Colors.dark.disabled,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
});
