import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import type { TabProps, SessionTemplate } from "./types";
import { styles } from "./coachingStyles";
import { useCoachingScroll } from "./CoachingScrollContext";

export function PlansTab({ insets: _insets, tabBarHeight }: TabProps) {
  const onScroll = useCoachingScroll();
  const { coach, calendarData } = useCoach();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SessionTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateType, setTemplateType] = useState<string>("private");
  const [templateDuration, setTemplateDuration] = useState<number>(60);
  const [templateBallLevel, setTemplateBallLevel] = useState<string>("");
  const [templateNotes, setTemplateNotes] = useState("");

  const coachId = coach?.id || calendarData?.ownSessions?.[0]?.coachId;

  const { data: templates = [], isLoading } = useQuery<SessionTemplate[]>({
    queryKey: ["/api/coach/templates", { coachId }],
    enabled: !!coachId,
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: Partial<SessionTemplate>) => {
      return apiRequest("POST", "/api/coach/templates", data);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/templates"], exact: false });
      resetForm();
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to create template");
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/coach/templates/${id}`);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/templates"], exact: false });
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to delete template");
    },
  });

  const resetForm = () => {
    setShowCreateModal(false);
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateType("private");
    setTemplateDuration(60);
    setTemplateBallLevel("");
    setTemplateNotes("");
  };

  const handleSaveTemplate = () => {
    if (!coachId) {
      Alert.alert("Error", "Coach session not loaded. Please try again.");
      return;
    }
    if (!templateName.trim()) {
      Alert.alert("Error", "Template name is required");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createTemplateMutation.mutate({
      coachId,
      name: templateName,
      sessionType: templateType,
      duration: templateDuration,
      ballLevel: templateBallLevel || null,
      notes: templateNotes || null,
    });
  };

  const handleDeleteTemplate = (template: SessionTemplate) => {
    Alert.alert(
      "Delete Template",
      `Are you sure you want to delete "${template.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteTemplateMutation.mutate(template.id),
        },
      ]
    );
  };

  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case "private": return "Private";
      case "semi_private": return "Semi-Private";
      case "group": return "Group";
      case "physical": return "Physical";
      case "activity": return "Activity";
      default: return type;
    }
  };

  const getSessionTypeColor = (type: string) => {
    switch (type) {
      case "private": return Colors.dark.primary;
      case "semi_private": return Colors.dark.xpCyan;
      case "group": return Colors.dark.gold;
      case "physical": return Colors.dark.orange;
      default: return Colors.dark.tabIconDefault;
    }
  };

  const getLevelColor = (level: string | null) => {
    switch (level?.toLowerCase()) {
      case "red": return "#FF4444";
      case "orange": return "#FF851B";
      case "green": return "#2ECC40";
      case "yellow": return "#FFDC00";
      case "glow": return "#00D4FF";
      default: return Colors.dark.disabled;
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading templates...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: tabBarHeight + Spacing.xl }}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={styles.plansHeader}>
        <Text style={styles.sectionTitle}>Session Templates</Text>
        <Pressable
          style={styles.addTemplateButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCreateModal(true);
          }}
        >
          <Ionicons name="add" size={20} color={Colors.dark.primary} />
        </Pressable>
      </View>

      {templates.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={48} color={Colors.dark.gold} />
          <Text style={styles.emptyText}>No Templates Yet</Text>
          <Text style={styles.emptySubtext}>
            Create templates for quick session booking
          </Text>
          <Pressable
            style={styles.createTemplateButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowCreateModal(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.dark.primary} />
            <Text style={styles.createTemplateText}>Create Template</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.templatesGrid}>
          {templates.map((template) => (
            <Pressable
              key={template.id}
              style={styles.templateCard}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleDeleteTemplate(template);
              }}
            >
              <View style={styles.templateHeader}>
                <View style={[styles.templateTypeIndicator, { backgroundColor: getSessionTypeColor(template.sessionType) }]} />
                <Text style={styles.templateName}>{template.name}</Text>
              </View>
              <View style={styles.templateMeta}>
                <View style={styles.templateMetaItem}>
                  <Ionicons name="time-outline" size={14} color={Colors.dark.tabIconDefault} />
                  <Text style={styles.templateMetaText}>{template.duration}min</Text>
                </View>
                <View style={[styles.templateTypeBadge, { backgroundColor: getSessionTypeColor(template.sessionType) + "20" }]}>
                  <Text style={[styles.templateTypeText, { color: getSessionTypeColor(template.sessionType) }]}>
                    {getSessionTypeLabel(template.sessionType)}
                  </Text>
                </View>
              </View>
              {template.ballLevel ? (
                <View style={styles.templateBallLevel}>
                  <View style={[styles.levelDotSmall, { backgroundColor: getLevelColor(template.ballLevel) }]} />
                  <Text style={styles.templateBallText}>{template.ballLevel} Ball</Text>
                </View>
              ) : null}
              {template.notes ? (
                <Text style={styles.templateNotes} numberOfLines={2}>{template.notes}</Text>
              ) : null}
              <View style={styles.templateActions}>
                <Pressable
                  style={styles.templateActionButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Alert.alert("Quick Book", "This template can be used when creating a new session from the calendar.");
                  }}
                >
                  <Ionicons name="calendar-outline" size={16} color={Colors.dark.primary} />
                  <Text style={styles.templateActionText}>Use</Text>
                </Pressable>
                <Pressable
                  style={styles.templateActionButton}
                  onPress={() => handleDeleteTemplate(template)}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
                </Pressable>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {showCreateModal ? (
        <View style={styles.modalOverlay}>
          <KeyboardAwareScrollViewCompat
            style={styles.modalScrollContainer}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Template</Text>
                <Pressable onPress={resetForm}>
                  <Ionicons name="close" size={24} color={Colors.dark.text} />
                </Pressable>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Template Name</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Morning Private"
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  value={templateName}
                  onChangeText={setTemplateName}
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Session Type</Text>
                <View style={styles.typeButtons}>
                  {[
                    { value: "private", label: "Private" },
                    { value: "semi_private", label: "Semi" },
                    { value: "group", label: "Group" },
                  ].map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.typeButton,
                        templateType === opt.value && styles.typeButtonActive,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTemplateType(opt.value);
                      }}
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          templateType === opt.value && styles.typeButtonTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Duration</Text>
                <View style={styles.durationButtons}>
                  {[30, 45, 60, 90].map((dur) => (
                    <Pressable
                      key={dur}
                      style={[
                        styles.durationButton,
                        templateDuration === dur && styles.durationButtonActive,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTemplateDuration(dur);
                      }}
                    >
                      <Text
                        style={[
                          styles.durationButtonText,
                          templateDuration === dur && styles.durationButtonTextActive,
                        ]}
                      >
                        {dur}m
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Ball Level (Optional)</Text>
                <View style={styles.ballLevelButtons}>
                  {["", "red", "orange", "green", "yellow"].map((level) => (
                    <Pressable
                      key={level || "any"}
                      style={[
                        styles.ballLevelButton,
                        templateBallLevel === level && styles.ballLevelButtonActive,
                        level ? { borderColor: getLevelColor(level) } : undefined,
                      ].filter(Boolean)}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTemplateBallLevel(level);
                      }}
                    >
                      {level ? (
                        <View style={[styles.levelDotSmall, { backgroundColor: getLevelColor(level) }]} />
                      ) : (
                        <Text style={styles.ballLevelText}>Any</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Notes (Optional)</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextArea]}
                  placeholder="Session focus, warm-up routine, etc."
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  value={templateNotes}
                  onChangeText={setTemplateNotes}
                  multiline
                  maxLength={200}
                />
              </View>

              <Pressable
                style={[styles.saveTemplateButton, (createTemplateMutation.isPending || !coachId) && { opacity: 0.6 }]}
                onPress={handleSaveTemplate}
                disabled={createTemplateMutation.isPending || !coachId}
              >
                {createTemplateMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color={Colors.dark.buttonText} />
                    <Text style={styles.saveTemplateText}>Save Template</Text>
                  </>
                )}
              </Pressable>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      ) : null}
    </ScrollView>
  );
}

interface BallLevel {
  id: string;
  stage: string;
  rank: number;
  displayNamePlayer: string;
  displayNameCoach: string;
  identity: string;
  courtType: string;
  ballType: string;
  promotionRequirements: {
    skillAchievedCount: number;
    pillarMinimum: Record<string, number>;
    tests: string[];
    evidenceMin: number;
    matchEvents: number;
    matchWins?: number;
  };
  skillsByPillar?: Record<string, LevelSkill[]>;
}

interface LevelSkill {
  id: string;
  name: string;
  pillar: string;
  description?: string;
  targetScore: number;
  weight: string;
  isRequired: boolean;
  rubric?: { score: number; observable: string }[];
}

const STAGES = ["RED", "ORANGE", "GREEN", "YELLOW"] as const;
const PILLARS = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"] as const;

const STAGE_COLORS: Record<string, string> = {
  RED: Colors.dark.ballRed,
  ORANGE: Colors.dark.ballOrange,
  GREEN: Colors.dark.ballGreen,
  YELLOW: Colors.dark.ballYellow,
};

const PILLAR_COLORS: Record<string, string> = {
  TECHNIQUE: Colors.dark.xpCyan,
  TACTICAL: Colors.dark.primary,
  PHYSICAL: Colors.dark.orange,
  MENTAL: Colors.dark.gold,
  SOCIAL: Colors.dark.ballGlow,
  MATCH: Colors.dark.ballRed,
};

const PILLAR_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  TECHNIQUE: "hand-left-outline",
  TACTICAL: "bulb-outline",
  PHYSICAL: "fitness-outline",
  MENTAL: "sparkles-outline",
  SOCIAL: "people-outline",
  MATCH: "trophy-outline",
};

