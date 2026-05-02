/**
 * Task #1531 / #1549 — GlowLevelAssessment
 *
 * Self-assessment wizard modal for players.
 * ~18 questions grouped by category → branching score → suggested Glow Rank (3–9).
 *
 * Task #1549 changes:
 * - Expanded question set: forehand, backhand, serve, volley, return, overhead,
 *   movement, mental, match experience (~18 questions total)
 * - Self-assessment result is capped at rank 3 (client + server enforced)
 * - Players who have attended at least one lesson see a locked intro:
 *   the coach manages their rank from that point onwards
 * - Intro copy updated; result screen shows upgrade path banner at rank 3
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutUp,
  FadeIn,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Colors,
  Spacing,
  BorderRadius,
  GlowColors,
  TextColors,
} from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Option {
  id: string;
  label: string;
  points: number;
}

interface Question {
  id: string;
  category: string;
  question: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  options: Option[];
}

interface AssessmentResult {
  suggestedRank: number;
  rankName: string;
  color: string;
  description: string;
  applied: boolean;
  currentRank: number;
  cappedByPolicy?: boolean;
}

interface GlowLevelAssessmentProps {
  visible: boolean;
  onClose: () => void;
  onComplete?: (rank: number, rankName: string) => void;
}

// ─── Questions ───────────────────────────────────────────────────────────────
// ~18 questions across 9 categories.
// Max points per category are balanced so no single category dominates.
// Total max ≈ 90 points → maps to rank 3–9 via scoreToRank().
const QUESTIONS: Question[] = [
  // ── FOREHAND ──────────────────────────────────────────────────────────────
  {
    id: "fh_technique",
    category: "Forehand",
    question: "How would you describe your forehand technique?",
    icon: "tennisball-outline",
    options: [
      { id: "fh_t0", label: "Still developing a consistent swing", points: 0 },
      { id: "fh_t1", label: "Solid flat forehand, learning topspin", points: 3 },
      { id: "fh_t2", label: "Good topspin with reliable depth", points: 6 },
      { id: "fh_t3", label: "Heavy topspin and slice — weapon under pressure", points: 9 },
    ],
  },
  {
    id: "fh_consistency",
    category: "Forehand",
    question: "Cross-court forehand rally: how many shots in a row?",
    icon: "repeat-outline",
    options: [
      { id: "fh_c0", label: "Under 5 shots reliably", points: 0 },
      { id: "fh_c1", label: "5–15 shots on a good day", points: 3 },
      { id: "fh_c2", label: "15–30 shots consistently", points: 6 },
      { id: "fh_c3", label: "50+ — no problem", points: 9 },
    ],
  },
  // ── BACKHAND ──────────────────────────────────────────────────────────────
  {
    id: "bh_technique",
    category: "Backhand",
    question: "Which describes your backhand best?",
    icon: "swap-horizontal-outline",
    options: [
      { id: "bh_t0", label: "Still building a consistent backhand", points: 0 },
      { id: "bh_t1", label: "Two-handed or one-handed — reliable flat/slice", points: 3 },
      { id: "bh_t2", label: "Good topspin backhand — direction control", points: 6 },
      { id: "bh_t3", label: "Backhand is a weapon — drive, slice, and drop shot", points: 9 },
    ],
  },
  {
    id: "bh_consistency",
    category: "Backhand",
    question: "How consistent is your backhand cross-court?",
    icon: "checkmark-circle-outline",
    options: [
      { id: "bh_c0", label: "Less than 5 balls before an error", points: 0 },
      { id: "bh_c1", label: "Around 5–10 reliable balls", points: 3 },
      { id: "bh_c2", label: "10–25 shots with control", points: 6 },
      { id: "bh_c3", label: "I rarely miss — can sustain 30+ shots", points: 9 },
    ],
  },
  // ── SERVE ─────────────────────────────────────────────────────────────────
  {
    id: "srv_placement",
    category: "Serve",
    question: "How would you describe your first serve?",
    icon: "radio-button-on-outline",
    options: [
      { id: "srv_p0", label: "Still learning to get it in consistently", points: 0 },
      { id: "srv_p1", label: "Reliable first serve — mostly flat", points: 3 },
      { id: "srv_p2", label: "Consistent pace, starting to target corners", points: 6 },
      { id: "srv_p3", label: "Strong weapon — placement, kick, and slice", points: 9 },
    ],
  },
  {
    id: "srv_second",
    category: "Serve",
    question: "How reliable is your second serve under pressure?",
    icon: "shield-outline",
    options: [
      { id: "srv_s0", label: "I double fault often under pressure", points: 0 },
      { id: "srv_s1", label: "I get it in but it's soft — attackable", points: 2 },
      { id: "srv_s2", label: "Consistent kick or slice — hard to attack", points: 5 },
      { id: "srv_s3", label: "My second serve is nearly as dangerous as my first", points: 8 },
    ],
  },
  // ── VOLLEY ────────────────────────────────────────────────────────────────
  {
    id: "vol_net",
    category: "Volley",
    question: "Describe your net game / volley confidence:",
    icon: "git-network-outline",
    options: [
      { id: "vol_n0", label: "I avoid the net — not comfortable there", points: 0 },
      { id: "vol_n1", label: "I can put easy volleys away", points: 2 },
      { id: "vol_n2", label: "Good volley technique — consistent finishing", points: 5 },
      { id: "vol_n3", label: "Strong net game — read play and intercept well", points: 8 },
    ],
  },
  // ── RETURN ────────────────────────────────────────────────────────────────
  {
    id: "ret_return",
    category: "Return",
    question: "How do you handle your opponent's serve?",
    icon: "arrow-undo-outline",
    options: [
      { id: "ret_r0", label: "I struggle to return consistently", points: 0 },
      { id: "ret_r1", label: "I block it back — mostly defensive", points: 2 },
      { id: "ret_r2", label: "I return with direction and can attack weak serves", points: 5 },
      { id: "ret_r3", label: "Return is a weapon — I take the initiative on serve games", points: 8 },
    ],
  },
  // ── OVERHEAD ──────────────────────────────────────────────────────────────
  {
    id: "ovh_confidence",
    category: "Overhead",
    question: "How do you handle an overhead smash situation?",
    icon: "arrow-up-circle-outline",
    options: [
      { id: "ovh_c0", label: "I often miss or avoid overheads", points: 0 },
      { id: "ovh_c1", label: "I can finish most overheads if set up well", points: 2 },
      { id: "ovh_c2", label: "Reliable overhead — I welcome the chance to finish", points: 5 },
      { id: "ovh_c3", label: "Overhead is a dominant weapon — I seek it out", points: 7 },
    ],
  },
  // ── MOVEMENT ──────────────────────────────────────────────────────────────
  {
    id: "mov_footwork",
    category: "Movement",
    question: "How is your footwork and court coverage?",
    icon: "footsteps-outline",
    options: [
      { id: "mov_f0", label: "I often get caught off guard and reach late", points: 0 },
      { id: "mov_f1", label: "I cover the basics — occasional struggle on wide balls", points: 2 },
      { id: "mov_f2", label: "Good split step and recovery — rarely out of position", points: 5 },
      { id: "mov_f3", label: "Athletic, fast recovery — I dictate position in rallies", points: 7 },
    ],
  },
  {
    id: "mov_fitness",
    category: "Movement",
    question: "How is your physical fitness for match play?",
    icon: "fitness-outline",
    options: [
      { id: "mov_fit0", label: "Short rallies tire me out noticeably", points: 0 },
      { id: "mov_fit1", label: "Fine for social play — struggle in long matches", points: 2 },
      { id: "mov_fit2", label: "Good for full match play — recover between points", points: 5 },
      { id: "mov_fit3", label: "Athletic — can play 3 sets at high pace", points: 7 },
    ],
  },
  // ── MENTAL ────────────────────────────────────────────────────────────────
  {
    id: "men_pressure",
    category: "Mental",
    question: "How do you perform under pressure points (break point, tiebreak)?",
    icon: "analytics-outline",
    options: [
      { id: "men_p0", label: "Nerves affect my game significantly", points: 0 },
      { id: "men_p1", label: "I manage but can get rattled at key moments", points: 2 },
      { id: "men_p2", label: "Mostly composed — I stay focused on my game plan", points: 4 },
      { id: "men_p3", label: "I thrive under pressure — clutch performer", points: 6 },
    ],
  },
  {
    id: "men_reset",
    category: "Mental",
    question: "How do you handle losing a set or a long losing streak in a match?",
    icon: "refresh-outline",
    options: [
      { id: "men_r0", label: "I often fall apart mentally — hard to come back", points: 0 },
      { id: "men_r1", label: "It takes effort to reset, but I try", points: 2 },
      { id: "men_r2", label: "I can shake it off and stay competitive", points: 4 },
      { id: "men_r3", label: "I stay calm, adapt my strategy, and often turn it around", points: 6 },
    ],
  },
  // ── TACTICS ───────────────────────────────────────────────────────────────
  {
    id: "tac_patterns",
    category: "Tactics",
    question: "How do you approach point construction?",
    icon: "bulb-outline",
    options: [
      { id: "tac_p0", label: "Just trying to keep the ball in play", points: 0 },
      { id: "tac_p1", label: "I know basic patterns — cross-court, down-the-line", points: 2 },
      { id: "tac_p2", label: "I use patterns, open the court, and change direction", points: 5 },
      { id: "tac_p3", label: "High-level tactical — read opponents and adjust in-match", points: 7 },
    ],
  },
  // ── MATCH EXPERIENCE ──────────────────────────────────────────────────────
  {
    id: "mxp_level",
    category: "Match Experience",
    question: "What level do you regularly compete at?",
    icon: "trophy-outline",
    options: [
      { id: "mxp_l0", label: "No competition yet — just practice", points: 0 },
      { id: "mxp_l1", label: "Friendly club matches or social tennis", points: 2 },
      { id: "mxp_l2", label: "Club league or local tournaments", points: 5 },
      { id: "mxp_l3", label: "Regional or national ranking", points: 8 },
    ],
  },
  {
    id: "mxp_experience",
    category: "Match Experience",
    question: "How long have you been playing tennis?",
    icon: "calendar-outline",
    options: [
      { id: "mxp_e0", label: "Just started (less than 6 months)", points: 0 },
      { id: "mxp_e1", label: "6 months – 2 years", points: 2 },
      { id: "mxp_e2", label: "2–5 years", points: 5 },
      { id: "mxp_e3", label: "5+ years", points: 8 },
    ],
  },
  {
    id: "mxp_wins",
    category: "Match Experience",
    question: "How often do you win competitive matches?",
    icon: "medal-outline",
    options: [
      { id: "mxp_w0", label: "Rarely — I mostly lose when playing competitively", points: 0 },
      { id: "mxp_w1", label: "About 25–40% of my matches", points: 2 },
      { id: "mxp_w2", label: "About 50–60% of the time", points: 5 },
      { id: "mxp_w3", label: "I win most matches at my level", points: 7 },
    ],
  },
];

// Max possible score across all questions
const MAX_SCORE = QUESTIONS.reduce(
  (sum, q) => sum + Math.max(...q.options.map((o) => o.points)),
  0,
);

// ─── Scoring: map total points → Glow Rank (9 = beginner, 1 = elite) ─────────
// Self-assessment is CAPPED at rank 3 — ranks 2 and 1 require coach/match data.
function scoreToRank(score: number): number {
  const pct = score / MAX_SCORE;
  let rank: number;
  if (pct < 0.07) rank = 9;
  else if (pct < 0.18) rank = 8;
  else if (pct < 0.32) rank = 7;
  else if (pct < 0.46) rank = 6;
  else if (pct < 0.58) rank = 5;
  else if (pct < 0.70) rank = 4;
  else rank = 3; // cap — never better than 3 for self-assessment
  return rank;
}

// ─── Rank meta (mirrors server side) ─────────────────────────────────────────
const RANK_META: Record<number, { name: string; color: string; description: string }> = {
  9: { name: "Absolute Beginner",  color: "#6B7280", description: "Just starting out — welcome to tennis!" },
  8: { name: "Beginner+",          color: "#10B981", description: "Getting comfortable with the basics." },
  7: { name: "Intermediate",       color: "#F59E0B", description: "Rallying consistently and learning tactics." },
  6: { name: "Competitive",        color: "#3B82F6", description: "Club play and local tournaments." },
  5: { name: "Performance",        color: "#8B5CF6", description: "Regional competition level." },
  4: { name: "Elite Performance",  color: "#EC4899", description: "High-level national competition." },
  3: { name: "Elite",              color: "#EF4444", description: "National ranking, elite circuit." },
  2: { name: "Performance Talent", color: "#F97316", description: "Pro pathway player." },
  1: { name: "Elite Semi-Pro",     color: "#FFD700", description: "Semi-professional competition." },
};

// Group question categories for progress display
const CATEGORIES = [...new Set(QUESTIONS.map((q) => q.category))];

// ─── Component ────────────────────────────────────────────────────────────────
export function GlowLevelAssessment({
  visible,
  onClose,
  onComplete,
}: GlowLevelAssessmentProps) {
  useThemeReactivity();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<"intro" | "questions" | "result">("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [applying, setApplying] = useState(false);

  // Check whether the player is blocked from self-assessment
  const { data: statusData, isLoading: statusLoading } = useQuery<{
    hasHadLessons: boolean;
    sessionCount: number;
  }>({
    queryKey: ["/api/player/me/glow-assessment-status"],
    enabled: visible,
    staleTime: 60_000,
  });
  const hasHadLessons = statusData?.hasHadLessons ?? false;

  const saveAssessment = useMutation({
    mutationFn: async (payload: {
      suggestedRank: number;
      applyRank: boolean;
      answers: Record<string, string>;
    }) => {
      const res = await apiRequest("POST", "/api/player/me/glow-assessment", payload);
      if (!res.ok) throw new Error("Failed to save assessment");
      return res.json() as Promise<AssessmentResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      setResult(data);
      setApplying(false);
    },
  });

  const totalScore = useMemo(() => {
    let score = 0;
    for (const q of QUESTIONS) {
      const answerId = answers[q.id];
      if (answerId) {
        const opt = q.options.find((o) => o.id === answerId);
        if (opt) score += opt.points;
      }
    }
    return score;
  }, [answers]);

  const suggestedRank = useMemo(() => scoreToRank(totalScore), [totalScore]);

  const handleSelectOption = useCallback(
    (questionId: string, optionId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    },
    [],
  );

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ((q) => q + 1);
    } else {
      const rank = scoreToRank(totalScore);
      const meta = RANK_META[rank];
      setResult({
        suggestedRank: rank,
        rankName: meta.name,
        color: meta.color,
        description: meta.description,
        applied: false,
        currentRank: rank,
      });
      setStep("result");
    }
  }, [currentQ, totalScore]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentQ > 0) {
      setCurrentQ((q) => q - 1);
    } else {
      setStep("intro");
    }
  }, [currentQ]);

  const handleApplyRank = useCallback(async () => {
    if (!result) return;
    setApplying(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const data = await saveAssessment.mutateAsync({
      suggestedRank: result.suggestedRank,
      applyRank: true,
      answers,
    });
    onComplete?.(data.suggestedRank, data.rankName);
  }, [result, answers, saveAssessment, onComplete]);

  const handleReset = useCallback(() => {
    setStep("intro");
    setCurrentQ(0);
    setAnswers({});
    setResult(null);
    setApplying(false);
  }, []);

  const handleClose = useCallback(() => {
    handleReset();
    onClose();
  }, [handleReset, onClose]);

  const q = QUESTIONS[currentQ];
  const hasAnswer = !!answers[q?.id];
  const progress = (currentQ + (hasAnswer ? 1 : 0)) / QUESTIONS.length;
  const currentCategory = q?.category ?? "";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "overFullScreen"}
      onRequestClose={handleClose}
    >
      <View
        style={[
          s.root,
          { paddingTop: Platform.OS === "android" ? insets.top + Spacing.md : Spacing.md },
        ]}
      >
        {/* ── INTRO ── */}
        {step === "intro" ? (
          <Animated.View entering={FadeInDown.duration(400)} style={s.flex}>
            <ScrollView
              contentContainerStyle={s.introContent}
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={handleClose} style={s.closeBtn} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
              </Pressable>

              <LinearGradient
                colors={["rgba(99,102,241,0.30)", "rgba(168,85,247,0.20)", "rgba(0,0,0,0)"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={s.introBadgeWrap}
              >
                <View style={s.introBadge}>
                  <Ionicons name="trophy" size={36} color={GlowColors.primary} />
                </View>
              </LinearGradient>

              <Text style={s.introTitle}>Discover Your Glow Level</Text>
              <Text style={s.introSub}>
                Answer {QUESTIONS.length} targeted questions about your game across{" "}
                {CATEGORIES.length} categories. We will suggest your starting Glow Rank.
              </Text>

              {statusLoading ? (
                <ActivityIndicator color={GlowColors.primary} style={{ marginTop: Spacing.lg }} />
              ) : hasHadLessons ? (
                // Locked state — coach manages rank after first lesson
                <View style={s.lockedCard}>
                  <View style={s.lockedIconRow}>
                    <Ionicons name="lock-closed" size={22} color="#818CF8" />
                  </View>
                  <Text style={s.lockedTitle}>Je coach beheert je level</Text>
                  <Text style={s.lockedBody}>
                    Omdat je al lessen hebt gehad, past je coach je Glow Level aan op
                    basis van wat ze zien op de baan — aangevuld met je wedstrijdresultaten.
                  </Text>
                  <View style={s.lockedInfoRow}>
                    <Ionicons name="information-circle-outline" size={14} color={Colors.dark.textMuted} />
                    <Text style={s.lockedInfoText}>
                      Zelf een self-assessment invullen is niet meer mogelijk na je eerste les.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={s.introPoints}>
                  {[
                    { icon: "time-outline" as const, text: `Takes about ${Math.ceil(QUESTIONS.length / 4)} minutes` },
                    { icon: "shield-checkmark-outline" as const, text: "No wrong answers — be honest" },
                    { icon: "information-circle-outline" as const, text: "Levels 2 en 1 worden bepaald door je coach en wedstrijdresultaten" },
                  ].map((p) => (
                    <View key={p.text} style={s.introPoint}>
                      <Ionicons name={p.icon} size={16} color={GlowColors.primary} />
                      <Text style={s.introPointText}>{p.text}</Text>
                    </View>
                  ))}

                  {/* Category overview pills */}
                  <View style={s.categoryRow}>
                    {CATEGORIES.map((cat) => (
                      <View key={cat} style={s.categoryPill}>
                        <Text style={s.categoryPillText}>{cat}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={[s.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
              {hasHadLessons ? (
                <Pressable style={s.ctaBtn} onPress={handleClose}>
                  <LinearGradient
                    colors={["#333", "#444"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.ctaGradient}
                  >
                    <Text style={s.ctaText}>Sluiten</Text>
                  </LinearGradient>
                </Pressable>
              ) : (
                <Pressable
                  style={[s.ctaBtn, statusLoading && s.ctaDisabled]}
                  onPress={() => {
                    if (statusLoading) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setStep("questions");
                    setCurrentQ(0);
                  }}
                  disabled={statusLoading}
                >
                  <LinearGradient
                    colors={["#6366F1", "#8B5CF6", "#A855F7"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.ctaGradient}
                  >
                    <Text style={s.ctaText}>Start Assessment</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </LinearGradient>
                </Pressable>
              )}
            </View>
          </Animated.View>
        ) : null}

        {/* ── QUESTIONS ── */}
        {step === "questions" ? (
          <View style={s.flex}>
            {/* Top bar */}
            <View style={s.qTopBar}>
              <Pressable onPress={handleBack} hitSlop={12} style={s.backBtn}>
                <Ionicons name="arrow-back" size={22} color={Colors.dark.textMuted} />
              </Pressable>
              <View style={s.progressWrap}>
                <View style={s.progressTrack}>
                  <Animated.View
                    style={[s.progressFill, { width: `${Math.round(progress * 100)}%` }]}
                  />
                </View>
                <Text style={s.progressLabel}>
                  {currentQ + 1} / {QUESTIONS.length} · {currentCategory}
                </Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={s.qContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Animated.View
                key={q.id}
                entering={FadeInDown.delay(80).duration(350)}
                exiting={FadeOutUp.duration(200)}
              >
                <View style={s.qIconRow}>
                  <View style={s.qIconBadge}>
                    <Ionicons name={q.icon} size={24} color={GlowColors.primary} />
                  </View>
                </View>
                <Text style={s.qText}>{q.question}</Text>

                <View style={s.optionsList}>
                  {q.options.map((opt) => {
                    const selected = answers[q.id] === opt.id;
                    return (
                      <Pressable
                        key={opt.id}
                        style={[s.option, selected && s.optionSelected]}
                        onPress={() => handleSelectOption(q.id, opt.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                      >
                        <View style={[s.optionRadio, selected && s.optionRadioSelected]}>
                          {selected ? (
                            <Ionicons name="checkmark" size={13} color="#fff" />
                          ) : null}
                        </View>
                        <Text style={[s.optionLabel, selected && s.optionLabelSelected]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>
            </ScrollView>

            <View style={[s.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <Pressable
                style={[s.ctaBtn, !hasAnswer && s.ctaDisabled]}
                onPress={handleNext}
                disabled={!hasAnswer}
              >
                <LinearGradient
                  colors={hasAnswer ? ["#6366F1", "#8B5CF6"] : ["#333", "#333"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.ctaGradient}
                >
                  <Text style={s.ctaText}>
                    {currentQ < QUESTIONS.length - 1 ? "Next" : "See My Result"}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* ── RESULT ── */}
        {step === "result" && result ? (
          <Animated.View entering={FadeIn.duration(500)} style={s.flex}>
            <ScrollView
              contentContainerStyle={s.resultContent}
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={handleClose} style={s.closeBtn} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
              </Pressable>

              <Text style={s.resultLabel}>YOUR SUGGESTED GLOW LEVEL</Text>

              {/* Rank badge */}
              <Animated.View entering={FadeInUp.delay(200).duration(600)} style={s.rankBadgeWrap}>
                <LinearGradient
                  colors={[result.color + "55", result.color + "22", "transparent"]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={s.rankGlow}
                >
                  <View style={[s.rankCircle, { borderColor: result.color }]}>
                    <Text style={[s.rankNumber, { color: result.color }]}>
                      {result.suggestedRank}
                    </Text>
                  </View>
                </LinearGradient>
                <Text style={[s.rankName, { color: result.color }]}>{result.rankName}</Text>
                <Text style={s.rankDesc}>{result.description}</Text>
              </Animated.View>

              {/* Rank 3 upgrade path banner — only shown when capped by policy */}
              {result.suggestedRank === 3 ? (
                <Animated.View entering={FadeInDown.delay(400).duration(400)} style={s.upgradeBanner}>
                  <View style={s.upgradeBannerIconRow}>
                    <Ionicons name="star-outline" size={18} color="#F97316" />
                    <Text style={s.upgradeBannerTitle}>Klaar voor rank 2 of 1?</Text>
                  </View>
                  <Text style={s.upgradeBannerBody}>
                    Hogere levels (rank 2 en 1) worden bepaald door je coach na observatie
                    op de baan, of via je wedstrijdresultaten. Speel wedstrijden of vraag
                    je coach om een beoordeling.
                  </Text>
                </Animated.View>
              ) : null}

              {/* Score summary */}
              <View style={s.scoreSummary}>
                <View style={s.scoreRow}>
                  <Text style={s.scoreLabel}>Questions answered</Text>
                  <Text style={s.scoreValue}>{Object.keys(answers).length}/{QUESTIONS.length}</Text>
                </View>
                <View style={s.scoreRow}>
                  <Text style={s.scoreLabel}>Score</Text>
                  <Text style={s.scoreValue}>{totalScore} / {MAX_SCORE}</Text>
                </View>
              </View>

              <Text style={s.applyHint}>
                Applying this rank updates your profile. Your coach can always adjust it
                based on what they see on court.
              </Text>
            </ScrollView>

            <View style={[s.resultFooter, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <Pressable style={s.retakeBtn} onPress={handleReset}>
                <Text style={s.retakeText}>Retake</Text>
              </Pressable>
              <Pressable
                style={[s.ctaBtn, s.ctaBtnFlex, applying && s.ctaDisabled]}
                onPress={handleApplyRank}
                disabled={applying}
              >
                <LinearGradient
                  colors={[result.color, result.color + "CC"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.ctaGradient}
                >
                  <Text style={s.ctaText}>
                    {applying ? "Saving..." : "Apply This Level"}
                  </Text>
                  {!applying ? (
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  ) : null}
                </LinearGradient>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = makeReactiveStyles(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    root: {
      flex: 1,
      backgroundColor: Colors.dark.backgroundRoot,
    },

    // ── Intro ──
    introContent: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.xl,
      paddingBottom: Spacing.xxl ?? 48,
      alignItems: "center",
    },
    closeBtn: {
      alignSelf: "flex-end",
      padding: Spacing.xs,
      marginBottom: Spacing.lg,
    },
    introBadgeWrap: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: Spacing.lg,
    },
    introBadge: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "rgba(99,102,241,0.15)",
      borderWidth: 1.5,
      borderColor: "rgba(99,102,241,0.35)",
      alignItems: "center",
      justifyContent: "center",
    },
    introTitle: {
      fontSize: 24,
      fontWeight: "800",
      color: Colors.dark.text,
      textAlign: "center",
      marginBottom: Spacing.sm,
    },
    introSub: {
      fontSize: 14,
      color: TextColors.secondary,
      textAlign: "center",
      lineHeight: 21,
      marginBottom: Spacing.xl,
    },
    introPoints: {
      width: "100%",
      gap: Spacing.md,
    },
    introPoint: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: Spacing.sm,
      backgroundColor: "rgba(99,102,241,0.07)",
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: "rgba(99,102,241,0.15)",
    },
    introPointText: {
      flex: 1,
      fontSize: 14,
      color: TextColors.secondary,
      fontWeight: "500",
      lineHeight: 20,
    },

    // Category pills in intro
    categoryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: Spacing.sm,
    },
    categoryPill: {
      backgroundColor: "rgba(99,102,241,0.12)",
      borderRadius: BorderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: "rgba(99,102,241,0.25)",
    },
    categoryPillText: {
      fontSize: 11,
      fontWeight: "600",
      color: "#818CF8",
    },

    // Locked state
    lockedCard: {
      width: "100%",
      backgroundColor: "rgba(99,102,241,0.08)",
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: "rgba(99,102,241,0.22)",
      padding: Spacing.lg,
      alignItems: "center",
      gap: Spacing.sm,
      marginTop: Spacing.sm,
    },
    lockedIconRow: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: "rgba(99,102,241,0.15)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: Spacing.xs,
    },
    lockedTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: Colors.dark.text,
      textAlign: "center",
    },
    lockedBody: {
      fontSize: 13,
      color: TextColors.secondary,
      textAlign: "center",
      lineHeight: 20,
    },
    lockedInfoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      marginTop: Spacing.xs,
      paddingHorizontal: Spacing.xs,
    },
    lockedInfoText: {
      flex: 1,
      fontSize: 11,
      color: Colors.dark.textMuted,
      lineHeight: 16,
    },

    // ── Footer / CTA ──
    footer: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
    },
    ctaBtn: {
      borderRadius: BorderRadius.lg,
      overflow: "hidden",
    },
    ctaBtnFlex: {
      flex: 1,
    },
    ctaDisabled: {
      opacity: 0.45,
    },
    ctaGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 15,
      borderRadius: BorderRadius.lg,
    },
    ctaText: {
      fontSize: 16,
      fontWeight: "800",
      color: "#fff",
    },

    // ── Questions ──
    qTopBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      gap: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: Colors.dark.border,
    },
    backBtn: {
      padding: 4,
    },
    progressWrap: {
      flex: 1,
      alignItems: "center",
      gap: 6,
    },
    progressTrack: {
      width: "100%",
      height: 4,
      backgroundColor: Colors.dark.chipBackgroundStrong,
      borderRadius: 2,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: GlowColors.primary,
      borderRadius: 2,
    },
    progressLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: Colors.dark.textMuted,
    },
    qContent: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.xl,
      paddingBottom: 24,
    },
    qIconRow: {
      alignItems: "center",
      marginBottom: Spacing.lg,
    },
    qIconBadge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: "rgba(99,102,241,0.12)",
      borderWidth: 1,
      borderColor: "rgba(99,102,241,0.25)",
      alignItems: "center",
      justifyContent: "center",
    },
    qText: {
      fontSize: 20,
      fontWeight: "700",
      color: Colors.dark.text,
      textAlign: "center",
      marginBottom: Spacing.xl,
      lineHeight: 28,
    },
    optionsList: {
      gap: Spacing.sm,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: 14,
      borderRadius: BorderRadius.md,
      borderWidth: 1.5,
      borderColor: Colors.dark.border,
      backgroundColor: "rgba(255,255,255,0.03)",
    },
    optionSelected: {
      borderColor: GlowColors.primary,
      backgroundColor: "rgba(99,102,241,0.10)",
    },
    optionRadio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: Colors.dark.textMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    optionRadioSelected: {
      borderColor: GlowColors.primary,
      backgroundColor: GlowColors.primary,
    },
    optionLabel: {
      flex: 1,
      fontSize: 14,
      color: TextColors.secondary,
      fontWeight: "500",
      lineHeight: 20,
    },
    optionLabelSelected: {
      color: Colors.dark.text,
      fontWeight: "700",
    },

    // ── Result ──
    resultContent: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.xl,
      paddingBottom: 24,
      alignItems: "center",
    },
    resultLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 2,
      color: Colors.dark.textMuted,
      marginBottom: Spacing.xl,
    },
    rankBadgeWrap: {
      alignItems: "center",
      gap: Spacing.md,
      marginBottom: Spacing.xl,
    },
    rankGlow: {
      width: 160,
      height: 160,
      borderRadius: 80,
      alignItems: "center",
      justifyContent: "center",
    },
    rankCircle: {
      width: 110,
      height: 110,
      borderRadius: 55,
      borderWidth: 3,
      backgroundColor: "rgba(0,0,0,0.4)",
      alignItems: "center",
      justifyContent: "center",
    },
    rankNumber: {
      fontSize: 52,
      fontWeight: "900",
      lineHeight: 60,
    },
    rankName: {
      fontSize: 22,
      fontWeight: "800",
      textAlign: "center",
    },
    rankDesc: {
      fontSize: 14,
      color: TextColors.secondary,
      textAlign: "center",
      lineHeight: 20,
      paddingHorizontal: Spacing.md,
    },

    // Rank 3 upgrade banner
    upgradeBanner: {
      width: "100%",
      backgroundColor: "rgba(249,115,22,0.10)",
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: "rgba(249,115,22,0.28)",
      padding: Spacing.md,
      marginBottom: Spacing.md,
      gap: Spacing.xs,
    },
    upgradeBannerIconRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    upgradeBannerTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: "#F97316",
    },
    upgradeBannerBody: {
      fontSize: 13,
      color: TextColors.secondary,
      lineHeight: 19,
    },

    scoreSummary: {
      width: "100%",
      gap: Spacing.sm,
      backgroundColor: "rgba(255,255,255,0.04)",
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      marginBottom: Spacing.md,
    },
    scoreRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    scoreLabel: {
      fontSize: 13,
      color: TextColors.muted,
    },
    scoreValue: {
      fontSize: 13,
      fontWeight: "700",
      color: Colors.dark.text,
    },
    applyHint: {
      fontSize: 12,
      color: TextColors.muted,
      textAlign: "center",
      lineHeight: 18,
      paddingHorizontal: Spacing.sm,
    },
    resultFooter: {
      flexDirection: "row",
      gap: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
    },
    retakeBtn: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: 15,
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: Colors.dark.border,
      alignItems: "center",
      justifyContent: "center",
    },
    retakeText: {
      fontSize: 15,
      fontWeight: "700",
      color: TextColors.secondary,
    },
  }),
);
