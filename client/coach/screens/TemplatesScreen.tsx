import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Modal,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCoach } from "@/coach/context/CoachContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Card } from "@/components/Card";

interface SessionTemplate {
  id: string;
  coachId: string;
  name: string;
  sessionType: string;
  duration: number;
  ballLevel: string | null;
  skillLevel: number | null;
  defaultPlayerIds: string[] | null;
  notes: string | null;
  createdAt: string;
}

type SessionType = "private" | "semi_private" | "group" | "physical" | "activity";
type BallLevel = "red" | "orange" | "green" | "yellow" | "glow";

const SESSION_TYPES: { value: SessionType; label: string; color: string }[] = [
  { value: "private", label: "Private", color: Colors.dark.primary },
  { value: "semi_private", label: "Semi-Private", color: Colors.dark.xpCyan },
  { value: "group", label: "Group", color: Colors.dark.orange },
  { value: "physical", label: "Physical", color: Colors.dark.gold },
  { value: "activity", label: "Activity", color: Colors.dark.error },
];

const BALL_LEVELS: { value: BallLevel; label: string; color: string }[] = [
  { value: "red", label: "Red", color: "#FF4444" },
  { value: "orange", label: "Orange", color: "#FF851B" },
  { value: "green", label: "Green", color: "#2ECC40" },
  { value: "yellow", label: "Yellow", color: "#FFDC00" },
  { value: "glow", label: "Glow", color: "#00D4FF" },
];

const DURATIONS = [30, 45, 60, 90, 120];

