import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, getPlayerLevelColor, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const STROKES = [
  { id: "forehand", label: "Forehand" },
  { id: "backhand", label: "Backhand" },
  { id: "serve", label: "Serve" },
  { id: "volley", label: "Volley" },
  { id: "slice", label: "Slice" },
  { id: "smash", label: "Smash" },
  { id: "return", label: "Return" },
  { id: "footwork", label: "Footwork" },
];

const STROKE_RATINGS = [
  { value: 2, label: "Goed", color: GlowColors.primary, icon: "checkmark-circle" as const },
  { value: 1, label: "In ontwikkeling", color: Colors.dark.orange, icon: "ellipse-outline" as const },
  { value: 0, label: "Aandachtspunt", color: Colors.dark.error, icon: "alert-circle" as const },
];

const INTENSITY_OPTIONS = [
  { value: "light", label: "Licht", icon: "sunny-outline" as const, color: Colors.dark.xpCyan },
  { value: "normal", label: "Normaal", icon: "fitness-outline" as const, color: Colors.dark.orange },
  { value: "intense", label: "Intensief", icon: "flame-outline" as const, color: Colors.dark.error },
];

interface StrokeFeedback {
  stroke: string;
  rating: number;
  note?: string;
}

interface PlayerStrokeFeedback {
  playerId: string;
  strokes: StrokeFeedback[];
  playerNote: string;
}

interface Player {
  id: string;
  name: string;
  ballLevel?: string | null;
}

interface Session {
  id: string;
  players?: Player[];
}

interface StrokeFeedbackModalProps {
  visible: boolean;
  session: Session | null;
  onClose: () => void;
  onComplete: () => void;
}

