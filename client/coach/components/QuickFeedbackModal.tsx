import React, { useState, useEffect, useCallback } from "react";
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
import { Colors, Spacing, BorderRadius, Typography, getPlayerLevelColor } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";

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
  pillarName: string;
}

interface QuickFeedbackModalProps {
  visible: boolean;
  session: Session | null;
  onClose: () => void;
  onComplete: () => void;
}

type RatingValue = 0 | 1 | 2;
type OverallStatus = "improved" | "stable" | "declined";

interface PlayerFeedback {
  playerId: string;
  effort: RatingValue;
  execution: RatingValue;
  understanding: RatingValue;
  overall: OverallStatus;
  skillIds: string[];
}

const RATING_LABELS: Record<RatingValue, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  0: { label: "Needs Work", color: Colors.dark.error, icon: "close-circle" },
  1: { label: "Developing", color: Colors.dark.orange, icon: "ellipse-outline" },
  2: { label: "Strong", color: Colors.dark.primary, icon: "checkmark-circle" },
};

const OVERALL_OPTIONS: { value: OverallStatus; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { value: "improved", label: "Improved", icon: "trending-up", color: Colors.dark.primary },
  { value: "stable", label: "Stable", icon: "remove", color: Colors.dark.orange },
  { value: "declined", label: "Declined", icon: "trending-down", color: Colors.dark.error },
];

const PILLAR_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  technical: "construct",
  tactical: "bulb",
  physical: "barbell",
  mental: "brain",
  social: "people",
  match: "trophy",
};

const PILLAR_COLORS: Record<string, string> = {
  technical: "#10B981",
  tactical: "#F59E0B",
  physical: "#EF4444",
  mental: "#8B5CF6",
  social: "#EC4899",
  match: "#3B82F6",
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
  
  const players = session?.players || [];
  const currentPlayer = players[currentPlayerIndex];
  
  const { data: suggestedSkills, isLoading: loadingSkills } = useQuery<Skill[]>({
    queryKey: ["/api/glow/players", currentPlayer?.id, "suggested-skills"],
    queryFn: async () => {
      if (!currentPlayer) return [];
      const url = new URL(`/api/glow/players/${currentPlayer.id}/suggested-skills`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      return res.json();
    },
    enabled: visible && !!currentPlayer?.id,
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
          skillIds: [],
        });
      });
      setFeedbacks(initial);
      setCurrentPlayerIndex(0);
    }
  }, [visible, players.length]);
  
  const submitMutation = useMutation({
    mutationFn: async (data: PlayerFeedback[]) => {
      if (!session) throw new Error("No session");
      const results = [];
      for (const feedback of data) {
        const skillRatings = feedback.skillIds.reduce((acc, skillId) => {
          acc[skillId] = { score: 2 };
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
      onComplete();
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
  
  const toggleSkill = (skillId: string) => {
    if (!currentPlayer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFeedbacks(prev => {
      const updated = new Map(prev);
      const current = updated.get(currentPlayer.id);
      if (current) {
        const skills = current.skillIds.includes(skillId)
          ? current.skillIds.filter(id => id !== skillId)
          : [...current.skillIds, skillId].slice(0, 3);
        updated.set(currentPlayer.id, { ...current, skillIds: skills });
      }
      return updated;
    });
  };
  
  const handleNext = () => {
    if (currentPlayerIndex < players.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCurrentPlayerIndex(prev => prev + 1);
      setShowSkillPicker(false);
    } else {
      handleSubmit();
    }
  };
  
  const handlePrevious = () => {
    if (currentPlayerIndex > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentPlayerIndex(prev => prev - 1);
      setShowSkillPicker(false);
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
            {currentPlayer?.ballLevel?.includes("trial") ? (
              <View style={styles.trialBadge}>
                <Ionicons name="time" size={12} color={Colors.dark.orange} />
                <Text style={styles.trialText}>Trial</Text>
              </View>
            ) : null}
          </View>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Effort</Text>
            <Text style={styles.sectionDesc}>How hard did they work today?</Text>
            <View style={styles.ratingRow}>
              {([0, 1, 2] as RatingValue[]).map(val => {
                const opt = RATING_LABELS[val];
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
                const opt = RATING_LABELS[val];
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
                const opt = RATING_LABELS[val];
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
            <Pressable style={styles.skillsHeader} onPress={() => setShowSkillPicker(!showSkillPicker)}>
              <View>
                <Text style={styles.sectionTitle}>Skills Observed</Text>
                <Text style={styles.sectionDesc}>
                  {currentFeedback?.skillIds.length ? `${currentFeedback.skillIds.length} selected` : "Optional - max 3"}
                </Text>
              </View>
              <Ionicons name={showSkillPicker ? "chevron-up" : "chevron-down"} size={24} color={Colors.dark.disabled} />
            </Pressable>
            
            {showSkillPicker ? (
              <View style={styles.skillsGrid}>
                {loadingSkills ? (
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
                ) : suggestedSkills && suggestedSkills.length > 0 ? (
                  suggestedSkills.map(skill => {
                    const isSelected = currentFeedback?.skillIds.includes(skill.id);
                    const pillarColor = PILLAR_COLORS[skill.pillarId] || Colors.dark.primary;
                    return (
                      <Pressable
                        key={skill.id}
                        style={[styles.skillChip, isSelected && { backgroundColor: pillarColor + "30", borderColor: pillarColor }]}
                        onPress={() => toggleSkill(skill.id)}
                      >
                        <Ionicons
                          name={PILLAR_ICONS[skill.pillarId] || "ellipse"}
                          size={14}
                          color={isSelected ? pillarColor : Colors.dark.disabled}
                        />
                        <Text style={[styles.skillChipText, isSelected && { color: pillarColor }]} numberOfLines={1}>
                          {skill.name}
                        </Text>
                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={14} color={pillarColor} />
                        ) : null}
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.noSkillsText}>No skills available for this level</Text>
                )}
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
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Text style={styles.nextButtonText}>
                  {currentPlayerIndex === players.length - 1 ? "Submit All" : "Next"}
                </Text>
                <Ionicons
                  name={currentPlayerIndex === players.length - 1 ? "checkmark" : "chevron-forward"}
                  size={20}
                  color="#FFF"
                />
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.lg,
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
    color: "#FFF",
    textTransform: "uppercase",
  },
  playerName: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  trialBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.orange + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  trialText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
    color: Colors.dark.orange,
  },
  section: {
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
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
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
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
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
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
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "transparent",
  },
  skillChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    maxWidth: 120,
  },
  noSkillsText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    fontStyle: "italic",
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
    backgroundColor: Colors.dark.primary,
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
    color: "#FFF",
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
});
