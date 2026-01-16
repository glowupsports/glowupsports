import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, FontSizes } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface Player {
  id: string;
  name: string;
  ballLevel?: string | null;
}

interface DeepAssessmentDrawerProps {
  visible: boolean;
  player: Player | null;
  onClose: () => void;
}

interface DeepAssessmentSkill {
  id: string;
  pillar: string;
  category: string;
  skillKey: string;
  skillName: string;
  description?: string | null;
  applicableBallLevels?: string[];
  assessment?: {
    id: string;
    score: number | null;
    confidence: string;
    notes?: string | null;
    updatedAt?: string;
  } | null;
}

interface PillarSummary {
  pillar: string;
  totalSkills: number;
  assessedSkills: number;
  averageScore: number | null;
  percentComplete: number;
}

const PILLAR_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  TECHNIQUE: { icon: "tennisball", color: "#10B981", label: "Technique" },
  TACTICAL: { icon: "bulb", color: "#F59E0B", label: "Tactical" },
  PHYSICAL: { icon: "barbell", color: "#EF4444", label: "Physical" },
  MENTAL: { icon: "brain", color: "#8B5CF6", label: "Mental" },
  SOCIAL: { icon: "people", color: "#EC4899", label: "Social" },
  MATCH: { icon: "trophy", color: "#3B82F6", label: "Match" },
};

const SCORE_OPTIONS = [
  { value: null, label: "-", color: Colors.dark.textMuted, description: "Not assessed" },
  { value: 0, label: "0", color: "#6B7280", description: "Not Yet" },
  { value: 1, label: "1", color: "#F59E0B", description: "Developing" },
  { value: 2, label: "2", color: "#10B981", description: "Meets" },
  { value: 3, label: "3", color: Colors.dark.xpCyan, description: "Above" },
];

const CONFIDENCE_OPTIONS = [
  { value: "low", label: "Low", color: Colors.dark.textMuted },
  { value: "medium", label: "Med", color: Colors.dark.orange },
  { value: "high", label: "High", color: Colors.dark.successNeon },
];