export default function StrokeFeedbackModal({
  visible,
  session,
  onClose,
  onComplete,
}: StrokeFeedbackModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [lessonIntensity, setLessonIntensity] = useState<string>("normal");
  const [playerFeedbacks, setPlayerFeedbacks] = useState<Map<string, PlayerStrokeFeedback>>(new Map());
  const [expandedStrokeNote, setExpandedStrokeNote] = useState<string | null>(null);

  const players = session?.players || [];
  const currentPlayer = players[currentPlayerIndex];

  useEffect(() => {
    if (visible && players.length > 0) {
      const initial = new Map<string, PlayerStrokeFeedback>();
      players.forEach((p) => {
        initial.set(p.id, { playerId: p.id, strokes: [], playerNote: "" });
      });
      setPlayerFeedbacks(initial);
      setCurrentPlayerIndex(0);
      setLessonIntensity("normal");
      setExpandedStrokeNote(null);
    }
  }, [visible]);

  const getCurrentFeedback = (): PlayerStrokeFeedback | null => {
    if (!currentPlayer) return null;
    return playerFeedbacks.get(currentPlayer.id) || null;
  };

  const toggleStroke = (strokeId: string) => {
    if (!currentPlayer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerFeedbacks((prev) => {
      const updated = new Map(prev);
      const current = updated.get(currentPlayer.id);
      if (!current) return prev;
      const existingIndex = current.strokes.findIndex((s) => s.stroke === strokeId);
      let newStrokes: StrokeFeedback[];
      if (existingIndex >= 0) {
        newStrokes = current.strokes.filter((s) => s.stroke !== strokeId);
        if (expandedStrokeNote === strokeId) setExpandedStrokeNote(null);
      } else {
        newStrokes = [...current.strokes, { stroke: strokeId, rating: 1 }];
      }
      updated.set(currentPlayer.id, { ...current, strokes: newStrokes });
      return updated;
    });
  };

  const setStrokeRating = (strokeId: string, rating: number) => {
    if (!currentPlayer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerFeedbacks((prev) => {
      const updated = new Map(prev);
      const current = updated.get(currentPlayer.id);
      if (!current) return prev;
      const newStrokes = current.strokes.map((s) =>
        s.stroke === strokeId ? { ...s, rating } : s
      );
      updated.set(currentPlayer.id, { ...current, strokes: newStrokes });
      return updated;
    });
  };

  const setStrokeNote = (strokeId: string, note: string) => {
    if (!currentPlayer) return;
    setPlayerFeedbacks((prev) => {
      const updated = new Map(prev);
      const current = updated.get(currentPlayer.id);
      if (!current) return prev;
      const newStrokes = current.strokes.map((s) =>
        s.stroke === strokeId ? { ...s, note } : s
      );
      updated.set(currentPlayer.id, { ...current, strokes: newStrokes });
      return updated;
    });
  };

  const setPlayerNote = (note: string) => {
    if (!currentPlayer) return;
    setPlayerFeedbacks((prev) => {
      const updated = new Map(prev);
      const current = updated.get(currentPlayer.id);
      if (!current) return prev;
      updated.set(currentPlayer.id, { ...current, playerNote: note });
      return updated;
    });
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("No session");
      const results = [];
      for (const [, feedback] of playerFeedbacks) {
        if (feedback.strokes.length === 0 && !feedback.playerNote) continue;
        try {
          const res = await apiRequest("POST", `/api/glow/sessions/${session.id}/feedback`, {
            playerId: feedback.playerId,
            effort: 1,
            execution: 1,
            understanding: 1,
            overall: "stable",
            strokeFeedback: feedback.strokes,
            lessonIntensity,
            playerNote: feedback.playerNote || undefined,
          });
          results.push(await res.json());
        } catch (err: any) {
          if (err?.message?.includes("409") || err?.message?.includes("already submitted")) {
            continue;
          }
          throw err;
        }
      }
      return results;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/glow"), refetchType: "all" });
      onComplete();
    },
    onError: (error: Error) => {
      if (error.message?.includes("already submitted")) {
        onComplete();
        return;
      }
      Alert.alert("Fout", error.message || "Kon feedback niet opslaan");
    },
  });

  const handleNext = () => {
    if (currentPlayerIndex < players.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCurrentPlayerIndex((prev) => prev + 1);
      setExpandedStrokeNote(null);
    } else {
      submitMutation.mutate();
    }
  };

  const handlePrev = () => {
    if (currentPlayerIndex > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentPlayerIndex((prev) => prev - 1);
      setExpandedStrokeNote(null);
    }
  };

  if (!visible || !session) return null;

  const currentFeedback = getCurrentFeedback();
  const selectedStrokes = currentFeedback?.strokes || [];
  const isLastPlayer = currentPlayerIndex === players.length - 1;

  if (players.length === 0) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <LinearGradient colors={[Colors.dark.backgroundDefault, Colors.dark.backgroundRoot]} style={StyleSheet.absoluteFill} />
          <View style={styles.header}>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.title}>Les Afsluiten</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={Colors.dark.disabled} />
            <Text style={styles.emptyText}>Geen spelers in deze les</Text>
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
            <Text style={styles.title}>Les Afsluiten</Text>
            <Text style={styles.subtitle}>{currentPlayerIndex + 1} / {players.length}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((currentPlayerIndex + 1) / players.length) * 100}%` }]} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.playerCard}>
            {currentPlayer?.ballLevel ? (
              <View style={[styles.levelBadge, { backgroundColor: getPlayerLevelColor(currentPlayer.ballLevel) }]}>
                <Text style={styles.levelText}>{currentPlayer.ballLevel}</Text>
              </View>
            ) : null}
            <Text style={styles.playerName}>{currentPlayer?.name}</Text>
          </View>

          {currentPlayerIndex === 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Les intensiteit</Text>
              <View style={styles.intensityRow}>
                {INTENSITY_OPTIONS.map((opt) => {
                  const isSelected = lessonIntensity === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.intensityButton,
                        isSelected && { backgroundColor: opt.color + "25", borderColor: opt.color },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setLessonIntensity(opt.value);
                      }}
                    >
                      <Ionicons name={opt.icon} size={20} color={isSelected ? opt.color : Colors.dark.disabled} />
                      <Text style={[styles.intensityLabel, isSelected && { color: opt.color }]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Slagen geoefend</Text>
            <Text style={styles.sectionDesc}>Selecteer welke slagen zijn geoefend</Text>
            <View style={styles.strokesGrid}>
              {STROKES.map((stroke) => {
                const isSelected = selectedStrokes.some((s) => s.stroke === stroke.id);
                return (
                  <Pressable
                    key={stroke.id}
                    style={[styles.strokeChip, isSelected && styles.strokeChipSelected]}
                    onPress={() => toggleStroke(stroke.id)}
                  >
                    <Text style={[styles.strokeChipText, isSelected && styles.strokeChipTextSelected]}>
                      {stroke.label}
                    </Text>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={14} color={GlowColors.primary} style={{ marginLeft: 4 }} />
                    ) : (
                      <Ionicons name="add-circle-outline" size={14} color={Colors.dark.disabled} style={{ marginLeft: 4 }} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {selectedStrokes.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Beoordeling per slag</Text>
              {selectedStrokes.map((strokeData) => {
                const strokeInfo = STROKES.find((s) => s.id === strokeData.stroke);
                const ratingInfo = STROKE_RATINGS.find((r) => r.value === strokeData.rating);
                const isNoteExpanded = expandedStrokeNote === strokeData.stroke;

                return (
                  <View key={strokeData.stroke} style={styles.strokeRatingCard}>
                    <View style={styles.strokeRatingHeader}>
                      <Text style={styles.strokeRatingName}>{strokeInfo?.label || strokeData.stroke}</Text>
                      <View style={styles.strokeRatingButtons}>
                        {STROKE_RATINGS.map((opt) => {
                          const isSelected = strokeData.rating === opt.value;
                          return (
                            <Pressable
                              key={opt.value}
                              style={[
                                styles.ratingPill,
                                isSelected && { backgroundColor: opt.color + "30", borderColor: opt.color },
                              ]}
                              onPress={() => setStrokeRating(strokeData.stroke, opt.value)}
                            >
                              <Ionicons name={opt.icon} size={16} color={isSelected ? opt.color : Colors.dark.disabled} />
                              <Text style={[styles.ratingPillText, isSelected && { color: opt.color }]}>
                                {opt.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <Pressable
                      style={styles.addNoteButton}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setExpandedStrokeNote(isNoteExpanded ? null : strokeData.stroke);
                      }}
                    >
                      <Ionicons
                        name={isNoteExpanded ? "chatbubble" : "chatbubble-outline"}
                        size={14}
                        color={strokeData.note ? Colors.dark.xpCyan : Colors.dark.disabled}
                      />
                      <Text style={[styles.addNoteText, strokeData.note ? { color: Colors.dark.xpCyan } : null]}>
                        {strokeData.note ? "Opmerking" : "Opmerking toevoegen"}
                      </Text>
                    </Pressable>

                    {isNoteExpanded ? (
                      <TextInput
                        style={styles.noteInput}
                        value={strokeData.note || ""}
                        onChangeText={(t) => setStrokeNote(strokeData.stroke, t)}
                        placeholder="Korte opmerking over deze slag..."
                        placeholderTextColor={Colors.dark.textMuted}
                        multiline
                        numberOfLines={2}
                        autoFocus
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Opmerking speler</Text>
            <TextInput
              style={styles.playerNoteInput}
              value={currentFeedback?.playerNote || ""}
              onChangeText={setPlayerNote}
              placeholder="Optionele algemene opmerking voor deze speler..."
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          {currentPlayerIndex > 0 ? (
            <Pressable style={styles.prevButton} onPress={handlePrev}>
              <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
              <Text style={styles.prevButtonText}>Vorige</Text>
            </Pressable>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          <Pressable
            style={[styles.nextButton, submitMutation.isPending && { opacity: 0.6 }]}
            onPress={handleNext}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <>
                <Text style={styles.nextButtonText}>
                  {isLastPlayer ? "Opslaan" : "Volgende"}
                </Text>
                {isLastPlayer ? (
                  <Ionicons name="checkmark" size={18} color={Colors.dark.buttonText} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={Colors.dark.buttonText} />
                )}
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  closeButton: { padding: Spacing.xs },
  headerCenter: { flex: 1, alignItems: "center" },
  title: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  progressBar: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  progressFill: {
    height: 3,
    backgroundColor: GlowColors.primary,
    borderRadius: 2,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  levelBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  levelText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.buttonText,
    textTransform: "uppercase",
  },
  playerName: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  intensityRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  intensityButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  intensityLabel: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.disabled,
  },
  strokesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  strokeChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  strokeChipSelected: {
    backgroundColor: GlowColors.primary + "18",
    borderColor: GlowColors.primary,
  },
  strokeChipText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.disabled,
  },
  strokeChipTextSelected: {
    color: Colors.dark.text,
  },
  strokeRatingCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  strokeRatingHeader: {
    gap: Spacing.sm,
  },
  strokeRatingName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  strokeRatingButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
    flexWrap: "wrap",
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  ratingPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.disabled,
  },
  addNoteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.sm,
    paddingVertical: 4,
  },
  addNoteText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
  },
  noteInput: {
    marginTop: Spacing.sm,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    fontSize: Typography.small.fontSize,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    textAlignVertical: "top",
  },
  playerNoteInput: {
    marginTop: Spacing.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    fontSize: Typography.small.fontSize,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    textAlignVertical: "top",
    minHeight: 80,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  prevButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
  },
  prevButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flex: 2,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: GlowColors.primary,
  },
  nextButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.h4.fontSize,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
});
