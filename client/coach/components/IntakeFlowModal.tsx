import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Animated,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import { useSkillTaxonomy } from "@/hooks/useSkillTaxonomy";
import QuickBaselineDrawer from "./QuickBaselineDrawer";
import { DeepAssessmentDrawer } from "./DeepAssessmentDrawer";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerEntry {
  id: string;
  name: string;
  ballLevel?: string | null;
  /** Attendance status from the session (present/late/absent/no_show/etc.) */
  attendanceStatus?: string;
}

export interface LessonStructure {
  warmup: string[];
  kernA: string[];
  kernB: string[];
  matchPlay: boolean | null;
  intensity: string;
}

export interface IntakeResult {
  lessonStructure?: LessonStructure;
  trainedSkills: string[];
  intensity: string;
  groupDynamics?: Record<string, string>;
  playerData: {
    playerId: string;
    /** Attendance status captured at session end (present/late/absent/no_show/etc.) */
    attendanceStatus?: string;
    playerTags?: string[];
    pillarRatings?: Record<string, string>;
    highlight?: string;
    privateNote?: string;
  }[];
  quickAssessmentCompleted?: boolean;
  /** True when the coach saved scores in the Deep Assessment Drawer during this intake flow. */
  deepAssessmentCompleted?: boolean;
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

const WARMUP_CHIPS = [
  { value: "footwork", label: "Footwork" },
  { value: "rally_warmup", label: "Rally warm-up" },
  { value: "games", label: "Games" },
  { value: "custom_warmup", label: "Custom" },
];

const KERN_A_CHIPS = [
  { value: "forehand", label: "Forehand" },
  { value: "backhand", label: "Backhand" },
  { value: "serve", label: "Serve" },
  { value: "return", label: "Return" },
  { value: "volley", label: "Volley" },
  { value: "custom_kern_a", label: "Custom" },
];

const KERN_B_CHIPS = [
  { value: "cross_court", label: "Cross-court" },
  { value: "net_play", label: "Net play" },
  { value: "rally_patterns", label: "Rally patterns" },
  { value: "match_play_situations", label: "Match-play situations" },
  { value: "custom_kern_b", label: "Custom" },
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
  privateNote: string;
}

// ── Universal pillars (same for every player level) ───────────────────────────

const UNIVERSAL_PILLAR_OPTIONS: {
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

const SKILL_RATING_OPTIONS = [
  { value: "needs_attention", label: "Needs Attention" },
  { value: "developing", label: "Developing" },
  { value: "good", label: "Good" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.stepIndicatorRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i < current
              ? styles.stepDotDone
              : i === current
              ? styles.stepDotActive
              : styles.stepDotInactive,
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

function PlayerReviewCard({
  player,
  state,
  updatePlayerState,
}: {
  player: PlayerEntry;
  state: PlayerState;
  updatePlayerState: (patch: Partial<PlayerState>) => void;
}) {
  const { techniqueSkills, tacticalSkills } = useSkillTaxonomy(player.ballLevel);

  const handleRating = (field: string, value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updatePlayerState({
      pillarRatings: {
        ...state.pillarRatings,
        [field]: state.pillarRatings[field] === value ? "" : value,
      },
    });
  };

  return (
    <View>
      <Text style={styles.stepTitle}>{player.name}</Text>
      <Text style={styles.stepSubtitle}>Session review — combine tags, ratings, and a note</Text>

      {/* Behavior tags */}
      <Text style={styles.pillarLabel}>Behavior</Text>
      <Text style={[styles.stepSubtitle, { marginTop: -Spacing.xs, marginBottom: Spacing.sm }]}>
        Select all that apply
      </Text>
      <ChipRow
        options={PLAYER_TAGS}
        selected={state.playerTags}
        onToggle={(v) =>
          updatePlayerState({
            playerTags: state.playerTags.includes(v)
              ? state.playerTags.filter((t) => t !== v)
              : [...state.playerTags, v],
          })
        }
        multi
      />

      {/* Universal pillars */}
      <Text style={[styles.pillarLabel, { marginTop: Spacing.lg }]}>Effort / Physical / Mental</Text>
      {UNIVERSAL_PILLAR_OPTIONS.map((cfg) => (
        <View key={cfg.field} style={styles.pillarSection}>
          <Text style={styles.pillarSubLabel}>{cfg.label}</Text>
          <ChipRow
            options={cfg.options}
            selected={state.pillarRatings[cfg.field] ?? ""}
            onToggle={(v) => handleRating(cfg.field, v)}
          />
        </View>
      ))}

      {/* Level-specific Technique skills */}
      {techniqueSkills.length > 0 ? (
        <View style={styles.pillarSection}>
          <Text style={styles.pillarLabel}>Technique</Text>
          <Text style={styles.taxonomyHint}>Rate the specific skills you worked on</Text>
          {techniqueSkills.map((skill) => (
            <View key={skill.id} style={styles.taxonomyRow}>
              <Text style={styles.taxonomySkillLabel}>{skill.label}</Text>
              <ChipRow
                options={SKILL_RATING_OPTIONS}
                selected={state.pillarRatings[skill.id] ?? ""}
                onToggle={(v) => handleRating(skill.id, v)}
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.pillarSection}>
          <Text style={styles.pillarLabel}>Technique</Text>
          <ChipRow
            options={SKILL_RATING_OPTIONS}
            selected={state.pillarRatings["technique"] ?? ""}
            onToggle={(v) => handleRating("technique", v)}
          />
        </View>
      )}

      {/* Level-specific Tactical skills */}
      {tacticalSkills.length > 0 ? (
        <View style={styles.pillarSection}>
          <Text style={styles.pillarLabel}>Tactical</Text>
          <Text style={styles.taxonomyHint}>Rate the specific skills you worked on</Text>
          {tacticalSkills.map((skill) => (
            <View key={skill.id} style={styles.taxonomyRow}>
              <Text style={styles.taxonomySkillLabel}>{skill.label}</Text>
              <ChipRow
                options={SKILL_RATING_OPTIONS}
                selected={state.pillarRatings[skill.id] ?? ""}
                onToggle={(v) => handleRating(skill.id, v)}
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.pillarSection}>
          <Text style={styles.pillarLabel}>Tactical</Text>
          <ChipRow
            options={SKILL_RATING_OPTIONS}
            selected={state.pillarRatings["tactical"] ?? ""}
            onToggle={(v) => handleRating("tactical", v)}
          />
        </View>
      )}

      {/* Session Highlight */}
      <Text style={[styles.pillarLabel, { marginTop: Spacing.lg }]}>Session Highlight</Text>
      <View style={styles.highlightRow}>
        {HIGHLIGHT_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[
              styles.highlightCard,
              state.highlight === opt.value && {
                borderColor: opt.color,
                backgroundColor: opt.color + "18",
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updatePlayerState({
                highlight: state.highlight === opt.value ? undefined : opt.value,
              });
            }}
          >
            <Ionicons
              name={opt.icon}
              size={16}
              color={state.highlight === opt.value ? opt.color : Colors.dark.textMuted}
            />
            <Text
              style={[
                styles.highlightLabel,
                state.highlight === opt.value && { color: opt.color },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Private note */}
      <Text style={[styles.pillarLabel, { marginTop: Spacing.lg }]}>Private Note</Text>
      <Text style={styles.taxonomyHint}>Coach-only — not shared with player</Text>
      <TextInput
        style={styles.privateNoteInput}
        placeholder="e.g. Struggled with serve toss under pressure — revisit next session..."
        placeholderTextColor={Colors.dark.textMuted}
        multiline
        numberOfLines={3}
        value={state.privateNote}
        onChangeText={(text) => updatePlayerState({ privateNote: text })}
      />
    </View>
  );
}

// ── Assessment offer screens ──────────────────────────────────────────────────

function AssessmentOfferScreen({
  title,
  description,
  icon,
  iconColor,
  onRun,
  onSkip,
}: {
  title: string;
  description: string;
  icon: IoniconsName;
  iconColor: string;
  onRun: () => void;
  onSkip: () => void;
}) {
  return (
    <View style={styles.offerContainer}>
      <View style={[styles.offerIconCircle, { backgroundColor: iconColor + "20" }]}>
        <Ionicons name={icon} size={40} color={iconColor} />
      </View>
      <Text style={styles.offerTitle}>{title}</Text>
      <Text style={styles.offerDescription}>{description}</Text>

      <Pressable
        style={[styles.offerRunBtn, { backgroundColor: iconColor }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onRun();
        }}
      >
        <Ionicons name={icon} size={18} color={Colors.dark.buttonText} />
        <Text style={styles.offerRunBtnText}>Run Now</Text>
      </Pressable>

      <Pressable style={styles.offerSkipBtn} onPress={onSkip}>
        <Text style={styles.offerSkipBtnText}>Skip for now</Text>
      </Pressable>
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
  const queryClient = useQueryClient();
  const isGroup = sessionType === "group" || sessionType === "semi_private";
  const slideAnim = useRef(new Animated.Value(1)).current;

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

  // ── Step definitions ────────────────────────────────────────────────────────

  const playerCount = players.length;

  type StepId =
    | { type: "lesson_structure" }
    | { type: "group_dynamics" }
    | { type: "player_review"; playerIdx: number }
    | { type: "quick_assessment_offer" }
    | { type: "deep_assessment_offer" };

  const buildSteps = (): StepId[] => {
    const steps: StepId[] = [{ type: "lesson_structure" }];
    if (isGroup) {
      steps.push({ type: "group_dynamics" });
    }
    for (let i = 0; i < playerCount; i++) {
      steps.push({ type: "player_review", playerIdx: i });
    }
    steps.push({ type: "quick_assessment_offer" });
    steps.push({ type: "deep_assessment_offer" });
    return steps;
  };

  const steps = buildSteps();
  const totalSteps = steps.length;

  // ── State ──────────────────────────────────────────────────────────────────

  const [stepIndex, setStepIndex] = useState(0);

  // Lesson structure
  const [warmup, setWarmup] = useState<string[]>([]);
  const [kernA, setKernA] = useState<string[]>([]);
  const [kernB, setKernB] = useState<string[]>([]);
  const [matchPlay, setMatchPlay] = useState<boolean | null>(null);
  const [intensity, setIntensity] = useState<string>("");

  // Group dynamics
  const [groupDynamics, setGroupDynamics] = useState<GroupDynamicsState>({});

  // Per-player
  const [playerStates, setPlayerStates] = useState<PlayerState[]>(
    players.map(() => ({ playerTags: [], pillarRatings: {}, privateNote: "" })),
  );

  // Assessment completion tracking
  const [quickAssessmentCompleted, setQuickAssessmentCompleted] = useState(false);
  const [deepAssessmentCompleted, setDeepAssessmentCompleted] = useState(false);

  // Assessment drawer state
  const [assessmentPlayer, setAssessmentPlayer] = useState<PlayerEntry | null>(null);
  const [showQuickAssessment, setShowQuickAssessment] = useState(false);
  const [showDeepAssessment, setShowDeepAssessment] = useState(false);

  // ── Mutations ─────────────────────────────────────────────────────────────

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
      players.forEach((player) => {
        queryClient.invalidateQueries({
          queryKey: [`/api/sessions/${sessionId}/players/${player.id}/ai-chat/context`],
        });
        AsyncStorage.removeItem(`ai-chat-draft-${sessionId}-${player.id}`).catch(() => {});
      });
      if (!wasSaveOnly) {
        onClose();
        onComplete(data);
      } else {
        onSaveOnly?.();
        onClose();
      }
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  const currentStep = steps[stepIndex];

  const updatePlayerState = useCallback((idx: number, patch: Partial<PlayerState>) => {
    setPlayerStates((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  const buildResult = (): IntakeResult => {
    const lessonStructure: LessonStructure = {
      warmup,
      kernA,
      kernB,
      matchPlay,
      intensity,
    };

    const trainedSkills = [
      ...warmup,
      ...kernA,
      ...kernB,
      ...(matchPlay ? ["match_play"] : []),
    ];

    return {
      lessonStructure,
      trainedSkills,
      intensity,
      groupDynamics:
        isGroup && Object.keys(groupDynamics).length > 0
          ? (groupDynamics as Record<string, string>)
          : undefined,
      playerData: players.map((p, i) => ({
        playerId: p.id,
        // Attendance snapshot — carries the status the coach marked before ending the session
        attendanceStatus: p.attendanceStatus || undefined,
        playerTags: playerStates[i].playerTags.length > 0 ? playerStates[i].playerTags : undefined,
        pillarRatings:
          Object.keys(playerStates[i].pillarRatings).length > 0
            ? playerStates[i].pillarRatings
            : undefined,
        highlight: playerStates[i].highlight,
        privateNote: playerStates[i].privateNote || undefined,
      })),
      quickAssessmentCompleted,
      deepAssessmentCompleted: deepAssessmentCompleted || undefined,
    };
  };

  const handleFinish = (saveOnly = false) => {
    const result = buildResult();
    saveMutation.mutate({ data: result, saveOnly });
  };

  const handleNext = (saveOnly = false) => {
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

  // ── Step renderers ────────────────────────────────────────────────────────

  const renderStep = () => {
    if (!currentStep) return null;

    // ── Lesson Structure ──
    if (currentStep.type === "lesson_structure") {
      return (
        <View>
          <Text style={styles.stepTitle}>What did you cover?</Text>
          <Text style={styles.stepSubtitle}>
            Tap to describe the session structure. Each block is optional.
          </Text>

          {/* Warm-up */}
          <View style={styles.lessonBlock}>
            <View style={styles.lessonBlockHeader}>
              <View style={[styles.lessonBlockDot, { backgroundColor: "#10B981" }]} />
              <Text style={styles.lessonBlockTitle}>Warm-up</Text>
            </View>
            <ChipRow
              options={WARMUP_CHIPS}
              selected={warmup}
              onToggle={(v) =>
                setWarmup((prev) =>
                  prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
                )
              }
              multi
            />
          </View>

          {/* Kern A — Technical */}
          <View style={styles.lessonBlock}>
            <View style={styles.lessonBlockHeader}>
              <View style={[styles.lessonBlockDot, { backgroundColor: Colors.dark.primary }]} />
              <Text style={styles.lessonBlockTitle}>Kern A — Technical focus</Text>
            </View>
            <ChipRow
              options={KERN_A_CHIPS}
              selected={kernA}
              onToggle={(v) =>
                setKernA((prev) =>
                  prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
                )
              }
              multi
            />
          </View>

          {/* Kern B — Tactical */}
          <View style={styles.lessonBlock}>
            <View style={styles.lessonBlockHeader}>
              <View style={[styles.lessonBlockDot, { backgroundColor: "#F59E0B" }]} />
              <Text style={styles.lessonBlockTitle}>Kern B — Tactical focus</Text>
            </View>
            <ChipRow
              options={KERN_B_CHIPS}
              selected={kernB}
              onToggle={(v) =>
                setKernB((prev) =>
                  prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
                )
              }
              multi
            />
          </View>

          {/* Match Play */}
          <View style={styles.lessonBlock}>
            <View style={styles.lessonBlockHeader}>
              <View style={[styles.lessonBlockDot, { backgroundColor: "#3B82F6" }]} />
              <Text style={styles.lessonBlockTitle}>Match Play</Text>
            </View>
            <View style={styles.matchPlayRow}>
              {[
                { label: "Yes", value: true, icon: "checkmark-circle-outline" as IoniconsName },
                { label: "No", value: false, icon: "close-circle-outline" as IoniconsName },
              ].map((opt) => (
                <Pressable
                  key={opt.label}
                  style={[
                    styles.matchPlayBtn,
                    matchPlay === opt.value && styles.matchPlayBtnSelected,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMatchPlay((prev) => (prev === opt.value ? null : opt.value));
                  }}
                >
                  <Ionicons
                    name={opt.icon}
                    size={18}
                    color={
                      matchPlay === opt.value ? Colors.dark.primary : Colors.dark.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.matchPlayBtnText,
                      matchPlay === opt.value && styles.matchPlayBtnTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Intensity */}
          <View style={styles.lessonBlock}>
            <View style={styles.lessonBlockHeader}>
              <View style={[styles.lessonBlockDot, { backgroundColor: Colors.dark.orange }]} />
              <Text style={styles.lessonBlockTitle}>Intensity</Text>
            </View>
            <View style={styles.intensityRow}>
              {INTENSITY_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.intensityCard,
                    intensity === opt.value && styles.intensityCardSelected,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setIntensity(opt.value);
                  }}
                >
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={
                      intensity === opt.value ? Colors.dark.primary : Colors.dark.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.intensityLabel,
                      intensity === opt.value && styles.intensityLabelSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      );
    }

    // ── Group Dynamics ──
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

    // ── Per-player Review (merged tags + ratings) ──
    if (currentStep.type === "player_review") {
      const pi = currentStep.playerIdx;
      const player = players[pi];
      const state = playerStates[pi];
      return (
        <PlayerReviewCard
          player={player}
          state={state}
          updatePlayerState={(patch) => updatePlayerState(pi, patch)}
        />
      );
    }

    // ── Quick Assessment Offer ──
    if (currentStep.type === "quick_assessment_offer") {
      // If already completed (coach went Back then forward), show a success confirmation.
      // Footer is shown normally (isAssessmentOfferStep excludes this completed case) so
      // the coach can advance with Next or Start AI Chat.
      if (quickAssessmentCompleted) {
        return (
          <View style={styles.offerContainer}>
            <View style={[styles.offerIconCircle, { backgroundColor: Colors.dark.primary + "20" }]}>
              <Ionicons name="checkmark-circle" size={40} color={Colors.dark.primary} />
            </View>
            <Text style={styles.offerTitle}>Quick Assessment Done</Text>
            <Text style={styles.offerDescription}>
              Results captured and added to the AI context. Tap Next to continue.
            </Text>
          </View>
        );
      }
      return (
        <AssessmentOfferScreen
          title="Run Quick Assessment?"
          description="Run a quick baseline assessment to capture player level and skill snapshot. Results feed directly into the AI Coach context."
          icon="analytics-outline"
          iconColor={Colors.dark.primary}
          onRun={() => {
            const firstPlayer = players[0] ?? null;
            setAssessmentPlayer(firstPlayer);
            setShowQuickAssessment(true);
          }}
          onSkip={() => handleNext()}
        />
      );
    }

    // ── Deep Assessment Offer ──
    if (currentStep.type === "deep_assessment_offer") {
      return (
        <AssessmentOfferScreen
          title="Run Deep Assessment?"
          description="Complete a thorough skill-by-skill assessment across all pillars. This gives the AI Coach detailed context for targeted recommendations."
          icon="clipboard-outline"
          iconColor={Colors.dark.xpCyan}
          onRun={() => {
            const firstPlayer = players[0] ?? null;
            setAssessmentPlayer(firstPlayer);
            setShowDeepAssessment(true);
          }}
          onSkip={() => handleNext()}
        />
      );
    }

    return null;
  };

  const isLastStep = stepIndex === totalSteps - 1;
  // Hide normal footer only when the offer screen itself is visible (Run/Skip are inside the
  // offer component). When quick assessment is already completed and the coach navigated back,
  // show the normal footer so they can press Next/Start AI Chat.
  const isAssessmentOfferStep =
    (currentStep?.type === "quick_assessment_offer" && !quickAssessmentCompleted) ||
    currentStep?.type === "deep_assessment_offer";

  if (!visible) return null;

  const screenHeight = Dimensions.get("window").height;

  return (
    <View style={styles.overlay}>
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
          <Text style={styles.headerTitle}>Session Review</Text>
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

        {/* Footer nav — hidden on assessment offer screens (they have their own buttons) */}
        {!isAssessmentOfferStep && (
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
                style={styles.nextBtn}
                onPress={() => handleNext(false)}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <TennisBallSpinner size="small" color={Colors.dark.buttonText} />
                ) : (
                  <>
                    <Text style={styles.nextBtnText}>
                      {isLastStep ? "Start AI Chat" : "Next"}
                    </Text>
                    <Ionicons
                      name={
                        isLastStep ? "chatbubble-ellipses-outline" : "arrow-forward"
                      }
                      size={16}
                      color={Colors.dark.buttonText}
                    />
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* Assessment offer footer — back button only */}
        {isAssessmentOfferStep && (
          <View style={styles.footer}>
            {stepIndex > 0 ? (
              <Pressable style={styles.backBtn} onPress={handleBack}>
                <Ionicons name="arrow-back" size={18} color={Colors.dark.textSecondary} />
                <Text style={styles.backBtnText}>Back</Text>
              </Pressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}
          </View>
        )}
      </Animated.View>

      {/* Quick Baseline Drawer */}
      <QuickBaselineDrawer
        visible={showQuickAssessment}
        player={assessmentPlayer}
        onClose={() => {
          setShowQuickAssessment(false);
          setAssessmentPlayer(null);
        }}
        onComplete={() => {
          setShowQuickAssessment(false);
          setAssessmentPlayer(null);
          setQuickAssessmentCompleted(true);
          // Auto-advance past the offer step so the coach is never stranded
          setStepIndex((s) => Math.min(s + 1, totalSteps - 1));
        }}
      />

      {/* Deep Assessment Drawer — onSaved fires only when scores are successfully submitted */}
      <DeepAssessmentDrawer
        visible={showDeepAssessment}
        player={assessmentPlayer}
        onClose={() => {
          setShowDeepAssessment(false);
          setAssessmentPlayer(null);
        }}
        onSaved={() => {
          setShowDeepAssessment(false);
          setAssessmentPlayer(null);
          setDeepAssessmentCompleted(true);
          // Auto-advance past the deep-assessment step so the coach isn't stranded
          setStepIndex((s) => Math.min(s + 1, totalSteps - 1));
        }}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "flex-end",
    zIndex: 999,
  },
  sheet: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
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
  // Lesson structure
  lessonBlock: {
    marginBottom: Spacing.lg,
  },
  lessonBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: Spacing.sm,
  },
  lessonBlockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  lessonBlockTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  matchPlayRow: {
    flexDirection: "row",
    gap: 10,
  },
  matchPlayBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  matchPlayBtnSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "22",
  },
  matchPlayBtnText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  matchPlayBtnTextSelected: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  // Chip
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
  // Intensity
  intensityRow: {
    flexDirection: "row",
    gap: 10,
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
  // Group dynamics
  dynamicsSection: {
    marginBottom: Spacing.md,
  },
  dynamicsLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  // Pillar ratings
  pillarSection: {
    marginBottom: Spacing.md,
  },
  pillarLabel: {
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  pillarSubLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  taxonomyHint: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    fontStyle: "italic",
  },
  taxonomyRow: {
    marginBottom: Spacing.sm,
  },
  taxonomySkillLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
    marginBottom: 4,
  },
  // Highlight
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
  // Private note
  privateNoteInput: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 13,
    backgroundColor: Colors.dark.backgroundSecondary,
    minHeight: 80,
    textAlignVertical: "top",
  },
  // Assessment offer
  offerContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  offerIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  offerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  offerDescription: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: Spacing.lg,
  },
  offerRunBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
    minWidth: 180,
  },
  offerRunBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  offerSkipBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  offerSkipBtnText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  // Footer
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
  nextBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
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
