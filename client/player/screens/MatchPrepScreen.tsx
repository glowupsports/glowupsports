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
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, Backgrounds } from "@/constants/theme";
import { usePlayer } from "@/player/context/PlayerContext";
import { apiRequest } from "@/lib/query-client";
import type { PlayerStackParamList, ScheduleStackParamList } from "@/player/navigation/PlayerNavigator";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const MIRROR_ACCENT = "#A78BFA";
const PRIMARY = Colors.dark.primary;

interface Opponent {
  id: string;
  name: string;
  club?: string;
  rating?: string;
  playstyleTags?: string[];
  strongerSide?: string;
  weakerSide?: string;
  typicalPatterns?: string[];
  playerNotes?: string;
}

interface MatchPlan {
  id: string;
  scheduledDate: string;
  venue?: string;
  opponentId?: string;
  opponent?: Opponent;
  primaryTactic?: string;
  mentalCue?: string;
  energyFocus?: string;
  returnGamePlan?: string;
  preMatchMood?: string;
  preMatchConfidence?: number;
  preMatchGoal?: string;
  physicalReadiness?: string;
  suggestedTactics?: string[];
  status: string;
}

const ENERGY_OPTIONS = ["Aggressive", "Consistent", "Tactical", "Defensive"];
const MOOD_OPTIONS = ["Calm", "Nervous", "Confident", "Fired Up", "Tired", "Focused"];
const PHYSICAL_OPTIONS = ["Fresh", "Slightly Tired", "Fatigued"];

const PLAYSTYLE_LABELS: Record<string, string> = {
  baseline_grinder: "Baseline Grinder",
  aggressive_hitter: "Aggressive Hitter",
  serve_focused: "Serve Focused",
  consistent_defender: "Consistent Defender",
  net_player: "Net Player",
  counterpuncher: "Counterpuncher",
  all_court: "All-Court",
  pusher: "Pusher",
  big_server: "Big Server",
  touch_player: "Touch Player",
  Baseliner: "Baseliner",
  "Serve & Volley": "Serve & Volley",
  Moonballer: "Moonballer",
  Counterpuncher: "Counterpuncher",
  "Big Hitter": "Big Hitter",
  Defensive: "Defensive",
  Aggressive: "Aggressive",
};

