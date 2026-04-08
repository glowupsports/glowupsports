import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
type IoniconsName = ComponentProps<typeof Ionicons>["name"];
import * as Haptics from "expo-haptics";
import { useMutation } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

// ── Types ────────────────────────────────────────────────────────────────────

interface PlayerEntry {
  id: string;
  name: string;
}

export interface IntakeResult {
  trainedSkills: string[];
  intensity: string;
  groupDynamics?: Record<string, string>;
  playerData: Array<{
    playerId: string;
    playerTags?: string[];
    pillarRatings?: Record<string, string>;
    highlight?: string;
  }>;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onComplete: (result: IntakeResult) => void;
  onSaveOnly?: () => void;
  sessionId: string;
  sessionType: string;
  players: PlayerEntry[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SKILL_OPTIONS = [
  "Forehand",
  "Backhand",
  "Serve",
  "Return",
  "Serve & Return",
  "Volley",
  "Net play",
  "Footwork",
  "Rally consistency",
  "Match play",
  "Movement patterns",
  "Tactics / patterns",
  "Fitness / conditioning",
  "Coordination / agility",
];

const INTENSITY_OPTIONS: { value: string; label: string; icon: IoniconsName }[] = [
  { value: "light", label: "Light", icon: "leaf-outline" },
  { value: "normal", label: "Normal", icon: "flash-outline" },
  { value: "intense", label: "Intense", icon: "flame-outline" },
];

const GROUP_DYNAMICS_OPTIONS: {
  field: keyof GroupDynamicsState;
  label: string;
  options: { value: string; label: string }[];
}[] = [
  {
    field: "overallFocus",
    label: "Overall Focus",
    options: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
  },
  {
    field: "listeningCoachability",
    label: "Coachability",
    options: [
      { value: "needs_work", label: "Needs Work" },
      { value: "ok", label: "OK" },
      { value: "great", label: "Great" },
    ],
  },
  {
    field: "groupEnergy",
    label: "Group Energy",
    options: [
      { value: "flat", label: "Flat" },
      { value: "normal", label: "Normal" },
      { value: "electric", label: "Electric" },
    ],
  },
  {
    field: "groupCohesion",
    label: "Group Cohesion",
    options: [
      { value: "fragmented", label: "Fragmented" },
      { value: "mixed", label: "Mixed" },
      { value: "united", label: "United" },
    ],
  },
];

const PLAYER_TAGS: { value: string; label: string }[] = [
  { value: "led_group", label: "Led Group" },
  { value: "distracted", label: "Distracted" },
  { value: "helped_others", label: "Helped Others" },
  { value: "struggled", label: "Struggled" },
  { value: "stood_out", label: "Stood Out" },
];

const PILLAR_OPTIONS: {
  field: string;
  label: string;
  options: { value: string; label: string }[];
}[] = [
  {
    field: "effort",
    label: "Effort",
    options: [
      { value: "needs_attention", label: "Needs Attention" },
      { value: "developing", label: "Developing" },
      { value: "good", label: "Good" },
    ],
  },
  {
    field: "technique",
    label: "Technique",
    options: [
      { value: "needs_attention", label: "Needs Attention" },
      { value: "developing", label: "Developing" },
      { value: "good", label: "Good" },
    ],
  },
  {
    field: "tactical",
    label: "Tactical",
    options: [
      { value: "needs_attention", label: "Needs Attention" },
      { value: "developing", label: "Developing" },
      { value: "good", label: "Good" },
    ],
  },
  {
    field: "physical",
    label: "Physical",
    options: [
      { value: "needs_attention", label: "Needs Attention" },
      { value: "developing", label: "Developing" },
      { value: "good", label: "Good" },
    ],
  },
  {
    field: "mental",
    label: "Mental",
    options: [
      { value: "needs_attention", label: "Needs Attention" },
      { value: "developing", label: "Developing" },
      { value: "good", label: "Good" },
    ],
  },
];

const HIGHLIGHT_OPTIONS: { value: string; label: string; icon: IoniconsName; color: string }[] = [
  { value: "breakthrough", label: "Breakthrough", icon: "star-outline", color: Colors.dark.gold },
  { value: "steady", label: "Steady Progress", icon: "trending-up-outline", color: Colors.dark.primary },
  { value: "tough_day", label: "Tough Day", icon: "cloud-outline", color: Colors.dark.textMuted },
];

// ── State types ───────────────────────────────────────────────────────────────

interface GroupDynamicsState {
  overallFocus?: string;
  listeningCoachability?: string;
  groupEnergy?: string;
  groupCohesion?: string;
}

interface PlayerState {
  playerTags: string[];
  pillarRatings: Record<string, string>;
  highlight?: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.stepIndicatorRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i < current ? styles.stepDotDone : i === current ? styles.stepDotActive : styles.stepDotInactive,
          ]}
        />
      ))}
    </View>
  );
}

