import React, { useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { styles } from "./playersStyles";

const NOTE_CATEGORIES = [
  { value: "technique", label: "Technique", icon: "fitness-outline" as const },
  { value: "mental", label: "Mental", icon: "bulb-outline" as const },
  { value: "physical", label: "Physical", icon: "body-outline" as const },
  { value: "next-lesson", label: "Next Lesson", icon: "arrow-forward-outline" as const },
  { value: "general", label: "General", icon: "document-text-outline" as const },
];

interface PlayerNote {
  id: string;
  playerId: string | null;
  coachId: string | null;
  content: string;
  category: string;
  isPinned: boolean;
  sessionId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface Props {
  playerId: string;
  coachId: string | undefined;
  hideHeader?: boolean;
}

export function PlayerNotesSection({ playerId, coachId, hideHeader = false }: Props) {
  const queryClient = useQueryClient();
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState("general");

  const { data: notes = [], isLoading: notesLoading } = useQuery<PlayerNote[]>({
    queryKey: [`/api/players/${playerId}/notes`],
  });

  const addNoteMutation = useMutation({
    mutationFn: async (data: { content: string; category: string }) => {
      return apiRequest("POST", `/api/players/${playerId}/notes`, {
        ...data,
        coachId,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/notes`] });
      setNewNoteContent("");
      setNewNoteCategory("general");
      setShowAddNote(false);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to save note");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/players/${playerId}/notes/${noteId}`);
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/notes`] });
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ noteId, isPinned }: { noteId: string; isPinned: boolean }) => {
      return apiRequest("PATCH", `/api/players/${playerId}/notes/${noteId}/pin`, { isPinned });
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/notes`] });
    },
  });

  const handleAddNote = () => {
    if (!newNoteContent.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addNoteMutation.mutate({ content: newNoteContent.trim(), category: newNoteCategory });
  };

  const handleDeleteNote = (noteId: string) => {
    Alert.alert("Delete Note", "Are you sure you want to delete this note?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteNoteMutation.mutate(noteId) },
    ]);
  };

  const getCategoryInfo = (category: string | null) => {
    return NOTE_CATEGORIES.find(c => c.value === category) || NOTE_CATEGORIES[4];
  };

  const formatNoteDate = (date: string | null) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const pinnedNotes = notes.filter(n => n.isPinned);
  const regularNotes = notes.filter(n => !n.isPinned);
  const nextLessonNotes = notes.filter(n => n.category === "next-lesson");

  return (
    <>
      {nextLessonNotes.length > 0 ? (
        <View style={styles.nextLessonSection}>
          <View style={styles.nextLessonHeader}>
            <Ionicons name="arrow-forward-circle" size={20} color={Colors.dark.primary} />
            <Text style={styles.nextLessonTitle}>Next Lesson Suggestion</Text>
          </View>
          <Text style={styles.nextLessonText}>{nextLessonNotes[0].content}</Text>
        </View>
      ) : null}

      <View style={[styles.infoSection, hideHeader && { marginHorizontal: 0, marginBottom: 0 }]}>
        {!hideHeader ? (
          <View style={styles.notesSectionHeader}>
            <Text style={styles.sectionLabel}>Coach Notes</Text>
            <Text style={styles.notesCount}>{notes.length} notes</Text>
          </View>
        ) : null}

        {showAddNote ? (
          <View style={styles.addNoteForm}>
            <View style={styles.categoryPicker}>
              {NOTE_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat.value}
                  style={[
                    styles.categoryChip,
                    newNoteCategory === cat.value && styles.categoryChipActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setNewNoteCategory(cat.value);
                  }}
                >
                  <Ionicons
                    name={cat.icon}
                    size={14}
                    color={newNoteCategory === cat.value ? Colors.dark.primary : Colors.dark.tabIconDefault}
                  />
                  <Text
                    style={[
                      styles.categoryChipText,
                      newNoteCategory === cat.value && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.noteInput}
              placeholder="Write a note..."
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={newNoteContent}
              onChangeText={setNewNoteContent}
              multiline
              maxLength={500}
            />
            <View style={styles.noteActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => {
                  setShowAddNote(false);
                  setNewNoteContent("");
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveNoteButton, addNoteMutation.isPending && styles.saveNoteButtonDisabled]}
                onPress={handleAddNote}
                disabled={addNoteMutation.isPending || !newNoteContent.trim()}
              >
                {addNoteMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <Text style={styles.saveNoteButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={styles.addNoteButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAddNote(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.dark.primary} />
            <Text style={styles.addNoteText}>Add note</Text>
          </Pressable>
        )}

        {notesLoading ? (
          <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginTop: Spacing.md }} />
        ) : notes.length === 0 ? (
          <View style={styles.emptyNotesCard}>
            <Ionicons name="document-text-outline" size={32} color={Colors.dark.disabled} />
            <Text style={styles.noNotesText}>No notes yet</Text>
          </View>
        ) : (
          <View style={styles.notesList}>
            {pinnedNotes.map((note) => {
              const catInfo = getCategoryInfo(note.category);
              return (
                <View key={note.id} style={[styles.noteCard, styles.pinnedNoteCard]}>
                  <View style={styles.noteHeader}>
                    <View style={styles.noteCategoryBadge}>
                      <Ionicons name={catInfo.icon} size={12} color={Colors.dark.primary} />
                      <Text style={styles.noteCategoryText}>{catInfo.label}</Text>
                    </View>
                    <Ionicons name="pin" size={14} color={Colors.dark.gold} />
                  </View>
                  <Text style={styles.noteContent}>{note.content}</Text>
                  <View style={styles.noteFooter}>
                    <Text style={styles.noteDate}>{formatNoteDate(note.createdAt)}</Text>
                    <View style={styles.noteFooterActions}>
                      <Pressable onPress={() => togglePinMutation.mutate({ noteId: note.id, isPinned: false })}>
                        <Ionicons name="pin-outline" size={18} color={Colors.dark.tabIconDefault} />
                      </Pressable>
                      <Pressable onPress={() => handleDeleteNote(note.id)}>
                        <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
            {regularNotes.map((note) => {
              const catInfo = getCategoryInfo(note.category);
              return (
                <View key={note.id} style={styles.noteCard}>
                  <View style={styles.noteHeader}>
                    <View style={styles.noteCategoryBadge}>
                      <Ionicons name={catInfo.icon} size={12} color={Colors.dark.tabIconDefault} />
                      <Text style={styles.noteCategoryText}>{catInfo.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.noteContent}>{note.content}</Text>
                  <View style={styles.noteFooter}>
                    <Text style={styles.noteDate}>{formatNoteDate(note.createdAt)}</Text>
                    <View style={styles.noteFooterActions}>
                      <Pressable onPress={() => togglePinMutation.mutate({ noteId: note.id, isPinned: true })}>
                        <Ionicons name="pin-outline" size={18} color={Colors.dark.tabIconDefault} />
                      </Pressable>
                      <Pressable onPress={() => handleDeleteNote(note.id)}>
                        <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </>
  );
}