function ChipRow({
  options,
  selected,
  onSelect,
  multi = false,
  color = PRIMARY,
}: {
  options: string[];
  selected: string | string[];
  onSelect: (v: string) => void;
  multi?: boolean;
  color?: string;
}) {
  const isSelected = (v: string) =>
    multi ? (selected as string[]).includes(v) : selected === v;

  return (
    <View style={chipRowStyles.row}>
      {options.map((opt) => (
        <Pressable
          key={opt}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelect(opt);
          }}
          style={[chipRowStyles.chip, isSelected(opt) && { backgroundColor: color + "30", borderColor: color }]}
        >
          <Text style={[chipRowStyles.chipText, isSelected(opt) && { color }]}>
            {opt}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const chipRowStyles = makeReactiveStyles(() => StyleSheet.create({
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
}));

export default function MatchPrepScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<PlayerStackParamList>>();
  const route = useRoute();
  const { playerId } = usePlayer();
  const queryClient = useQueryClient();
  const params = route.params as { planId?: string; matchId?: string };

  const { data: plan, isLoading: loadingPlan } = useQuery<MatchPlan>({
    queryKey: [`/api/match-intelligence/plans/${params?.planId}?playerId=${playerId}`],
    enabled: !!params?.planId && !!playerId,
  });

  const { data: opponents } = useQuery<Opponent[]>({
    queryKey: [`/api/match-intelligence/opponents?playerId=${playerId}`],
    enabled: !!playerId,
  });

  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(null);
  const [primaryTactic, setPrimaryTactic] = useState("");
  const [mentalCue, setMentalCue] = useState("");
  const [energyFocus, setEnergyFocus] = useState("");
  const [returnGamePlan, setReturnGamePlan] = useState("");
  const [preMatchMood, setPreMatchMood] = useState("");
  const [confidence, setConfidence] = useState(5);
  const [preMatchGoal, setPreMatchGoal] = useState("");
  const [physicalReadiness, setPhysicalReadiness] = useState("");

  useEffect(() => {
    if (plan) {
      setSelectedOpponentId(plan.opponentId || null);
      setPrimaryTactic(plan.primaryTactic || "");
      setMentalCue(plan.mentalCue || "");
      setEnergyFocus(plan.energyFocus || "");
      setReturnGamePlan(plan.returnGamePlan || "");
      setPreMatchMood(plan.preMatchMood || "");
      setConfidence(plan.preMatchConfidence || 5);
      setPreMatchGoal(plan.preMatchGoal || "");
    }
  }, [plan]);

  const selectedOpponent = opponents?.find((o) => o.id === selectedOpponentId) || plan?.opponent;

  const createPlanMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/match-intelligence/plans", {
        playerId: playerId,
        opponentId: selectedOpponentId,
        primaryTactic,
        mentalCue,
        energyFocus,
        preMatchMood: preMatchMood || null,
        preMatchConfidence: confidence || null,
        preMatchEnergy: physicalReadiness || null,
      });
    },
    onSuccess: async (newPlan: any) => {
      await savePreReflection(newPlan.id);
      queryClient.invalidateQueries({ queryKey: [`/api/match-intelligence/upcoming`] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    },
    onError: () => {
      Alert.alert("Error", "Could not save game plan. Please try again.");
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/match-intelligence/plans/${params.planId}`, {
        playerId: playerId,
        opponentId: selectedOpponentId,
        primaryTactic,
        mentalCue,
        energyFocus,
        preMatchMood: preMatchMood || null,
        preMatchConfidence: confidence || null,
        preMatchEnergy: physicalReadiness || null,
      });
    },
    onSuccess: async () => {
      if (params.planId) {
        await savePreReflection(params.planId);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/match-intelligence/upcoming`] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    },
    onError: () => {
      Alert.alert("Error", "Could not update game plan. Please try again.");
    },
  });

  const savePreReflection = async (planId: string) => {
    if (!params.matchId) return;
    try {
      await apiRequest("POST", `/api/match-intelligence/matches/${params.matchId}/reflection`, {
        playerId: playerId,
        preMatchMood: preMatchMood || null,
        preMatchConfidence: confidence || null,
        preMatchGoal: preMatchGoal.trim() || null,
      });
    } catch {
      // non-fatal
    }
  };

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (params.planId) {
      updatePlanMutation.mutate();
    } else {
      createPlanMutation.mutate();
    }
  };

  const isSaving = createPlanMutation.isPending || updatePlanMutation.isPending;

  if (loadingPlan) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PRIMARY} style={{ marginTop: 80 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark?.text || "#FFF"} />
        </Pressable>
        <Text style={styles.headerTitle}>Match Prep</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* === SECTION A: Opponent Intel === */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: Colors.dark.primary + "20" }]}>
              <Ionicons name="person-outline" size={18} color={Colors.dark.primary} />
            </View>
            <Text style={styles.cardTitle}>Opponent Intel</Text>
          </View>

          {selectedOpponent ? (
            <View style={styles.opponentCard}>
              <View style={styles.opponentHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.opponentName}>{selectedOpponent.name}</Text>
                  {selectedOpponent.club ? (
                    <Text style={styles.opponentClub}>{selectedOpponent.club}</Text>
                  ) : null}
                </View>
                {selectedOpponent.rating ? (
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingText}>{selectedOpponent.rating}</Text>
                  </View>
                ) : null}
              </View>

              {selectedOpponent.strongerSide || selectedOpponent.weakerSide ? (
                <View style={styles.sidesRow}>
                  {selectedOpponent.strongerSide ? (
                    <View style={styles.sideChip}>
                      <Ionicons name="flame" size={12} color={Colors.dark?.error || "#EF4444"} />
                      <Text style={[styles.sideChipText, { color: Colors.dark?.error || "#EF4444" }]}>
                        Strong: {selectedOpponent.strongerSide}
                      </Text>
                    </View>
                  ) : null}
                  {selectedOpponent.weakerSide ? (
                    <View style={styles.sideChip}>
                      <Ionicons name="leaf" size={12} color={Colors.dark.primary} />
                      <Text style={[styles.sideChipText, { color: Colors.dark.primary }]}>
                        Weak: {selectedOpponent.weakerSide}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {selectedOpponent.playstyleTags && selectedOpponent.playstyleTags.length > 0 ? (
                <View style={styles.tagsRow}>
                  {selectedOpponent.playstyleTags.map((tag) => (
                    <View key={tag} style={styles.styleTag}>
                      <Text style={styles.styleTagText}>{PLAYSTYLE_LABELS[tag] || tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {selectedOpponent.typicalPatterns && selectedOpponent.typicalPatterns.length > 0 ? (
                <View style={styles.patternSection}>
                  <Text style={styles.fieldLabel}>Typical Patterns</Text>
                  {selectedOpponent.typicalPatterns.map((p, i) => (
                    <Text key={i} style={styles.patternText}>- {p}</Text>
                  ))}
                </View>
              ) : null}

              <Pressable
                style={styles.editScoutBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  (navigation as any).navigate("OpponentProfile", { opponentId: selectedOpponent.id });
                }}
              >
                <Ionicons name="create-outline" size={14} color={PRIMARY} />
                <Text style={styles.editScoutText}>Edit Scouting Notes</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Select Opponent</Text>
          {opponents && opponents.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: Spacing.sm, paddingVertical: 4 }}>
                {opponents.map((opp) => (
                  <Pressable
                    key={opp.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedOpponentId(selectedOpponentId === opp.id ? null : opp.id);
                    }}
                    style={[
                      styles.opponentChip,
                      selectedOpponentId === opp.id && styles.opponentChipSelected,
                    ]}
                  >
                    <Text style={[
                      styles.opponentChipText,
                      selectedOpponentId === opp.id && styles.opponentChipSelectedText,
                    ]}>
                      {opp.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          ) : (
            <Pressable
              style={styles.addOpponentBtn}
              onPress={() => (navigation as any).navigate("OpponentProfile", { opponentId: null })}
            >
              <Ionicons name="person-add-outline" size={16} color={PRIMARY} />
              <Text style={styles.addOpponentText}>Add Opponent</Text>
            </Pressable>
          )}
        </View>

        {/* === SECTION B: Game Plan === */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: PRIMARY + "20" }]}>
              <Ionicons name="bulb-outline" size={18} color={PRIMARY} />
            </View>
            <Text style={styles.cardTitle}>Game Plan</Text>
          </View>

          {plan?.suggestedTactics && plan.suggestedTactics.length > 0 ? (
            <View style={styles.suggestionsBox}>
              <Text style={styles.suggestionsLabel}>AI Suggestions</Text>
              {plan.suggestedTactics.map((t, i) => (
                <Pressable
                  key={i}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setPrimaryTactic(t);
                  }}
                  style={styles.suggestionRow}
                >
                  <Ionicons name="flash-outline" size={14} color={PRIMARY} />
                  <Text style={styles.suggestionText}>{t}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Primary Tactic</Text>
          <TextInput
            style={styles.textInput}
            value={primaryTactic}
            onChangeText={setPrimaryTactic}
            placeholder="e.g. Serve wide on deuce, attack their backhand"
            placeholderTextColor={Colors.dark?.textMuted || "#888"}
            multiline
          />

          <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Mental Cue</Text>
          <TextInput
            style={styles.textInput}
            value={mentalCue}
            onChangeText={setMentalCue}
            placeholder="One word or phrase to reset with"
            placeholderTextColor={Colors.dark?.textMuted || "#888"}
          />

          <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Energy Focus</Text>
          <ChipRow
            options={ENERGY_OPTIONS}
            selected={energyFocus}
            onSelect={(v) => setEnergyFocus(energyFocus === v ? "" : v)}
          />

          <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Return Game Plan (optional)</Text>
          <TextInput
            style={styles.textInput}
            value={returnGamePlan}
            onChangeText={setReturnGamePlan}
            placeholder="e.g. Go crosscourt on second serve, chip-and-charge"
            placeholderTextColor={Colors.dark?.textMuted || "#888"}
            multiline
          />
        </View>

        {/* === SECTION C: Mindset Check-In === */}
        <View style={[styles.card, { borderLeftColor: MIRROR_ACCENT, borderLeftWidth: 3 }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: MIRROR_ACCENT + "20" }]}>
              <Ionicons name="mic-outline" size={18} color={MIRROR_ACCENT} />
            </View>
            <Text style={styles.cardTitle}>Mindset Check-In</Text>
          </View>

          <Text style={styles.fieldLabel}>Pre-match mood</Text>
          <ChipRow
            options={MOOD_OPTIONS}
            selected={preMatchMood}
            onSelect={(v) => setPreMatchMood(preMatchMood === v ? "" : v)}
            color={MIRROR_ACCENT}
          />

          <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>
            Confidence: {confidence}/10
          </Text>
          <Slider
            style={{ width: "100%", height: 40 }}
            minimumValue={1}
            maximumValue={10}
            step={1}
            value={confidence}
            onValueChange={(v) => setConfidence(Math.round(v))}
            minimumTrackTintColor={MIRROR_ACCENT}
            maximumTrackTintColor={Colors.dark?.backgroundTertiary || "#333"}
            thumbTintColor={MIRROR_ACCENT}
          />

          <Text style={[styles.fieldLabel, { marginTop: Spacing.sm }]}>
            Match goal (max 80 chars)
          </Text>
          <TextInput
            style={styles.textInput}
            value={preMatchGoal}
            onChangeText={setPreMatchGoal}
            placeholder="e.g. Win the first set, Hold serve consistently"
            placeholderTextColor={Colors.dark?.textMuted || "#888"}
            maxLength={80}
          />

          <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Physical readiness</Text>
          <ChipRow
            options={PHYSICAL_OPTIONS}
            selected={physicalReadiness}
            onSelect={(v) => setPhysicalReadiness(physicalReadiness === v ? "" : v)}
            color={Colors.dark.primary}
          />
        </View>

        <Pressable
          style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.dark.buttonText} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.buttonText} />
              <Text style={styles.saveBtnText}>Save Game Plan</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark?.backgroundRoot || Backgrounds.root,
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
  headerTitle: {
    ...Typography.subtitle,
    color: Colors.dark?.text || "#FFF",
    fontWeight: "700",
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
  opponentCard: {
    backgroundColor: Colors.dark?.backgroundTertiary || "#222",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  opponentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  opponentName: {
    ...Typography.body,
    color: Colors.dark?.text || "#FFF",
    fontWeight: "700",
  },
  opponentClub: {
    ...Typography.small,
    color: Colors.dark?.textMuted || "#888",
  },
  ratingBadge: {
    backgroundColor: Colors.dark?.gold + "20" || "#FFD70020",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.dark?.gold + "60" || "#FFD70060",
  },
  ratingText: {
    ...Typography.caption,
    color: Colors.dark?.gold || "#FFD700",
    fontWeight: "700",
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
    backgroundColor: Colors.dark?.backgroundRoot || Backgrounds.root,
    borderRadius: BorderRadius.sm,
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
    backgroundColor: Colors.dark?.backgroundRoot || Backgrounds.root,
  },
  styleTagText: {
    ...Typography.small,
    color: Colors.dark?.textSecondary || "#AAA",
  },
  patternSection: {
    gap: 4,
  },
  patternText: {
    ...Typography.small,
    color: Colors.dark?.textSecondary || "#AAA",
  },
  editScoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: PRIMARY + "60",
    marginTop: Spacing.xs,
  },
  editScoutText: {
    ...Typography.caption,
    color: PRIMARY,
    fontWeight: "600",
  },
  fieldLabel: {
    ...Typography.caption,
    color: Colors.dark?.textMuted || "#888",
    marginTop: 4,
  },
  opponentChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark?.backgroundTertiary || "#333",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  opponentChipSelected: {
    backgroundColor: PRIMARY + "20",
    borderColor: PRIMARY,
  },
  opponentChipText: {
    ...Typography.body,
    color: Colors.dark?.textSecondary || "#AAA",
  },
  opponentChipSelectedText: {
    color: PRIMARY,
    fontWeight: "700",
  },
  addOpponentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: PRIMARY + "60",
    alignSelf: "flex-start",
  },
  addOpponentText: {
    ...Typography.body,
    color: PRIMARY,
    fontWeight: "600",
  },
  suggestionsBox: {
    backgroundColor: PRIMARY + "10",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: PRIMARY + "30",
  },
  suggestionsLabel: {
    ...Typography.caption,
    color: PRIMARY,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  suggestionText: {
    ...Typography.small,
    color: Colors.dark?.text || "#FFF",
    flex: 1,
  },
  textInput: {
    backgroundColor: Colors.dark?.backgroundTertiary || "#222",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark?.text || "#FFF",
    minHeight: 44,
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
}));
