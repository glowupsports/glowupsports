import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Colors, Spacing } from "@/constants/theme";
import { getStaticAssetsUrl, apiRequest } from "@/lib/query-client";
import { getPrimarySpecialization } from "@/provider/constants/specializations";

interface BookingItem {
  id: string;
  orderNumber: string;
  status: string;
  scheduledAt: string | null;
  serviceName: string;
  totalAmount: string;
  rating: number | null;
}

interface Note {
  id: string;
  content: string;
  noteType: string;
  createdAt: string;
}

interface ClientDetail {
  player: { id: string; name: string; profilePhotoUrl: string | null; level: number; xp: number };
  totalSessions: number;
  lifetimeSpend: string;
  bookingHistory: BookingItem[];
  notes: Note[];
  preferences: Record<string, unknown>;
}

interface ProviderProfile {
  specializations: string[];
}

const NOTE_TYPES = [
  { key: "general", label: "General", color: Colors.dark.textSecondary },
  { key: "session", label: "Session", color: Colors.dark.primary },
  { key: "injury", label: "Injury", color: "#E74C3C" },
  { key: "reminder", label: "Reminder", color: "#FFD700" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "#FFD700",
  confirmed: Colors.dark.primary,
  completed: Colors.dark.textSecondary,
  cancelled: "#E74C3C",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Done",
  cancelled: "Cancelled",
};

const PROBLEM_AREAS = ["Shoulder", "Back", "Knee", "Ankle", "Wrist"];

const PREF_FIELDS: Record<string, { key: string; label: string; multiline?: boolean; options?: string[]; multiSelect?: boolean }[]> = {
  stringing: [
    { key: "mainString", label: "Main String" },
    { key: "crossString", label: "Cross String" },
    { key: "mainTension", label: "Main Tension" },
    { key: "crossTension", label: "Cross Tension" },
    { key: "stringBrand", label: "String Brand" },
    { key: "notes", label: "Notes", multiline: true },
  ],
  physio: [
    { key: "problemAreas", label: "Problem Areas", options: PROBLEM_AREAS, multiSelect: true },
    { key: "injuryHistory", label: "Injury History", multiline: true },
  ],
  massage: [
    { key: "problemAreas", label: "Problem Areas", options: PROBLEM_AREAS, multiSelect: true },
    { key: "preferredPressure", label: "Preferred Pressure", options: ["Light", "Medium", "Deep"] },
    { key: "injuryHistory", label: "Injury History", multiline: true },
  ],
  fitness: [
    { key: "fitnessGoal", label: "Fitness Goal" },
    { key: "preferredStyle", label: "Preferred Workout Style" },
    { key: "healthConditions", label: "Health Conditions", multiline: true },
  ],
  nutrition: [
    { key: "dietaryRestrictions", label: "Dietary Restrictions", multiline: true },
    { key: "goal", label: "Goal" },
    { key: "allergies", label: "Allergies", multiline: true },
  ],
};

function getSpecKey(specializations: string[]): string {
  const keys = Object.keys(PREF_FIELDS);
  for (const spec of specializations) {
    if (keys.includes(spec)) return spec;
  }
  return "default";
}

function PlayerAvatar({ uri, size }: { uri: string | null; size: number }) {
  if (!uri) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: Colors.dark.backgroundSecondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="person" size={size * 0.5} color={Colors.dark.textSecondary} />
      </View>
    );
  }
  const fullUri = uri.startsWith("/") ? getStaticAssetsUrl() + uri : uri;
  return <Image source={{ uri: fullUri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function NoteTypePill({ type }: { type: string }) {
  const t = NOTE_TYPES.find((n) => n.key === type) ?? NOTE_TYPES[0];
  return (
    <View style={[styles.noteTypePill, { backgroundColor: t.color + "20" }]}>
      <Text style={[styles.noteTypePillText, { color: t.color }]}>{t.label}</Text>
    </View>
  );
}

export default function ProviderClientDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const { playerId } = route.params as { playerId: string };

  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [addNoteVisible, setAddNoteVisible] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("general");
  const [prefValues, setPrefValues] = useState<Record<string, string>>({});
  const [prefEditing, setPrefEditing] = useState(false);

  const { data: profile } = useQuery<ProviderProfile>({ queryKey: ["/api/provider/me"] });
  const { data: client, isLoading } = useQuery<ClientDetail>({
    queryKey: ["/api/provider/clients", playerId],
    enabled: Boolean(playerId),
  });

  const specKey = getSpecKey(profile?.specializations ?? []);
  const prefFields = PREF_FIELDS[specKey] ?? [{ key: "notes", label: "Special Notes / Preferences", multiline: true }];

  React.useEffect(() => {
    if (client?.preferences) {
      const p: Record<string, string> = {};
      for (const f of prefFields) {
        const v = client.preferences[f.key];
        p[f.key] = v !== undefined && v !== null ? String(v) : "";
      }
      setPrefValues(p);
    }
  }, [client?.preferences]);

  const addNote = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/provider/clients/${playerId}/notes`, {
        content: noteContent.trim(),
        noteType,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/clients", playerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/clients"] });
      setNoteContent("");
      setNoteType("general");
      setAddNoteVisible(false);
    },
    onError: () => Alert.alert("Error", "Failed to save note. Please try again."),
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      await apiRequest("DELETE", `/api/provider/clients/${playerId}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/clients", playerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/clients"] });
    },
    onError: () => Alert.alert("Error", "Failed to delete note."),
  });

  const savePreferences = useMutation({
    mutationFn: async () => {
      const preferences: Record<string, unknown> = {};
      for (const f of prefFields) {
        if (prefValues[f.key]?.trim()) preferences[f.key] = prefValues[f.key].trim();
      }
      const res = await apiRequest("PUT", `/api/provider/clients/${playerId}/preferences`, { preferences });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/clients", playerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/clients"] });
      setPrefEditing(false);
    },
    onError: () => Alert.alert("Error", "Failed to save preferences."),
  });

  const confirmDeleteNote = (noteId: string) => {
    Alert.alert("Delete Note", "Delete this note permanently?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteNote.mutate(noteId) },
    ]);
  };

  if (isLoading || !client) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.loadingState}>
          <Ionicons name="person-circle-outline" size={48} color={Colors.dark.textSecondary} />
          <Text style={styles.loadingText}>Loading client...</Text>
        </View>
      </View>
    );
  }

  const { player, totalSessions, lifetimeSpend, bookingHistory, notes } = client;

  const firstVisit =
    bookingHistory.length > 0
      ? formatDate(bookingHistory[bookingHistory.length - 1].scheduledAt)
      : "—";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header nav */}
      <View style={styles.navRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>{player.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Player Header */}
        <Animated.View entering={FadeInDown.duration(300)} style={styles.playerHeader}>
          <PlayerAvatar uri={player.profilePhotoUrl} size={64} />
          <View style={styles.playerHeaderInfo}>
            <Text style={styles.playerName}>{player.name}</Text>
            <View style={styles.levelRow}>
              <View style={styles.levelPill}>
                <Text style={styles.levelPillText}>Lv.{player.level}</Text>
              </View>
              <Text style={styles.xpText}>{player.xp} XP</Text>
            </View>
          </View>
        </Animated.View>

        {/* Stats row */}
        <Animated.View entering={FadeInDown.delay(60).duration(300)} style={styles.statsRow}>
          {[
            { label: "Sessions", value: String(totalSessions) },
            { label: "Spent", value: lifetimeSpend },
            { label: "First Visit", value: firstVisit },
          ].map((s) => (
            <View key={s.label} style={styles.statCell}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Preferences */}
        <Animated.View entering={FadeInDown.delay(100).duration(300)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="options-outline" size={16} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>Preferences</Text>
            <Pressable
              style={styles.editBtn}
              onPress={() => {
                if (prefEditing) {
                  savePreferences.mutate();
                } else {
                  setPrefEditing(true);
                }
              }}
            >
              <Text style={styles.editBtnText}>
                {prefEditing
                  ? savePreferences.isPending
                    ? "Saving..."
                    : "Save"
                  : "Edit"}
              </Text>
            </Pressable>
          </View>

          {prefFields.map((field) => {
            const currentVal = prefValues[field.key] ?? "";
            const selectedSet = new Set(
              currentVal ? currentVal.split(",").map((s) => s.trim()).filter(Boolean) : []
            );
            const toggleMultiSelect = (opt: string) => {
              if (!prefEditing) return;
              const next = new Set(selectedSet);
              if (next.has(opt)) next.delete(opt); else next.add(opt);
              setPrefValues((p) => ({ ...p, [field.key]: Array.from(next).join(",") }));
            };
            return (
              <View key={field.key} style={styles.prefRow}>
                <Text style={styles.prefLabel}>{field.label}</Text>
                {field.options ? (
                  <View style={styles.optionChips}>
                    {field.options.map((opt) => {
                      const active = field.multiSelect ? selectedSet.has(opt) : currentVal === opt;
                      return (
                        <Pressable
                          key={opt}
                          style={[styles.optionChip, active && styles.optionChipActive]}
                          onPress={() => {
                            if (field.multiSelect) {
                              toggleMultiSelect(opt);
                            } else if (prefEditing) {
                              setPrefValues((p) => ({ ...p, [field.key]: opt }));
                            }
                          }}
                        >
                          <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>
                            {opt}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <TextInput
                    style={[styles.prefInput, field.multiline && styles.prefInputMulti, !prefEditing && styles.prefInputReadonly]}
                    value={currentVal}
                    onChangeText={(v) => setPrefValues((p) => ({ ...p, [field.key]: v }))}
                    editable={prefEditing}
                    multiline={field.multiline}
                    placeholder={prefEditing ? `Enter ${field.label.toLowerCase()}` : "—"}
                    placeholderTextColor={Colors.dark.textSecondary}
                  />
                )}
              </View>
            );
          })}
        </Animated.View>

        {/* Notes */}
        <Animated.View entering={FadeInDown.delay(140).duration(300)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text-outline" size={16} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>Private Notes</Text>
            <Pressable style={styles.addNoteBtn} onPress={() => setAddNoteVisible(true)}>
              <Ionicons name="add" size={16} color={Colors.dark.primary} />
              <Text style={styles.addNoteBtnText}>Add Note</Text>
            </Pressable>
          </View>

          {notes.length === 0 ? (
            <Text style={styles.emptyNotesText}>No notes yet. Add your first note.</Text>
          ) : (
            notes.map((note) => (
              <View key={note.id} style={styles.noteCard}>
                <View style={styles.noteTop}>
                  <NoteTypePill type={note.noteType} />
                  <Text style={styles.noteDate}>{formatDate(note.createdAt)}</Text>
                  <Pressable
                    onPress={() => confirmDeleteNote(note.id)}
                    hitSlop={8}
                    style={styles.deleteNoteBtn}
                  >
                    <Ionicons name="trash-outline" size={14} color={Colors.dark.error} />
                  </Pressable>
                </View>
                <Text style={styles.noteContent}>{note.content}</Text>
              </View>
            ))
          )}
        </Animated.View>

        {/* Booking History */}
        <Animated.View entering={FadeInDown.delay(180).duration(300)} style={styles.section}>
          <Pressable
            style={styles.sectionHeader}
            onPress={() => setHistoryExpanded((e) => !e)}
          >
            <Ionicons name="time-outline" size={16} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>Booking History</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.historyCount}>{bookingHistory.length}</Text>
            <Ionicons
              name={historyExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={Colors.dark.textSecondary}
            />
          </Pressable>

          {historyExpanded && (
            <View style={{ gap: Spacing.sm }}>
              {bookingHistory.length === 0 ? (
                <Text style={styles.emptyNotesText}>No bookings found.</Text>
              ) : (
                bookingHistory.map((b) => {
                  const statusColor = STATUS_COLORS[b.status] ?? Colors.dark.textSecondary;
                  return (
                    <Pressable
                      key={b.id}
                      style={styles.historyRow}
                      onPress={() => navigation.navigate("ProviderBookingDetail", { orderId: b.id })}
                    >
                      <View style={[styles.statusBar, { backgroundColor: statusColor }]} />
                      <View style={styles.historyBody}>
                        <Text style={styles.historyService} numberOfLines={1}>
                          {b.serviceName}
                        </Text>
                        <Text style={styles.historyMeta}>
                          {formatDate(b.scheduledAt)}
                          {b.scheduledAt ? ` · ${formatTime(b.scheduledAt)}` : ""}
                        </Text>
                      </View>
                      <View style={styles.historyRight}>
                        <Text style={styles.historyAmount}>AED {b.totalAmount}</Text>
                        <View style={[styles.statusPill, { backgroundColor: statusColor + "20" }]}>
                          <Text style={[styles.statusText, { color: statusColor }]}>
                            {STATUS_LABELS[b.status] ?? b.status}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={Colors.dark.textSecondary} />
                    </Pressable>
                  );
                })
              )}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Add Note Modal */}
      <Modal visible={addNoteVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Note</Text>

            <View style={styles.noteTypeRow}>
              {NOTE_TYPES.map((t) => (
                <Pressable
                  key={t.key}
                  style={[
                    styles.noteTypeChip,
                    noteType === t.key && { backgroundColor: t.color + "30", borderColor: t.color },
                  ]}
                  onPress={() => setNoteType(t.key)}
                >
                  <Text style={[styles.noteTypeChipText, noteType === t.key && { color: t.color }]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={styles.noteInput}
              placeholder="Write your note here..."
              placeholderTextColor={Colors.dark.textSecondary}
              value={noteContent}
              onChangeText={setNoteContent}
              multiline
              autoFocus
            />

            <View style={styles.modalBtns}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => {
                  setAddNoteVisible(false);
                  setNoteContent("");
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveBtn, (!noteContent.trim() || addNote.isPending) && { opacity: 0.5 }]}
                onPress={() => addNote.mutate()}
                disabled={!noteContent.trim() || addNote.isPending}
              >
                <Text style={styles.modalSaveText}>
                  {addNote.isPending ? "Saving..." : "Save Note"}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: { fontSize: 15, color: Colors.dark.textSecondary },
  playerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  playerHeaderInfo: { flex: 1, gap: 6 },
  playerName: { fontSize: 22, fontWeight: "800", color: Colors.dark.text },
  levelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  levelPill: {
    backgroundColor: Colors.dark.primary + "25",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  levelPillText: { fontSize: 12, fontWeight: "700", color: Colors.dark.primary },
  xpText: { fontSize: 13, color: Colors.dark.textSecondary },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: "#0F141B",
    borderRadius: 14,
    overflow: "hidden",
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    gap: 3,
  },
  statValue: { fontSize: 14, fontWeight: "700", color: Colors.dark.text },
  statLabel: { fontSize: 11, color: Colors.dark.textSecondary },
  section: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: "#0F141B",
    borderRadius: 14,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    flex: 1,
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary + "20",
  },
  editBtnText: { fontSize: 12, fontWeight: "600", color: Colors.dark.primary },
  prefRow: { gap: 4 },
  prefLabel: { fontSize: 12, color: Colors.dark.textSecondary, fontWeight: "500" },
  prefInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.dark.text,
    minHeight: 36,
  },
  prefInputMulti: { minHeight: 60, textAlignVertical: "top", paddingTop: 8 },
  prefInputReadonly: { color: Colors.dark.text, opacity: 0.8 },
  optionChips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: "transparent",
  },
  optionChipActive: { borderColor: Colors.dark.primary, backgroundColor: Colors.dark.primary + "15" },
  optionChipText: { fontSize: 13, color: Colors.dark.textSecondary },
  optionChipTextActive: { color: Colors.dark.primary, fontWeight: "600" },
  addNoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "15",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  addNoteBtnText: { fontSize: 12, fontWeight: "600", color: Colors.dark.primary },
  emptyNotesText: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center", paddingVertical: Spacing.sm },
  noteCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 10,
    padding: Spacing.md,
    gap: 8,
  },
  noteTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  noteTypePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  noteTypePillText: { fontSize: 10, fontWeight: "700" },
  noteDate: { fontSize: 11, color: Colors.dark.textSecondary, flex: 1 },
  deleteNoteBtn: { padding: 4 },
  noteContent: { fontSize: 14, color: Colors.dark.text, lineHeight: 20 },
  historyCount: { fontSize: 13, color: Colors.dark.textSecondary, marginRight: 4 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 10,
    overflow: "hidden",
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  statusBar: { width: 3, alignSelf: "stretch" },
  historyBody: { flex: 1, paddingVertical: Spacing.sm, gap: 3 },
  historyService: { fontSize: 13, fontWeight: "600", color: Colors.dark.text },
  historyMeta: { fontSize: 11, color: Colors.dark.textSecondary },
  historyRight: { alignItems: "flex-end", gap: 4 },
  historyAmount: { fontSize: 12, fontWeight: "700", color: Colors.dark.text },
  statusPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "600" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.textSecondary,
    alignSelf: "center",
    marginBottom: 4,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: Colors.dark.text },
  noteTypeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  noteTypeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: "transparent",
  },
  noteTypeChipText: { fontSize: 13, color: Colors.dark.textSecondary },
  noteInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 10,
    padding: Spacing.md,
    fontSize: 15,
    color: Colors.dark.text,
    minHeight: 100,
    textAlignVertical: "top",
  },
  modalBtns: { flexDirection: "row", gap: Spacing.md },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: Colors.dark.textSecondary },
  modalSaveBtn: {
    flex: 2,
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalSaveText: { fontSize: 15, fontWeight: "700", color: Colors.dark.buttonText },
});