export function DeepAssessmentDrawer({ visible, player, onClose }: DeepAssessmentDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<string, { score: number | null; confidence: string }>>(new Map());
  const [saving, setSaving] = useState(false);

  const { data: assessmentData, isLoading } = useQuery<{
    skills: DeepAssessmentSkill[];
    grouped: Record<string, Record<string, DeepAssessmentSkill[]>>;
    summary: PillarSummary[];
    totalSkills: number;
    assessedSkills: number;
  }>({
    queryKey: [`/api/players/${player?.id}/deep-assessment`],
    enabled: visible && !!player?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async (assessments: { skillId: string; score: number | null; confidence: string }[]) => {
      return apiRequest("POST", `/api/players/${player?.id}/deep-assessment/bulk`, { assessments });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${player?.id}/deep-assessment`] });
      setPendingChanges(new Map());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleScoreChange = (skillId: string, score: number | null, confidence: string = "medium") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingChanges(prev => {
      const updated = new Map(prev);
      updated.set(skillId, { score, confidence });
      return updated;
    });
  };

  const handleConfidenceChange = (skillId: string, confidence: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingChanges(prev => {
      const updated = new Map(prev);
      const existing = updated.get(skillId) || { score: null, confidence: "medium" };
      updated.set(skillId, { ...existing, confidence });
      return updated;
    });
  };

  const handleSave = async () => {
    if (pendingChanges.size === 0) return;
    
    setSaving(true);
    const assessments = Array.from(pendingChanges.entries()).map(([skillId, data]) => ({
      skillId,
      score: data.score,
      confidence: data.confidence,
    }));
    
    try {
      await saveMutation.mutateAsync(assessments);
    } finally {
      setSaving(false);
    }
  };

  const getSkillScore = (skill: DeepAssessmentSkill): number | null => {
    const pending = pendingChanges.get(skill.id);
    if (pending !== undefined) return pending.score;
    return skill.assessment?.score ?? null;
  };

  const getSkillConfidence = (skill: DeepAssessmentSkill): string => {
    const pending = pendingChanges.get(skill.id);
    if (pending !== undefined) return pending.confidence;
    return skill.assessment?.confidence || "medium";
  };

  const pillars = useMemo(() => {
    if (!assessmentData?.grouped) return [];
    return Object.keys(assessmentData.grouped).sort();
  }, [assessmentData?.grouped]);

  const getSummaryForPillar = (pillar: string): PillarSummary | undefined => {
    return assessmentData?.summary.find(s => s.pillar === pillar);
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
          <View style={styles.headerLeft}>
            <Ionicons name="analytics" size={24} color={Colors.dark.xpCyan} />
            <View>
              <Text style={styles.headerTitle}>Deep Assessment</Text>
              <Text style={styles.headerSubtitle}>{player.name}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {pendingChanges.size > 0 && (
              <Pressable
                style={styles.saveButton}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <Ionicons name="save" size={16} color="#000" />
                    <Text style={styles.saveButtonText}>Save ({pendingChanges.size})</Text>
                  </>
                )}
              </Pressable>
            )}
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
            <Text style={styles.loadingText}>Loading skills...</Text>
          </View>
        ) : (
          <>
            <View style={styles.overallProgress}>
              <Text style={styles.progressLabel}>
                Overall: {assessmentData?.assessedSkills || 0} / {assessmentData?.totalSkills || 0} skills assessed
              </Text>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${((assessmentData?.assessedSkills || 0) / (assessmentData?.totalSkills || 1)) * 100}%` }
                  ]} 
                />
              </View>
            </View>

            <ScrollView 
              style={styles.scrollView} 
              contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
            >
              {pillars.map(pillar => {
                const config = PILLAR_CONFIG[pillar] || { icon: "help", color: Colors.dark.textMuted, label: pillar };
                const summary = getSummaryForPillar(pillar);
                const categories = assessmentData?.grouped[pillar] || {};
                const isExpanded = expandedPillar === pillar;

                return (
                  <View key={pillar} style={styles.pillarSection}>
                    <Pressable
                      style={[styles.pillarHeader, { borderLeftColor: config.color }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setExpandedPillar(isExpanded ? null : pillar);
                        setExpandedCategory(null);
                      }}
                    >
                      <View style={styles.pillarHeaderLeft}>
                        <View style={[styles.pillarIconContainer, { backgroundColor: config.color + "20" }]}>
                          <Ionicons name={config.icon} size={20} color={config.color} />
                        </View>
                        <View>
                          <Text style={styles.pillarName}>{config.label}</Text>
                          <Text style={styles.pillarStats}>
                            {summary?.assessedSkills || 0}/{summary?.totalSkills || 0} assessed
                            {summary?.averageScore !== null && ` • Avg: ${summary.averageScore.toFixed(1)}`}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.pillarHeaderRight}>
                        <View style={styles.miniProgressBar}>
                          <View 
                            style={[
                              styles.miniProgressFill, 
                              { width: `${summary?.percentComplete || 0}%`, backgroundColor: config.color }
                            ]} 
                          />
                        </View>
                        <Ionicons 
                          name={isExpanded ? "chevron-up" : "chevron-down"} 
                          size={20} 
                          color={Colors.dark.textMuted} 
                        />
                      </View>
                    </Pressable>

                    {isExpanded && (
                      <View style={styles.categoriesContainer}>
                        {Object.entries(categories).map(([category, skills]) => {
                          const categoryKey = `${pillar}_${category}`;
                          const isCategoryExpanded = expandedCategory === categoryKey;
                          const categoryAssessed = skills.filter(s => getSkillScore(s) !== null).length;

                          return (
                            <View key={category} style={styles.categorySection}>
                              <Pressable
                                style={styles.categoryHeader}
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  setExpandedCategory(isCategoryExpanded ? null : categoryKey);
                                }}
                              >
                                <Text style={styles.categoryName}>
                                  {category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, " ")}
                                </Text>
                                <View style={styles.categoryRight}>
                                  <Text style={styles.categoryCount}>{categoryAssessed}/{skills.length}</Text>
                                  <Ionicons 
                                    name={isCategoryExpanded ? "chevron-up" : "chevron-down"} 
                                    size={16} 
                                    color={Colors.dark.textMuted} 
                                  />
                                </View>
                              </Pressable>

                              {isCategoryExpanded && (
                                <View style={styles.skillsList}>
                                  {skills.map(skill => {
                                    const score = getSkillScore(skill);
                                    const confidence = getSkillConfidence(skill);
                                    const hasPending = pendingChanges.has(skill.id);

                                    return (
                                      <View 
                                        key={skill.id} 
                                        style={[styles.skillRow, hasPending && styles.skillRowPending]}
                                      >
                                        <View style={styles.skillInfo}>
                                          <Text style={styles.skillName}>{skill.skillName}</Text>
                                          {skill.description && (
                                            <Text style={styles.skillDescription} numberOfLines={1}>
                                              {skill.description}
                                            </Text>
                                          )}
                                        </View>
                                        
                                        <View style={styles.scoreContainer}>
                                          <View style={styles.scoreButtons}>
                                            {SCORE_OPTIONS.map(option => {
                                              const isSelected = score === option.value;
                                              return (
                                                <Pressable
                                                  key={option.label}
                                                  style={[
                                                    styles.scoreButton,
                                                    isSelected && { backgroundColor: option.color },
                                                  ]}
                                                  onPress={() => handleScoreChange(skill.id, option.value, confidence)}
                                                >
                                                  <Text style={[
                                                    styles.scoreButtonText,
                                                    isSelected && styles.scoreButtonTextSelected,
                                                  ]}>
                                                    {option.label}
                                                  </Text>
                                                </Pressable>
                                              );
                                            })}
                                          </View>
                                          
                                          {score !== null && (
                                            <View style={styles.confidenceButtons}>
                                              {CONFIDENCE_OPTIONS.map(option => {
                                                const isSelected = confidence === option.value;
                                                return (
                                                  <Pressable
                                                    key={option.value}
                                                    style={[
                                                      styles.confidenceButton,
                                                      isSelected && { backgroundColor: option.color + "30", borderColor: option.color },
                                                    ]}
                                                    onPress={() => handleConfidenceChange(skill.id, option.value)}
                                                  >
                                                    <Text style={[
                                                      styles.confidenceButtonText,
                                                      isSelected && { color: option.color },
                                                    ]}>
                                                      {option.label}
                                                    </Text>
                                                  </Pressable>
                                                );
                                              })}
                                            </View>
                                          )}
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}
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
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.xpCyan,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  saveButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: "#000",
  },
  closeButton: {
    padding: Spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
  overallProgress: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  progressLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: 3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  pillarSection: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  pillarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    borderLeftWidth: 4,
  },
  pillarHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  pillarIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  pillarName: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  pillarStats: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  pillarHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  miniProgressBar: {
    width: 60,
    height: 4,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 2,
    overflow: "hidden",
  },
  miniProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
  categoriesContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  categorySection: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    paddingLeft: Spacing.xl,
    backgroundColor: Colors.dark.backgroundRoot + "50",
  },
  categoryName: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  categoryRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  categoryCount: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  skillsList: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  skillRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  skillRowPending: {
    backgroundColor: Colors.dark.xpCyan + "10",
  },
  skillInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  skillName: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
  },
  skillDescription: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  scoreContainer: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  scoreButtons: {
    flexDirection: "row",
    gap: 2,
  },
  scoreButton: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  scoreButtonText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  scoreButtonTextSelected: {
    color: "#000",
  },
  confidenceButtons: {
    flexDirection: "row",
    gap: 2,
  },
  confidenceButton: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  confidenceButtonText: {
    fontSize: 9,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
});