export default function TemplatesScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SessionTemplate | null>(null);
  const [name, setName] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("private");
  const [duration, setDuration] = useState(60);
  const [ballLevel, setBallLevel] = useState<BallLevel | null>(null);
  const [skillLevel, setSkillLevel] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const { data: templates = [], isLoading } = useQuery<SessionTemplate[]>({
    queryKey: ["/api/coach/templates", coach?.id],
    queryFn: async () => {
      const url = new URL("/api/coach/templates", getApiUrl());
      url.searchParams.set("coachId", coach?.id || "");
      const res = await fetch(url.href);
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
    enabled: !!coach?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/coach/templates", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/templates", coach?.id] });
      closeModal();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to create template");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/coach/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/templates", coach?.id] });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to delete template");
    },
  });

  const openModal = (template?: SessionTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setName(template.name);
      setSessionType(template.sessionType as SessionType);
      setDuration(template.duration);
      setBallLevel(template.ballLevel as BallLevel | null);
      setSkillLevel(template.skillLevel);
      setNotes(template.notes || "");
    } else {
      setEditingTemplate(null);
      setName("");
      setSessionType("private");
      setDuration(60);
      setBallLevel(null);
      setSkillLevel(null);
      setNotes("");
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTemplate(null);
    setName("");
    setSessionType("private");
    setDuration(60);
    setBallLevel(null);
    setSkillLevel(null);
    setNotes("");
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Error", "Template name is required");
      return;
    }

    createMutation.mutate({
      coachId: coach?.id,
      name: name.trim(),
      sessionType,
      duration,
      ballLevel,
      skillLevel,
      notes: notes.trim() || null,
    });
  };

  const handleDelete = (template: SessionTemplate) => {
    Alert.alert(
      "Delete Template",
      `Are you sure you want to delete "${template.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(template.id),
        },
      ]
    );
  };

  const getSessionTypeColor = (type: string) => {
    return SESSION_TYPES.find((t) => t.value === type)?.color || Colors.dark.tabIconDefault;
  };

  const getSessionTypeLabel = (type: string) => {
    return SESSION_TYPES.find((t) => t.value === type)?.label || type;
  };

  const getBallLevelColor = (level: string | null) => {
    return BALL_LEVELS.find((b) => b.value === level)?.color;
  };

  const renderTemplate = ({ item }: { item: SessionTemplate }) => (
    <Card style={styles.templateCard}>
      <View style={styles.templateHeader}>
        <View style={styles.templateInfo}>
          <Text style={styles.templateName}>{item.name}</Text>
          <View style={styles.templateMeta}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: getSessionTypeColor(item.sessionType) + "20" },
              ]}
            >
              <Text
                style={[styles.typeBadgeText, { color: getSessionTypeColor(item.sessionType) }]}
              >
                {getSessionTypeLabel(item.sessionType)}
              </Text>
            </View>
            <Text style={styles.durationText}>{item.duration} min</Text>
            {item.ballLevel ? (
              <View
                style={[
                  styles.ballIndicator,
                  { backgroundColor: getBallLevelColor(item.ballLevel) },
                ]}
              />
            ) : null}
          </View>
        </View>
        <Pressable
          onPress={() => handleDelete(item)}
          style={styles.deleteButton}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={20} color={Colors.dark.error} />
        </Pressable>
      </View>
      {item.notes ? <Text style={styles.templateNotes}>{item.notes}</Text> : null}
    </Card>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Session Templates</Text>
        <Pressable onPress={() => openModal()} style={styles.addButton}>
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.primary]}
            style={styles.addButtonGradient}
          >
            <Ionicons name="add" size={24} color={Colors.dark.text} />
          </LinearGradient>
        </Pressable>
      </View>

      {templates.length === 0 && !isLoading ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color={Colors.dark.tabIconDefault} />
          <Text style={styles.emptyTitle}>No Templates Yet</Text>
          <Text style={styles.emptySubtitle}>
            Create templates to quickly book sessions with preset configurations
          </Text>
          <Text style={styles.emptyHint}>
            Most coaches create 3-5 templates for their common session types
          </Text>
          <Pressable onPress={() => openModal()} style={styles.emptyAction}>
            <Ionicons name="add-circle" size={20} color={Colors.dark.primary} />
            <Text style={styles.emptyActionText}>Create your first template</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={templates}
          keyExtractor={(item) => item.id}
          renderItem={renderTemplate}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.xl }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingTemplate ? "Edit Template" : "New Template"}
              </Text>
              <Pressable onPress={closeModal} hitSlop={8}>
                <Ionicons name="close" size={24} color={Colors.dark.tabIconDefault} />
              </Pressable>
            </View>

            <KeyboardAwareScrollViewCompat style={styles.modalScroll}>
              <Text style={styles.label}>Template Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Morning Private Session"
                placeholderTextColor={Colors.dark.tabIconDefault}
              />

              <Text style={styles.label}>Session Type</Text>
              <View style={styles.optionRow}>
                {SESSION_TYPES.map((type) => (
                  <Pressable
                    key={type.value}
                    onPress={() => setSessionType(type.value)}
                    style={[
                      styles.optionButton,
                      sessionType === type.value && {
                        backgroundColor: type.color + "30",
                        borderColor: type.color,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        sessionType === type.value && { color: type.color },
                      ]}
                    >
                      {type.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Duration</Text>
              <View style={styles.optionRow}>
                {DURATIONS.map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setDuration(d)}
                    style={[
                      styles.durationButton,
                      duration === d && {
                        backgroundColor: Colors.dark.primary + "30",
                        borderColor: Colors.dark.primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.durationButtonText,
                        duration === d && { color: Colors.dark.primary },
                      ]}
                    >
                      {d}m
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Ball Level (Optional)</Text>
              <View style={styles.optionRow}>
                {BALL_LEVELS.map((ball) => (
                  <Pressable
                    key={ball.value}
                    onPress={() => setBallLevel(ballLevel === ball.value ? null : ball.value)}
                    style={[
                      styles.ballButton,
                      ballLevel === ball.value && {
                        backgroundColor: ball.color + "30",
                        borderColor: ball.color,
                      },
                    ]}
                  >
                    <View style={[styles.ballDot, { backgroundColor: ball.color }]} />
                    <Text
                      style={[
                        styles.ballButtonText,
                        ballLevel === ball.value && { color: ball.color },
                      ]}
                    >
                      {ball.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Skill Level (Optional)</Text>
              <View style={styles.optionRow}>
                {[1, 2, 3].map((level) => (
                  <Pressable
                    key={level}
                    onPress={() => setSkillLevel(skillLevel === level ? null : level)}
                    style={[
                      styles.skillButton,
                      skillLevel === level && {
                        backgroundColor: Colors.dark.xpCyan + "30",
                        borderColor: Colors.dark.xpCyan,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.skillButtonText,
                        skillLevel === level && { color: Colors.dark.xpCyan },
                      ]}
                    >
                      {level === 1 ? "Beginner" : level === 2 ? "Intermediate" : "Advanced"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Notes (Optional)</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any notes..."
                placeholderTextColor={Colors.dark.tabIconDefault}
                multiline
                numberOfLines={3}
              />
            </KeyboardAwareScrollViewCompat>

            <Pressable
              onPress={handleSave}
              disabled={createMutation.isPending}
              style={styles.saveButton}
            >
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.primary]}
                style={styles.saveButtonGradient}
              >
                <Text style={styles.saveButtonText}>
                  {createMutation.isPending ? "Saving..." : "Save Template"}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
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
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  addButton: {
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  addButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  templateCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  templateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  templateMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    borderRadius: BorderRadius.sm,
  },
  typeBadgeText: {
    ...Typography.caption,
  },
  durationText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  ballIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  templateNotes: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.sm,
  },
  deleteButton: {
    padding: Spacing.xs,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
  emptyHint: {
    ...Typography.caption,
    color: Colors.dark.primary,
    textAlign: "center",
    marginTop: Spacing.lg,
    opacity: 0.8,
  },
  emptyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: BorderRadius.md,
  },
  emptyActionText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  modalScroll: {
    padding: Spacing.lg,
  },
  label: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  input: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  notesInput: {
    height: 80,
    textAlignVertical: "top",
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  optionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  optionText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  durationButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
    backgroundColor: Colors.dark.backgroundTertiary,
    minWidth: 50,
    alignItems: "center",
  },
  durationButtonText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  ballButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
    backgroundColor: Colors.dark.backgroundTertiary,
    gap: Spacing.xs,
  },
  ballDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ballButtonText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  skillButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  skillButtonText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  saveButton: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  saveButtonGradient: {
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
});
