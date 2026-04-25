import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import BallLevelBadge from "@/components/BallLevelBadge";
import { apiRequest, apiFetch } from "@/lib/query-client";

interface DrillBlock {
  id: string;
  name: string;
  durationMinutes: number;
  coachInstructions: string;
  playerInstructions: string;
  skillTags: string[];
  equipment: string[];
  successCriteria: string;
  sequence: number;
}

interface SessionPlan {
  id: string;
  templateId: string;
  templateName: string;
  blocks: DrillBlock[];
  focusSkills: string[];
  warmupNotes: string;
  cooldownNotes: string;
  totalDuration: number;
}

interface Player {
  id: string;
  name: string;
  levelId: string;
}

const PILLAR_COLORS: Record<string, string> = {
  TECHNIQUE: Colors.dark.xpCyan,
  TACTICAL: Colors.dark.primary,
  PHYSICAL: Colors.dark.orange,
  MENTAL: Colors.dark.gold,
  SOCIAL: Colors.dark.ballGlow,
  MATCH: Colors.dark.ballRed,
};

export default function SessionPlanScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();

  const { sessionId, playerId } = route.params || {};
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: player } = useQuery<Player>({
    queryKey: ["/api/players", playerId],
    enabled: !!playerId,
  });

  const { data: templates = [] } = useQuery<{ id: string; name: string; ballLevel: string; focusArea: string }[]>({
    queryKey: ["/api/lesson-templates", player?.levelId?.split("_")[0]],
    enabled: !!player,
  });

  const { data: sessionPlan, isLoading: planLoading } = useQuery<SessionPlan>({
    queryKey: ["/api/sessions", sessionId, "plan"],
    queryFn: async () => {
      const res = await apiFetch(`/api/sessions/${sessionId}/plan`);
      if (!res.ok) throw new Error("Failed to fetch plan");
      return res.json();
    },
    enabled: !!sessionId,
  });

  const generatePlanMutation = useMutation({
    mutationFn: async (templateId?: string) => {
      setIsGenerating(true);
      return apiRequest("POST", `/api/sessions/${sessionId}/plan/generate`, {
        templateId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "plan"] });
      setIsGenerating(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      setIsGenerating(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleGeneratePlan = () => {
    generatePlanMutation.mutate(selectedTemplate || undefined);
  };

  const handleStartSession = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("ActiveSession", { sessionId, planId: sessionPlan?.id });
  };

  const getPillarColor = (tag: string) => {
    const pillar = tag.split("_")[0];
    return PILLAR_COLORS[pillar] || Colors.dark.text;
  };

  if (planLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <ThemedText style={styles.loadingText}>Loading session plan...</ThemedText>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      {player ? (
        <Card style={styles.playerCard}>
          <View style={styles.playerRow}>
            <BallLevelBadge levelId={player.levelId} size="medium" />
            <View style={styles.playerInfo}>
              <ThemedText style={styles.playerName}>{player.name}</ThemedText>
              <ThemedText style={styles.playerLevel}>Session Plan</ThemedText>
            </View>
          </View>
        </Card>
      ) : null}

      {!sessionPlan ? (
        <>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Choose a Template</ThemedText>
            <ThemedText style={styles.sectionSubtitle}>
              Select a lesson template or let us auto-generate based on player level
            </ThemedText>
          </View>

          <Pressable
            style={[
              styles.templateOption,
              !selectedTemplate && styles.templateOptionSelected,
            ]}
            onPress={() => setSelectedTemplate(null)}
          >
            <Ionicons 
              name="flash" 
              size={24} 
              color={!selectedTemplate ? Colors.dark.primary : Colors.dark.text} 
            />
            <View style={styles.templateInfo}>
              <ThemedText style={styles.templateName}>Auto-Generate</ThemedText>
              <ThemedText style={styles.templateDesc}>
                Based on player&apos;s current level and progress
              </ThemedText>
            </View>
            {!selectedTemplate ? (
              <Ionicons name="checkmark-circle" size={24} color={Colors.dark.primary} />
            ) : null}
          </Pressable>

          {templates.map((template) => (
            <Pressable
              key={template.id}
              style={[
                styles.templateOption,
                selectedTemplate === template.id && styles.templateOptionSelected,
              ]}
              onPress={() => setSelectedTemplate(template.id)}
            >
              <View style={[styles.templateIcon, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                <Ionicons name="document-text" size={20} color={Colors.dark.xpCyan} />
              </View>
              <View style={styles.templateInfo}>
                <ThemedText style={styles.templateName}>{template.name}</ThemedText>
                <ThemedText style={styles.templateDesc}>{template.focusArea}</ThemedText>
              </View>
              {selectedTemplate === template.id ? (
                <Ionicons name="checkmark-circle" size={24} color={Colors.dark.primary} />
              ) : null}
            </Pressable>
          ))}

          <Pressable
            style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]}
            onPress={handleGeneratePlan}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color={Colors.dark.text} />
            ) : (
              <Ionicons name="flash" size={20} color={Colors.dark.text} />
            )}
            <ThemedText style={styles.generateButtonText}>
              {isGenerating ? "Generating..." : "Generate Session Plan"}
            </ThemedText>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.planHeader}>
            <ThemedText style={styles.planTitle}>{sessionPlan.templateName}</ThemedText>
            <View style={styles.planMeta}>
              <Ionicons name="time-outline" size={16} color={Colors.dark.text} />
              <ThemedText style={styles.planDuration}>{sessionPlan.totalDuration} minutes</ThemedText>
            </View>
          </View>

          <View style={styles.focusSkills}>
            <ThemedText style={styles.focusLabel}>Focus Skills</ThemedText>
            <View style={styles.skillTags}>
              {(sessionPlan.focusSkills || []).map((skill, index) => (
                <View key={index} style={[styles.skillTag, { backgroundColor: getPillarColor(skill) + "20" }]}>
                  <ThemedText style={[styles.skillTagText, { color: getPillarColor(skill) }]}>
                    {skill.replace(/_/g, " ")}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>

          <ThemedText style={styles.blocksTitle}>Drill Blocks ({(sessionPlan.blocks || []).length})</ThemedText>

          {(sessionPlan.blocks || []).map((block, index) => (
            <Card key={block.id} style={styles.drillCard}>
              <View style={styles.drillHeader}>
                <View style={styles.drillNumber}>
                  <ThemedText style={styles.drillNumberText}>{index + 1}</ThemedText>
                </View>
                <View style={styles.drillInfo}>
                  <ThemedText style={styles.drillName}>{block.name}</ThemedText>
                  <View style={styles.drillMeta}>
                    <Ionicons name="time-outline" size={12} color={Colors.dark.text} style={{ opacity: 0.6 }} />
                    <ThemedText style={styles.drillDuration}>{block.durationMinutes} min</ThemedText>
                  </View>
                </View>
              </View>

              <View style={styles.instructionsSection}>
                <View style={styles.instructionBlock}>
                  <ThemedText style={styles.instructionLabel}>Coach Focus</ThemedText>
                  <ThemedText style={styles.instructionText}>{block.coachInstructions}</ThemedText>
                </View>
                <View style={styles.instructionBlock}>
                  <ThemedText style={styles.instructionLabel}>Player Cue</ThemedText>
                  <ThemedText style={styles.instructionText}>{block.playerInstructions}</ThemedText>
                </View>
              </View>

              <View style={styles.drillTags}>
                {(block.skillTags || []).map((tag, tagIndex) => (
                  <View 
                    key={tagIndex} 
                    style={[styles.miniTag, { backgroundColor: Colors.dark.backgroundSecondary }]}
                  >
                    <ThemedText style={styles.miniTagText}>{tag}</ThemedText>
                  </View>
                ))}
              </View>

              {(block.equipment || []).length > 0 ? (
                <View style={styles.equipmentRow}>
                  <Ionicons name="basket-outline" size={14} color={Colors.dark.text} style={{ opacity: 0.6 }} />
                  <ThemedText style={styles.equipmentText}>{(block.equipment || []).join(", ")}</ThemedText>
                </View>
              ) : null}

              <View style={styles.successCriteria}>
                <Ionicons name="checkmark-circle-outline" size={14} color={Colors.dark.successNeon} />
                <ThemedText style={styles.successText}>{block.successCriteria}</ThemedText>
              </View>
            </Card>
          ))}

          <Pressable style={styles.startButton} onPress={handleStartSession}>
            <Ionicons name="play" size={24} color={Colors.dark.text} />
            <ThemedText style={styles.startButtonText}>Start Session</ThemedText>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  playerCard: {
    marginBottom: Spacing.lg,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerLevel: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  sectionHeader: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  templateOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  templateOptionSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "10",
  },
  templateIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  templateInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  templateName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  templateDesc: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.primary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  planHeader: {
    marginBottom: Spacing.lg,
  },
  planTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  planMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  planDuration: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  focusSkills: {
    marginBottom: Spacing.xl,
  },
  focusLabel: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  skillTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  skillTag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.lg,
  },
  skillTagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  blocksTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  drillCard: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  drillHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  drillNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  drillNumberText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  drillInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  drillName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  drillMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  drillDuration: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  instructionsSection: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  instructionBlock: {
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  instructionLabel: {
    fontSize: 10,
    color: Colors.dark.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  instructionText: {
    fontSize: 13,
    color: Colors.dark.text,
    lineHeight: 18,
  },
  drillTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  miniTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  miniTagText: {
    fontSize: 10,
    color: Colors.dark.text,
    opacity: 0.8,
  },
  equipmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  equipmentText: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  successCriteria: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.successNeon + "10",
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  successText: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.successNeon,
    lineHeight: 16,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.primary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
});
