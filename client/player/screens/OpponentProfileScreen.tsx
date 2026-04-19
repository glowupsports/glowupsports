import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { usePlayer } from "@/player/context/PlayerContext";
import { apiRequest } from "@/lib/query-client";

const PRIMARY = Colors.dark.primary;
const MIRROR_ACCENT = "#A78BFA";

interface OpponentDetail {
  id: string;
  name: string;
  club?: string;
  rating?: string;
  playstyleTags?: string[];
  strongerSide?: string;
  weakerSide?: string;
  typicalPatterns?: string[];
  playerNotes?: string;
  coachNotes?: string;
  headToHead?: {
    wins: number;
    losses: number;
    winRate: number | null;
    matches: Array<{
      id: string;
      matchDate: string;
      result: string;
      score: string;
    }>;
  };
}

const SIDE_OPTIONS = ["FH", "BH", "Serve", "Net", "All-round"];
const PLAYSTYLE_OPTIONS = [
  "Baseliner",
  "Serve & Volley",
  "Moonballer",
  "Counterpuncher",
  "Big Hitter",
  "Defensive",
  "Aggressive",
];

function ChipSelector({
  options,
  selected,
  onToggle,
  single = false,
  color = PRIMARY,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  single?: boolean;
  color?: string;
}) {
  return (
    <View style={chipStyles.row}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggle(opt);
            }}
            style={[chipStyles.chip, active && { backgroundColor: color + "30", borderColor: color }]}
          >
            <Text style={[chipStyles.chipText, active && { color }]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark?.backgroundTertiary || "#333",
    backgroundColor: Colors.dark?.backgroundTertiary || "#333",
  },
  chipText: { ...Typography.small, color: Colors.dark?.textMuted || "#888" },
});