function ChipRow({
  options,
  selected,
  onToggle,
  multi = false,
}: {
  options: { value: string; label: string }[];
  selected: string | string[];
  onToggle: (v: string) => void;
  multi?: boolean;
}) {
  const isSelected = (v: string) =>
    multi ? (selected as string[]).includes(v) : selected === v;

  return (
    <View style={styles.chipRow}>
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          style={[styles.chip, isSelected(opt.value) && styles.chipSelected]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onToggle(opt.value);
          }}
        >
          <Text style={[styles.chipText, isSelected(opt.value) && styles.chipTextSelected]}>
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function IntakeFlowModal({
  visible,
  onClose,
  onComplete,
  onSaveOnly,
  sessionId,
  sessionType,
  players,
}: Props) {
  const insets = useSafeAreaInsets();
  const isGroup = sessionType === "group" || sessionType === "semi_private";
  const slideAnim = useRef(new Animated.Value(1)).current; // 0 = visible, 1 = off-screen below

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(1);
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // Calculate steps dynamically
  // Step 0: What was trained + intensity
  // Step 1 (group only): Group dynamics
  // Step 2..N (group, per player): Player tagging
  // Step N+1..M: Per-player pillar ratings (one step per player)
  const playerCount = players.length;

  type StepId =
    | { type: "training" }
    | { type: "group_dynamics" }
    | { type: "player_tags"; playerIdx: number }
    | { type: "pillar_ratings"; playerIdx: number };

  const buildSteps = (): StepId[] => {
    const steps: StepId[] = [{ type: "training" }];
    if (isGroup) {
      steps.push({ type: "group_dynamics" });
      for (let i = 0; i < playerCount; i++) {
        steps.push({ type: "player_tags", playerIdx: i });
      }
    }
    for (let i = 0; i < playerCount; i++) {
      steps.push({ type: "pillar_ratings", playerIdx: i });
    }
    return steps;
  };

  const steps = buildSteps();
  const totalSteps = steps.length;

  const [stepIndex, setStepIndex] = useState(0);
  const [trainedSkills, setTrainedSkills] = useState<string[]>([]);
  const [intensity, setIntensity] = useState<string>("");
  const [groupDynamics, setGroupDynamics] = useState<GroupDynamicsState>({});
  const [playerStates, setPlayerStates] = useState<PlayerState[]>(
    players.map(() => ({ playerTags: [], pillarRatings: {} }))
  );

  const saveMutation = useMutation({
    mutationFn: async ({ data, saveOnly }: { data: IntakeResult; saveOnly: boolean }) => {
      const res = await apiRequest("POST", `/api/coach/sessions/${sessionId}/intake`, {
        ...data,
        saveOnly,
      });
      if (!res.ok) throw new Error("Failed to save intake");
      return saveOnly;
    },
    onSuccess: (wasSaveOnly, { data }) => {
      if (!wasSaveOnly) {
        onComplete(data);
      } else {
        onSaveOnly?.();
        onClose();
      }
    },
  });

  const currentStep = steps[stepIndex];

  const updatePlayerState = useCallback((idx: number, patch: Partial<PlayerState>) => {
    setPlayerStates((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  const canProceed = (): boolean => {
    if (!currentStep) return false;
    if (currentStep.type === "training") {
      return trainedSkills.length > 0 && intensity !== "";
    }
    return true; // all other steps are optional tap choices
  };

  const handleNext = (saveOnly = false) => {
    if (!canProceed()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!saveOnly && stepIndex < totalSteps - 1) {
      setStepIndex((s) => s + 1);
    } else {
      handleFinish(saveOnly);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStepIndex((s) => s - 1);
    }
  };

  const buildResult = (): IntakeResult => ({
    trainedSkills,
    intensity,
    groupDynamics: isGroup && Object.keys(groupDynamics).length > 0
      ? (groupDynamics as Record<string, string>)
      : undefined,
    playerData: players.map((p, i) => ({
      playerId: p.id,
      playerTags: playerStates[i].playerTags.length > 0 ? playerStates[i].playerTags : undefined,
      pillarRatings: Object.keys(playerStates[i].pillarRatings).length > 0
        ? playerStates[i].pillarRatings
        : undefined,
      highlight: playerStates[i].highlight,
    })),
  });

  const handleFinish = (saveOnly = false) => {
    const result = buildResult();
    saveMutation.mutate({ data: result, saveOnly });
  };

  const renderStep = () => {
    if (!currentStep) return null;

    if (currentStep.type === "training") {
      return (
        <View>
          <Text style={styles.stepTitle}>What did you work on today?</Text>
          <Text style={styles.stepSubtitle}>Select all skills covered in this session</Text>
          <ChipRow
            options={SKILL_OPTIONS.map((s) => ({ value: s, label: s }))}
            selected={trainedSkills}
            onToggle={(v) =>
              setTrainedSkills((prev) =>
                prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
              )
            }
            multi
          />

          <Text style={[styles.stepTitle, { marginTop: Spacing.lg }]}>Session Intensity</Text>
          <View style={styles.intensityRow}>
            {INTENSITY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.intensityCard, intensity === opt.value && styles.intensityCardSelected]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIntensity(opt.value);
                }}
              >
                <Ionicons
                  name={opt.icon}
                  size={20}
                  color={intensity === opt.value ? Colors.dark.primary : Colors.dark.textMuted}
                />
                <Text style={[styles.intensityLabel, intensity === opt.value && styles.intensityLabelSelected]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }

    if (currentStep.type === "group_dynamics") {
      return (
        <View>
          <Text style={styles.stepTitle}>Group Dynamics</Text>
          <Text style={styles.stepSubtitle}>How did the group perform overall?</Text>
          {GROUP_DYNAMICS_OPTIONS.map((cfg) => (
            <View key={cfg.field} style={styles.dynamicsSection}>
              <Text style={styles.dynamicsLabel}>{cfg.label}</Text>
              <ChipRow
                options={cfg.options}
                selected={groupDynamics[cfg.field] ?? ""}
                onToggle={(v) =>
                  setGroupDynamics((prev) => ({
                    ...prev,
                    [cfg.field]: prev[cfg.field] === v ? "" : v,
                  }))
                }
              />
            </View>
          ))}
        </View>
      );
    }

    if (currentStep.type === "player_tags") {
      const pi = currentStep.playerIdx;
      const player = players[pi];
      const state = playerStates[pi];
      return (
        <View>
          <Text style={styles.stepTitle}>{player.name}</Text>
          <Text style={styles.stepSubtitle}>How did this player show up? (Select all that apply)</Text>
          <ChipRow
            options={PLAYER_TAGS}
            selected={state.playerTags}
            onToggle={(v) =>
              updatePlayerState(pi, {
                playerTags: state.playerTags.includes(v)
                  ? state.playerTags.filter((t) => t !== v)
                  : [...state.playerTags, v],
              })
            }
            multi
          />
        </View>
      );
    }

    if (currentStep.type === "pillar_ratings") {
      const pi = currentStep.playerIdx;
      const player = players[pi];
      const state = playerStates[pi];
      return (
        <View>
          <Text style={styles.stepTitle}>{player.name} — Quick Ratings</Text>
          <Text style={styles.stepSubtitle}>Tap to rate key pillars this session</Text>
          {PILLAR_OPTIONS.map((cfg) => (
            <View key={cfg.field} style={styles.pillarSection}>
              <Text style={styles.pillarLabel}>{cfg.label}</Text>
              <ChipRow
                options={cfg.options}
                selected={state.pillarRatings[cfg.field] ?? ""}
                onToggle={(v) =>
                  updatePlayerState(pi, {
                    pillarRatings: {
                      ...state.pillarRatings,
                      [cfg.field]: state.pillarRatings[cfg.field] === v ? "" : v,
                    },
                  })
                }
              />
            </View>
          ))}

          <Text style={[styles.pillarLabel, { marginTop: Spacing.lg }]}>Session Highlight</Text>
          <View style={styles.highlightRow}>
            {HIGHLIGHT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.highlightCard, state.highlight === opt.value && { borderColor: opt.color, backgroundColor: opt.color + "18" }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updatePlayerState(pi, {
                    highlight: state.highlight === opt.value ? undefined : opt.value,
                  });
                }}
              >
                <Ionicons
                  name={opt.icon}
                  size={16}
                  color={state.highlight === opt.value ? opt.color : Colors.dark.textMuted}
                />
                <Text style={[styles.highlightLabel, state.highlight === opt.value && { color: opt.color }]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }

    return null;
  };

  const isLastStep = stepIndex === totalSteps - 1;

  if (!visible) return null;

  const screenHeight = Dimensions.get("window").height;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + Spacing.md },
          {
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, screenHeight],
                }),
              },
            ],
          },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.dragHandle} />

        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={Colors.dark.textSecondary} />
          </Pressable>
          <Text style={styles.headerTitle}>Pre-Session Intake</Text>
          <View style={{ width: 38 }} />
        </View>

        <StepIndicator current={stepIndex} total={totalSteps} />

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Footer nav */}
        <View style={styles.footer}>
          {stepIndex > 0 ? (
            <Pressable style={styles.backBtn} onPress={handleBack}>
              <Ionicons name="arrow-back" size={18} color={Colors.dark.textSecondary} />
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          <View style={styles.footerRight}>
            <Pressable
              style={styles.saveOnlyBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleFinish(true);
              }}
              disabled={saveMutation.isPending}
            >
              <Text style={styles.saveOnlyBtnText}>Skip AI</Text>
            </Pressable>

            <Pressable
              style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
              onPress={() => handleNext(false)}
              disabled={!canProceed() || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.nextBtnText}>
                    {isLastStep ? "Start AI Chat" : "Next"}
                  </Text>
                  <Ionicons
                    name={isLastStep ? "chatbubble-ellipses-outline" : "arrow-forward"}
                    size={16}
                    color="#fff"
                  />
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundCard,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "92%",
    minHeight: "60%",
    paddingTop: Spacing.sm,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    alignSelf: "center",
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  closeBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndicatorRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: Spacing.md,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepDotDone: {
    backgroundColor: Colors.dark.primary,
  },
  stepDotActive: {
    backgroundColor: Colors.dark.primary,
    width: 20,
  },
  stepDotInactive: {
    backgroundColor: Colors.dark.border,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  chipSelected: {
    backgroundColor: Colors.dark.primary + "38",
    borderColor: Colors.dark.primary,
  },
  chipText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  chipTextSelected: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  intensityRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: Spacing.xs,
  },
  intensityCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
    gap: 8,
  },
  intensityCardSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "22",
  },
  intensityLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  intensityLabelSelected: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  dynamicsSection: {
    marginBottom: Spacing.md,
  },
  dynamicsLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  pillarSection: {
    marginBottom: Spacing.md,
  },
  pillarLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  highlightRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: Spacing.xs,
  },
  highlightCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
    gap: 4,
  },
  highlightLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "500",
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    gap: 12,
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.md,
  },
  backBtnText: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: 6,
    minWidth: 120,
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  saveOnlyBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveOnlyBtnText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
});