export default function OpponentProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { player } = usePlayer();
  const queryClient = useQueryClient();
  const params = route.params as { opponentId?: string | null };

  const isNew = !params?.opponentId;

  const { data: opponent, isLoading } = useQuery<OpponentDetail>({
    queryKey: [`/api/match-intelligence/opponents/${params?.opponentId}`],
    enabled: !!params?.opponentId,
  });

  const [editing, setEditing] = useState(isNew);
  const [name, setName] = useState("");
  const [club, setClub] = useState("");
  const [rating, setRating] = useState("");
  const [strongerSide, setStrongerSide] = useState("");
  const [weakerSide, setWeakerSide] = useState("");
  const [playstyleTags, setPlaystyleTags] = useState<string[]>([]);
  const [typicalPatterns, setTypicalPatterns] = useState("");
  const [playerNotes, setPlayerNotes] = useState("");

  useEffect(() => {
    if (opponent) {
      setName(opponent.name || "");
      setClub(opponent.club || "");
      setRating(opponent.rating || "");
      setStrongerSide(opponent.strongerSide || "");
      setWeakerSide(opponent.weakerSide || "");
      setPlaystyleTags(opponent.playstyleTags || []);
      setTypicalPatterns((opponent.typicalPatterns || []).join(", "));
      setPlayerNotes(opponent.playerNotes || "");
    }
  }, [opponent]);

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/match-intelligence/opponents", {
        playerId: player?.id,
        name: name.trim(),
        club: club.trim() || undefined,
        rating: rating.trim() || undefined,
        strongerSide: strongerSide || undefined,
        weakerSide: weakerSide || undefined,
        playstyleTags,
        typicalPatterns: typicalPatterns.trim()
          ? typicalPatterns.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        playerNotes: playerNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/match-intelligence/opponents`] });
      navigation.goBack();
    },
    onError: () => {
      Alert.alert("Error", "Could not save opponent. Please try again.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/match-intelligence/opponents/${params?.opponentId}`, {
        name: name.trim(),
        club: club.trim() || undefined,
        rating: rating.trim() || undefined,
        strongerSide: strongerSide || undefined,
        weakerSide: weakerSide || undefined,
        playstyleTags,
        typicalPatterns: typicalPatterns.trim()
          ? typicalPatterns.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        playerNotes: playerNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/match-intelligence/opponents/${params?.opponentId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/match-intelligence/opponents`] });
      setEditing(false);
    },
    onError: () => {
      Alert.alert("Error", "Could not update opponent. Please try again.");
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter the opponent's name.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isNew) {
      createMutation.mutate();
    } else {
      updateMutation.mutate();
    }
  };

  const toggleTag = (tag: string) => {
    setPlaystyleTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PRIMARY} style={{ marginTop: 80 }} />
      </View>
    );
  }

  const h2h = opponent?.headToHead;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark?.text || "#FFF"} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {isNew ? "New Opponent" : (name || opponent?.name || "Opponent")}
        </Text>
        {!isNew ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setEditing(!editing);
            }}
            style={styles.editHeaderBtn}
          >
            <Ionicons name={editing ? "close" : "create-outline"} size={22} color={PRIMARY} />
          </Pressable>
        ) : <View style={{ width: 40 }} />}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Head-to-Head Record */}
        {h2h && !isNew ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: PRIMARY + "20" }]}>
                <Ionicons name="trophy-outline" size={18} color={PRIMARY} />
              </View>
              <Text style={styles.cardTitle}>Head-to-Head</Text>
            </View>

            <View style={styles.h2hRow}>
              <View style={styles.h2hStat}>
                <Text style={[styles.h2hNumber, { color: Colors.dark?.successNeon || "#39FF14" }]}>
                  {h2h.wins}
                </Text>
                <Text style={styles.h2hLabel}>Wins</Text>
              </View>
              <View style={styles.h2hDivider} />
              <View style={styles.h2hStat}>
                <Text style={[styles.h2hNumber, { color: Colors.dark?.error || "#EF4444" }]}>
                  {h2h.losses}
                </Text>
                <Text style={styles.h2hLabel}>Losses</Text>
              </View>
              {h2h.winRate !== null ? (
                <>
                  <View style={styles.h2hDivider} />
                  <View style={styles.h2hStat}>
                    <Text style={[styles.h2hNumber, { color: PRIMARY }]}>{h2h.winRate}%</Text>
                    <Text style={styles.h2hLabel}>Win Rate</Text>
                  </View>
                </>
              ) : null}
            </View>

            {h2h.matches && h2h.matches.length > 0 ? (
              <View style={styles.matchHistoryList}>
                <Text style={styles.sectionSubtitle}>Last {Math.min(5, h2h.matches.length)} matches</Text>
                {h2h.matches.slice(0, 5).map((m) => (
                  <View key={m.id} style={styles.matchHistoryRow}>
                    <View style={[
                      styles.resultDot,
                      { backgroundColor: m.result === "win" ? (Colors.dark?.successNeon || "#39FF14") : (Colors.dark?.error || "#EF4444") },
                    ]} />
                    <Text style={styles.matchHistoryDate}>
                      {new Date(m.matchDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                    </Text>
                    <Text style={[
                      styles.matchHistoryResult,
                      { color: m.result === "win" ? (Colors.dark?.successNeon || "#39FF14") : (Colors.dark?.error || "#EF4444") },
                    ]}>
                      {m.result === "win" ? "W" : "L"}
                    </Text>
                    <Text style={styles.matchHistoryScore}>{m.score}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Scouting Notes */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: MIRROR_ACCENT + "20" }]}>
              <Ionicons name="search-outline" size={18} color={MIRROR_ACCENT} />
            </View>
            <Text style={styles.cardTitle}>Scouting Notes</Text>
          </View>

          {editing ? (
            <>
              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="Opponent name"
                placeholderTextColor={Colors.dark?.textMuted || "#888"}
              />

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Club</Text>
              <TextInput
                style={styles.textInput}
                value={club}
                onChangeText={setClub}
                placeholder="Club or academy"
                placeholderTextColor={Colors.dark?.textMuted || "#888"}
              />

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Rating / Level</Text>
              <TextInput
                style={styles.textInput}
                value={rating}
                onChangeText={setRating}
                placeholder="e.g. 4.5 UTR, 3.0 NTRP"
                placeholderTextColor={Colors.dark?.textMuted || "#888"}
              />

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Stronger side</Text>
              <ChipSelector
                options={SIDE_OPTIONS}
                selected={strongerSide ? [strongerSide] : []}
                onToggle={(v) => setStrongerSide(strongerSide === v ? "" : v)}
                single
                color={Colors.dark?.error || "#EF4444"}
              />

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Weaker side</Text>
              <ChipSelector
                options={SIDE_OPTIONS}
                selected={weakerSide ? [weakerSide] : []}
                onToggle={(v) => setWeakerSide(weakerSide === v ? "" : v)}
                single
                color={Colors.dark.primary}
              />

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Playstyle tags</Text>
              <ChipSelector
                options={PLAYSTYLE_OPTIONS}
                selected={playstyleTags}
                onToggle={toggleTag}
                color={PRIMARY}
              />

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>
                Typical patterns (comma-separated)
              </Text>
              <TextInput
                style={[styles.textInput, { minHeight: 80 }]}
                value={typicalPatterns}
                onChangeText={setTypicalPatterns}
                placeholder="e.g. Opens wide with serve, follows to net"
                placeholderTextColor={Colors.dark?.textMuted || "#888"}
                multiline
              />

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Player notes</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 80 }]}
                value={playerNotes}
                onChangeText={setPlayerNotes}
                placeholder="Anything you want to remember about this opponent"
                placeholderTextColor={Colors.dark?.textMuted || "#888"}
                multiline
              />

              <Pressable
                style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color={Colors.dark.buttonText} />
                    <Text style={styles.saveBtnText}>
                      {isNew ? "Save Opponent" : "Save Changes"}
                    </Text>
                  </>
                )}
              </Pressable>
            </>
          ) : (
            <>
              {opponent?.club ? (
                <View style={styles.infoRow}>
                  <Ionicons name="business-outline" size={14} color={Colors.dark?.textMuted || "#888"} />
                  <Text style={styles.infoText}>{opponent.club}</Text>
                </View>
              ) : null}
              {opponent?.rating ? (
                <View style={styles.infoRow}>
                  <Ionicons name="star-outline" size={14} color={Colors.dark?.gold || "#FFD700"} />
                  <Text style={styles.infoText}>{opponent.rating}</Text>
                </View>
              ) : null}

              {opponent?.strongerSide || opponent?.weakerSide ? (
                <View style={styles.sidesRow}>
                  {opponent?.strongerSide ? (
                    <View style={[styles.sideChip, { borderColor: Colors.dark?.error + "60" || "#EF444460" }]}>
                      <Ionicons name="flame" size={12} color={Colors.dark?.error || "#EF4444"} />
                      <Text style={[styles.sideChipText, { color: Colors.dark?.error || "#EF4444" }]}>
                        Strong: {opponent.strongerSide}
                      </Text>
                    </View>
                  ) : null}
                  {opponent?.weakerSide ? (
                    <View style={[styles.sideChip, { borderColor: Colors.dark.primary + "60" }]}>
                      <Ionicons name="leaf" size={12} color={Colors.dark.primary} />
                      <Text style={[styles.sideChipText, { color: Colors.dark.primary }]}>
                        Weak: {opponent.weakerSide}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {opponent?.playstyleTags && opponent.playstyleTags.length > 0 ? (
                <View style={styles.tagsRow}>
                  {opponent.playstyleTags.map((tag) => (
                    <View key={tag} style={styles.styleTag}>
                      <Text style={styles.styleTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {opponent?.typicalPatterns && opponent.typicalPatterns.length > 0 ? (
                <View>
                  <Text style={styles.fieldLabel}>Typical patterns</Text>
                  {opponent.typicalPatterns.map((p, i) => (
                    <Text key={i} style={styles.patternText}>- {p}</Text>
                  ))}
                </View>
              ) : null}

              {opponent?.playerNotes ? (
                <View>
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <Text style={styles.notesText}>{opponent.playerNotes}</Text>
                </View>
              ) : null}

              {!opponent?.strongerSide && !opponent?.playstyleTags?.length && !opponent?.playerNotes ? (
                <Text style={styles.emptyNotesText}>
                  No scouting notes yet. Tap the edit icon to add intel.
                </Text>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark?.backgroundRoot || "#090E17",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    padding: Spacing.sm,
    width: 40,
  },
  editHeaderBtn: {
    padding: Spacing.sm,
    width: 40,
    alignItems: "flex-end",
  },
  headerTitle: {
    ...Typography.subtitle,
    color: Colors.dark?.text || "#FFF",
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.dark?.backgroundSecondary || "#1A1A2E",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    ...Typography.body,
    color: Colors.dark?.text || "#FFF",
    fontWeight: "700",
  },
  h2hRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: Colors.dark?.backgroundTertiary || "#222",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  h2hStat: {
    alignItems: "center",
    gap: 4,
  },
  h2hNumber: {
    fontSize: 28,
    fontWeight: "800",
  },
  h2hLabel: {
    ...Typography.small,
    color: Colors.dark?.textMuted || "#888",
  },
  h2hDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.dark?.backgroundRoot || "#090E17",
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.dark?.textMuted || "#888",
    marginBottom: Spacing.xs,
  },
  matchHistoryList: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  matchHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.dark?.backgroundTertiary || "#222",
    borderRadius: BorderRadius.sm,
  },
  resultDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  matchHistoryDate: {
    ...Typography.small,
    color: Colors.dark?.textSecondary || "#AAA",
    flex: 1,
  },
  matchHistoryResult: {
    ...Typography.small,
    fontWeight: "700",
  },
  matchHistoryScore: {
    ...Typography.small,
    color: Colors.dark?.textMuted || "#888",
    minWidth: 50,
    textAlign: "right",
  },
  fieldLabel: {
    ...Typography.caption,
    color: Colors.dark?.textMuted || "#888",
    marginTop: 4,
  },
  textInput: {
    backgroundColor: Colors.dark?.backgroundTertiary || "#222",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark?.text || "#FFF",
    minHeight: 44,
  },
  sidesRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  sideChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.dark?.backgroundRoot || "#090E17",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  sideChipText: {
    ...Typography.small,
    fontWeight: "600",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  styleTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark?.backgroundRoot || "#090E17",
    borderWidth: 1,
    borderColor: Colors.dark?.backgroundTertiary || "#333",
  },
  styleTagText: {
    ...Typography.small,
    color: Colors.dark?.textSecondary || "#AAA",
  },
  patternText: {
    ...Typography.small,
    color: Colors.dark?.textSecondary || "#AAA",
    marginTop: 2,
  },
  notesText: {
    ...Typography.body,
    color: Colors.dark?.text || "#FFF",
    marginTop: 4,
    lineHeight: 22,
  },
  emptyNotesText: {
    ...Typography.small,
    color: Colors.dark?.textMuted || "#888",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: Spacing.sm,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  infoText: {
    ...Typography.body,
    color: Colors.dark?.textSecondary || "#AAA",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: PRIMARY,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  saveBtnText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
});
