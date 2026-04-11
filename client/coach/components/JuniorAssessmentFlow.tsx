import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Colors,
  Backgrounds,
  Spacing,
  BorderRadius,
  FontSizes,
  GlowColors,
} from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";

const NEON_GREEN = "#C8FF3D";
const PASS_THRESHOLD = 85;

const JUNIOR_LEVEL_INFO: Record<string, { color: string; label: string; stage: string }> = {
  RED_3: { color: "#EF4444", label: "Red 3", stage: "RED" },
  RED_2: { color: "#EF4444", label: "Red 2", stage: "RED" },
  RED_1: { color: "#EF4444", label: "Red 1", stage: "RED" },
  ORANGE_3: { color: "#F97316", label: "Orange 3", stage: "ORANGE" },
  ORANGE_2: { color: "#F97316", label: "Orange 2", stage: "ORANGE" },
  ORANGE_1: { color: "#F97316", label: "Orange 1", stage: "ORANGE" },
  GREEN_2: { color: "#22C55E", label: "Green 2", stage: "GREEN" },
  GREEN_1: { color: "#22C55E", label: "Green 1", stage: "GREEN" },
};

const USTA_NEXT_LEVEL: Record<string, string> = {
  RED_3: "RED_2",
  RED_2: "RED_1",
  RED_1: "ORANGE_3",
  ORANGE_3: "ORANGE_2",
  ORANGE_2: "ORANGE_1",
  ORANGE_1: "GREEN_2",
  GREEN_2: "GREEN_1",
  GREEN_1: "GREEN_1",
};

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Baseline: "tennisball-outline",
  "Serve/Return": "swap-horizontal-outline",
  "Net Play": "git-network-outline",
  Transition: "move-outline",
  Game: "trophy-outline",
};

const CATEGORY_COLORS: Record<string, string> = {
  Baseline: "#4CAF50",
  "Serve/Return": "#2196F3",
  "Net Play": "#FF9800",
  Transition: "#9C27B0",
  Game: "#FFC107",
};

interface AssessmentItem {
  id: string;
  name: string;
  description: string | null;
  testType: string;
  metrics: {
    category: string;
    head_feet_hands: string;
    scoring_key: Record<string, string>;
    target_score: number;
  } | null;
}

interface LevelData {
  id: string;
  stage: string;
  tests: AssessmentItem[];
}

interface JuniorAssessmentFlowProps {
  visible: boolean;
  playerId: string;
  playerName: string;
  currentLevelId?: string | null;
  onClose: () => void;
  onAssessmentComplete: (result: AssessmentResult) => void;
}

export interface AssessmentResult {
  playerId: string;
  levelId: string;
  percentage: number;
  passed: boolean;
  categoryBreakdown: Record<string, { score: number; total: number; percentage: number }>;
  itemScores: Record<string, number>;
  assessedAt: string;
}

function ScoreButton({
  value,
  selected,
  label,
  color,
  onPress,
}: {
  value: number;
  selected: boolean;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.scoreBtn,
        selected && { backgroundColor: color, borderColor: color },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.scoreBtnNum, selected && { color: Colors.dark.backgroundRoot }]}>
        {value}
      </Text>
      <Text style={[styles.scoreBtnLabel, selected && { color: Colors.dark.backgroundRoot }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AssessmentItemRow({
  item,
  score,
  onScore,
  color,
}: {
  item: AssessmentItem;
  score?: number;
  onScore: (score: number) => void;
  color: string;
}) {
  const scoringKey = item.metrics?.scoring_key ?? { 1: "Beginning", 2: "Developing", 3: "Competent" };

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemHeaderRow}>
        <View style={[styles.hfhBadge, { backgroundColor: color + "20" }]}>
          <Text style={[styles.hfhText, { color }]}>{item.metrics?.head_feet_hands ?? ""}</Text>
        </View>
        <Text style={styles.itemName}>{item.name}</Text>
        {score !== undefined ? (
          <View style={[styles.scoreDot, { backgroundColor: color }]}>
            <Text style={styles.scoreDotText}>{score}</Text>
          </View>
        ) : null}
      </View>
      {item.description ? (
        <Text style={styles.itemDesc}>{item.description}</Text>
      ) : null}
      <View style={styles.scoreRow}>
        {[1, 2, 3].map((v) => (
          <ScoreButton
            key={v}
            value={v}
            selected={score === v}
            label={scoringKey[String(v)] ?? ""}
            color={color}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onScore(v);
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function JuniorAssessmentFlow({
  visible,
  playerId,
  playerName,
  currentLevelId,
  onClose,
  onAssessmentComplete,
}: JuniorAssessmentFlowProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"intro" | "scoring" | "result">("intro");
  const [selectedLevelId, setSelectedLevelId] = useState<string>(
    currentLevelId && JUNIOR_LEVEL_INFO[currentLevelId] ? currentLevelId : "RED_3"
  );
  const [itemScores, setItemScores] = useState<Record<string, number>>({});
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);

  const levelInfo = JUNIOR_LEVEL_INFO[selectedLevelId];

  const { data: levelData, isLoading } = useQuery<LevelData>({
    queryKey: ["/api/glow/levels", selectedLevelId],
    queryFn: async () => {
      const url = new URL(`/api/glow/levels/${selectedLevelId}`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch level");
      return res.json();
    },
    enabled: step === "scoring" && !!selectedLevelId,
  });

  const ustaItems = (levelData?.tests ?? []).filter(
    (t) => t.testType === "usta_assessment"
  );

  const groupedByCategory = useCallback(() => {
    const groups: Record<string, AssessmentItem[]> = {};
    for (const item of ustaItems) {
      const cat = item.metrics?.category ?? "General";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [ustaItems])();

  const totalItems = ustaItems.length;
  const scoredItems = Object.keys(itemScores).length;
  const allScored = totalItems > 0 && scoredItems === totalItems;

  const [isStartingTrial, setIsStartingTrial] = useState(false);
  const [trialStarted, setTrialStarted] = useState(false);

  const CATEGORY_COACHING_TIPS: Record<string, string[]> = {
    Baseline: [
      "Focus on consistent unit turns and early preparation on groundstrokes.",
      "Drill cross-court rallies using slow balls to build reliable ball tracking.",
    ],
    Serve: [
      "Work on the continental grip trophy position with tossing arm fully extended.",
      "Practice slow-motion serve rehearsal, pausing at the trophy phase before swinging.",
    ],
    "Net Play": [
      "Approach the net on short balls and practice punch volleys from inside the service box.",
      "Use shadow footwork drills to improve approach timing from baseline to net.",
    ],
    Transition: [
      "Practice split-step timing when the opponent strikes the ball.",
      "Drill recovery movement between shots to build court coverage habits.",
    ],
    "Game Play": [
      "Integrate trained skills into mini-match situations with simple win conditions.",
      "Work on serve-start patterns and keeping the ball in play during points.",
    ],
    Return: [
      "Practice short compact backswings on returns — reset position after each attempt.",
      "Focus on returning deep second serves to the opponent's backhand side.",
    ],
    "Match Play": [
      "Play 5-point games focusing on smart patterns rather than trying to win every point.",
      "Practice match-play routines: bouncing ball before serve, breathing between points.",
    ],
  };

  const generateFocusTips = (result: AssessmentResult): string[] => {
    const weak = Object.entries(result.categoryBreakdown)
      .filter(([, bd]) => bd.percentage < PASS_THRESHOLD)
      .sort(([, a], [, b]) => a.percentage - b.percentage)
      .slice(0, 3);

    if (weak.length === 0) {
      return ["Keep working on consistency across all areas to maintain your skill level."];
    }

    const tips: string[] = [];
    for (const [cat] of weak) {
      const catTips = CATEGORY_COACHING_TIPS[cat];
      if (catTips && catTips.length > 0) {
        tips.push(catTips[tips.length % catTips.length]);
      } else {
        tips.push(`Dedicate extra practice time to ${cat} drills to build consistency in this area.`);
      }
      if (tips.length >= 3) break;
    }

    return tips.slice(0, 3);
  };

  const buildEncodedTestResults = (result: AssessmentResult) => {
    const encoded: Record<string, {
      passed: boolean; score: number; notes: string;
      metrics: { ustaScore: number; assessedAt: string; assessmentPercentage: number };
    }> = {};
    for (const [testId, score] of Object.entries(result.itemScores)) {
      encoded[testId] = {
        passed: score >= 3,
        score,
        notes: `USTA 1–3 score: ${score} (${["", "Beginning", "Developing", "Competent"][score] ?? ""})`,
        metrics: {
          ustaScore: score,
          assessedAt: result.assessedAt,
          assessmentPercentage: result.percentage,
        },
      };
    }
    return encoded;
  };

  const calculateResult = (): AssessmentResult => {
    const categoryBreakdown: Record<string, { score: number; total: number; percentage: number }> = {};
    let totalScore = 0;
    let maxScore = 0;

    for (const item of ustaItems) {
      const cat = item.metrics?.category ?? "General";
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { score: 0, total: 0, percentage: 0 };
      }
      const s = itemScores[item.id] ?? 0;
      categoryBreakdown[cat].score += s;
      categoryBreakdown[cat].total += 3;
      totalScore += s;
      maxScore += 3;
    }

    for (const cat in categoryBreakdown) {
      const bd = categoryBreakdown[cat];
      bd.percentage = bd.total > 0 ? Math.round((bd.score / bd.total) * 100) : 0;
    }

    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const passed = percentage >= PASS_THRESHOLD;

    return {
      playerId,
      levelId: selectedLevelId,
      percentage,
      passed,
      categoryBreakdown,
      itemScores: { ...itemScores },
      assessedAt: new Date().toISOString(),
    };
  };

  const handleStartPromotionTrial = async () => {
    if (!assessmentResult || isStartingTrial) return;
    setIsStartingTrial(true);
    let trialId: string | null = null;
    try {
      const toLevelId = USTA_NEXT_LEVEL[assessmentResult.levelId] ?? assessmentResult.levelId;
      const createRes = await apiRequest("POST", `/api/glow/players/${playerId}/trials`, { toLevelId });
      const created = await createRes.json();
      trialId = created?.id ?? null;

      if (!trialId) {
        Alert.alert("Could Not Start Trial", "Unable to start the promotion trial. Please try again.");
        return;
      }

      const encodedTestResults = buildEncodedTestResults(assessmentResult);
      const failedWrites: string[] = [];
      for (const [testId, payload] of Object.entries(encodedTestResults)) {
        try {
          await apiRequest("POST", `/api/glow/trials/${trialId}/tests/${testId}`, payload);
        } catch {
          failedWrites.push(testId);
        }
      }

      if (failedWrites.length > 0) {
        try {
          await apiRequest("POST", `/api/glow/trials/${trialId}/complete`, {
            passed: false,
            evaluationNotes: "Cancelled: write errors during USTA assessment trial start",
          });
        } catch { }
        Alert.alert(
          "Partial Write Error",
          `${failedWrites.length} test result(s) could not be saved. The trial was not started. Please try again.`
        );
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/glow/players", playerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/glow/players", playerId, "trials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setTrialStarted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already has an active trial") || msg.includes("409")) {
        Alert.alert("Trial Already Active", "This player already has an active promotion trial in progress.");
      } else {
        Alert.alert("Could Not Start Trial", "Unable to start the promotion trial. Please try again.");
      }
    } finally {
      setIsStartingTrial(false);
    }
  };

  const handleFinishScoring = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const result = calculateResult();
    setAssessmentResult(result);
    setStep("result");
    onAssessmentComplete(result);
  };

  const handleReset = () => {
    setStep("intro");
    setItemScores({});
    setAssessmentResult(null);
    setTrialStarted(false);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundDefault, Colors.dark.backgroundRoot]}
          style={StyleSheet.absoluteFill}
        />

        {step === "intro" && (
          <>
            <View style={styles.header}>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={Colors.dark.textMuted} />
              </Pressable>
              <Text style={styles.headerTitle}>Junior Assessment</Text>
              <View style={{ width: 32 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.introBanner}>
                <Ionicons name="ribbon-outline" size={36} color={NEON_GREEN} />
                <Text style={styles.introTitle}>USTA Assessment</Text>
                <Text style={styles.introSubtitle}>{playerName}</Text>
                <Text style={styles.introDesc}>
                  Score each item 1–3 across all categories. A total of 85% or above is required to
                  initiate a promotion trial.
                </Text>
              </View>

              <View style={styles.tipCard}>
                <Ionicons name="bulb-outline" size={18} color={Colors.dark.gold} />
                <Text style={styles.tipText}>
                  Tennis Canada optimal challenge band: If a player scores below 50% on most items,
                  they may not be ready for assessment yet.
                </Text>
              </View>

              <Text style={styles.sectionLabel}>Select Level to Assess</Text>
              <View style={styles.levelGrid}>
                {Object.entries(JUNIOR_LEVEL_INFO).map(([id, info]) => {
                  const isSelected = selectedLevelId === id;
                  return (
                    <Pressable
                      key={id}
                      style={[
                        styles.levelCard,
                        isSelected && { borderColor: info.color, borderWidth: 2 },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedLevelId(id);
                        setItemScores({});
                      }}
                    >
                      <View style={[styles.levelDot, { backgroundColor: info.color }]} />
                      <Text style={styles.levelLabel}>{info.label}</Text>
                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={18} color={info.color} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ height: 24 }} />
            </ScrollView>

            <View style={styles.footer}>
              <Pressable style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setStep("scoring");
                }}
              >
                <LinearGradient
                  colors={[NEON_GREEN, "#A0D429"]}
                  style={styles.primaryBtnGradient}
                >
                  <Text style={[styles.primaryBtnText, { color: Colors.dark.backgroundRoot }]}>
                    Start Assessment
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.dark.backgroundRoot} />
                </LinearGradient>
              </Pressable>
            </View>
          </>
        )}

        {step === "scoring" && (
          <>
            <View style={styles.header}>
              <Pressable onPress={() => setStep("intro")} style={styles.closeBtn}>
                <Ionicons name="arrow-back" size={24} color={Colors.dark.textMuted} />
              </Pressable>
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>{levelInfo?.label ?? selectedLevelId}</Text>
                <Text style={styles.headerSub}>
                  {scoredItems}/{totalItems} scored
                </Text>
              </View>
              <View style={[styles.progressPill, { backgroundColor: levelInfo?.color + "30" }]}>
                <Text style={[styles.progressPillText, { color: levelInfo?.color }]}>
                  {totalItems > 0 ? Math.round((scoredItems / totalItems) * 100) : 0}%
                </Text>
              </View>
            </View>

            {isLoading ? (
              <View style={[styles.content, styles.centered]}>
                <ActivityIndicator size="large" color={NEON_GREEN} />
                <Text style={styles.loadingText}>Loading items...</Text>
              </View>
            ) : ustaItems.length === 0 ? (
              <View style={[styles.content, styles.centered]}>
                <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyText}>No USTA assessment items found for this level.</Text>
                <Text style={styles.emptySubText}>Make sure the USTA seed has been run.</Text>
              </View>
            ) : (
              <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {Object.entries(groupedByCategory).map(([category, items]) => {
                  const catColor = CATEGORY_COLORS[category] ?? levelInfo?.color ?? NEON_GREEN;
                  const catIcon = CATEGORY_ICONS[category] ?? "star-outline";
                  const catScored = items.filter((i) => itemScores[i.id] !== undefined).length;
                  return (
                    <View key={category} style={styles.categoryBlock}>
                      <View style={styles.categoryHeader}>
                        <View style={[styles.catIconWrap, { backgroundColor: catColor + "20" }]}>
                          <Ionicons name={catIcon} size={18} color={catColor} />
                        </View>
                        <Text style={[styles.categoryName, { color: catColor }]}>{category}</Text>
                        <Text style={styles.categoryCount}>
                          {catScored}/{items.length}
                        </Text>
                      </View>
                      {items.map((item) => (
                        <AssessmentItemRow
                          key={item.id}
                          item={item}
                          score={itemScores[item.id]}
                          onScore={(score) =>
                            setItemScores((prev) => ({ ...prev, [item.id]: score }))
                          }
                          color={catColor}
                        />
                      ))}
                    </View>
                  );
                })}
                <View style={{ height: 100 }} />
              </ScrollView>
            )}

            <View style={styles.footer}>
              <View style={styles.progressSummary}>
                <Text style={styles.progressSummaryText}>
                  {allScored
                    ? "All items scored. Ready to submit."
                    : `${totalItems - scoredItems} item${totalItems - scoredItems !== 1 ? "s" : ""} remaining`}
                </Text>
              </View>
              <Pressable
                style={[styles.primaryBtn, !allScored && styles.disabledBtn]}
                onPress={allScored ? handleFinishScoring : undefined}
                disabled={!allScored}
              >
                <LinearGradient
                  colors={allScored ? [NEON_GREEN, "#A0D429"] : ["#555", "#444"]}
                  style={styles.primaryBtnGradient}
                >
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: allScored ? Colors.dark.backgroundRoot : Colors.dark.textMuted },
                    ]}
                  >
                    Calculate Result
                  </Text>
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={allScored ? Colors.dark.backgroundRoot : Colors.dark.textMuted}
                  />
                </LinearGradient>
              </Pressable>
            </View>
          </>
        )}

        {step === "result" && assessmentResult && (
          <>
            <View style={styles.header}>
              <Pressable onPress={handleReset} style={styles.closeBtn}>
                <Ionicons name="refresh-outline" size={22} color={Colors.dark.textMuted} />
              </Pressable>
              <Text style={styles.headerTitle}>Assessment Result</Text>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={Colors.dark.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.resultScoreCard}>
                <View
                  style={[
                    styles.resultScoreRing,
                    {
                      borderColor: assessmentResult.passed ? NEON_GREEN : Colors.dark.error,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.resultScoreNum,
                      { color: assessmentResult.passed ? NEON_GREEN : Colors.dark.error },
                    ]}
                  >
                    {assessmentResult.percentage}%
                  </Text>
                  <Text style={styles.resultScoreLabel}>Overall Score</Text>
                </View>

                <View
                  style={[
                    styles.resultBadge,
                    {
                      backgroundColor: assessmentResult.passed
                        ? NEON_GREEN + "20"
                        : Colors.dark.error + "20",
                      borderColor: assessmentResult.passed ? NEON_GREEN : Colors.dark.error,
                    },
                  ]}
                >
                  <Ionicons
                    name={assessmentResult.passed ? "checkmark-circle" : "close-circle"}
                    size={20}
                    color={assessmentResult.passed ? NEON_GREEN : Colors.dark.error}
                  />
                  <Text
                    style={[
                      styles.resultBadgeText,
                      { color: assessmentResult.passed ? NEON_GREEN : Colors.dark.error },
                    ]}
                  >
                    {assessmentResult.passed ? "PASS — Promotion Ready" : "NOT PASSED"}
                  </Text>
                </View>

                <Text style={styles.resultThreshold}>
                  {assessmentResult.passed
                    ? `Scored ${assessmentResult.percentage}%, exceeding the 85% threshold.`
                    : `Needs ${PASS_THRESHOLD - assessmentResult.percentage}% more to reach the 85% threshold.`}
                </Text>
              </View>

              <Text style={styles.sectionLabel}>Category Breakdown</Text>
              {Object.entries(assessmentResult.categoryBreakdown).map(([cat, bd]) => {
                const catColor = CATEGORY_COLORS[cat] ?? NEON_GREEN;
                const catIcon = CATEGORY_ICONS[cat] ?? "star-outline";
                const isWeak = bd.percentage < 62;
                return (
                  <View key={cat} style={styles.catResultRow}>
                    <View style={styles.catResultLeft}>
                      <Ionicons name={catIcon} size={16} color={catColor} />
                      <Text style={styles.catResultName}>{cat}</Text>
                      {isWeak ? (
                        <View style={styles.weakBadge}>
                          <Text style={styles.weakBadgeText}>Needs work</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.catResultRight}>
                      <View style={styles.catBar}>
                        <View
                          style={[
                            styles.catBarFill,
                            { width: `${bd.percentage}%`, backgroundColor: catColor },
                          ]}
                        />
                        <View
                          style={[styles.catBarThreshold, { left: `${PASS_THRESHOLD}%` }]}
                        />
                      </View>
                      <Text style={[styles.catResultPct, { color: catColor }]}>
                        {bd.percentage}%
                      </Text>
                    </View>
                  </View>
                );
              })}

              {assessmentResult.passed ? (
                <View style={styles.promotionCard}>
                  <LinearGradient
                    colors={[NEON_GREEN + "30", NEON_GREEN + "10"]}
                    style={styles.promotionCardGradient}
                  >
                    <Ionicons name="arrow-up-circle" size={28} color={NEON_GREEN} />
                    <Text style={styles.promotionCardTitle}>Promotion Ready</Text>
                    {trialStarted ? (
                      <Text style={[styles.promotionCardDesc, { color: NEON_GREEN }]}>
                        Promotion trial started for {playerName}. Manage it in the Trial Management section.
                      </Text>
                    ) : (
                      <Text style={styles.promotionCardDesc}>
                        {playerName} met the 85% threshold. Start a promotion trial when you are ready.
                      </Text>
                    )}
                  </LinearGradient>
                </View>
              ) : (
                <View style={styles.focusCard}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Ionicons name="fitness-outline" size={22} color={Colors.dark.gold} />
                    <Text style={styles.focusCardTitle}>Coaching Focus Areas</Text>
                  </View>
                  {generateFocusTips(assessmentResult).map((tip, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                      <View style={{
                        width: 20, height: 20, borderRadius: 10,
                        backgroundColor: Colors.dark.gold + "30",
                        alignItems: "center", justifyContent: "center", marginTop: 1,
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.dark.gold }}>{i + 1}</Text>
                      </View>
                      <Text style={[styles.focusCardDesc, { flex: 1, marginTop: 0 }]}>{tip}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>

            <View style={styles.footer}>
              <Pressable style={styles.cancelBtn} onPress={handleReset}>
                <Text style={styles.cancelBtnText}>Reassess</Text>
              </Pressable>
              {assessmentResult.passed && !trialStarted ? (
                <Pressable
                  style={[styles.primaryBtn, isStartingTrial && { opacity: 0.7 }]}
                  onPress={handleStartPromotionTrial}
                  disabled={isStartingTrial}
                >
                  <LinearGradient
                    colors={[NEON_GREEN, "#A0D429"]}
                    style={styles.primaryBtnGradient}
                  >
                    {isStartingTrial ? (
                      <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                    ) : (
                      <>
                        <Text style={[styles.primaryBtnText, { color: Colors.dark.backgroundRoot }]}>
                          Start Promotion Trial
                        </Text>
                        <Ionicons name="arrow-up-circle" size={18} color={Colors.dark.backgroundRoot} />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              ) : (
                <Pressable style={styles.primaryBtn} onPress={onClose}>
                  <LinearGradient
                    colors={[NEON_GREEN, "#A0D429"]}
                    style={styles.primaryBtnGradient}
                  >
                    <Text style={[styles.primaryBtnText, { color: Colors.dark.backgroundRoot }]}>
                      Done
                    </Text>
                  </LinearGradient>
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerSub: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: Spacing.sm,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    gap: Spacing.md,
  },
  cancelBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  cancelBtnText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  primaryBtn: {
    flex: 1,
  },
  primaryBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  primaryBtnText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
  disabledBtn: {
    opacity: 0.6,
  },
  progressPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  progressPillText: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  introBanner: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  introTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  introSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
  introDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.gold + "15",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
    marginBottom: Spacing.lg,
  },
  tipText: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: Colors.dark.text,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  levelGrid: {
    gap: Spacing.sm,
  },
  levelCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  levelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  levelLabel: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  categoryBlock: {
    marginTop: Spacing.lg,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  catIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryName: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  categoryCount: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  itemRow: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  itemHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  hfhBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hfhText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemName: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  scoreDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreDotText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  itemDesc: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    lineHeight: 16,
  },
  scoreRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  scoreBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  scoreBtnNum: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  scoreBtnLabel: {
    fontSize: 9,
    color: Colors.dark.textMuted,
    marginTop: 2,
    textAlign: "center",
  },
  progressSummary: {
    flex: 1,
  },
  progressSummaryText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
    textAlign: "center",
  },
  emptySubText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  resultScoreCard: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  resultScoreRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Backgrounds.card,
  },
  resultScoreNum: {
    fontSize: 32,
    fontWeight: "700",
  },
  resultScoreLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  resultBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  resultBadgeText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  resultThreshold: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  catResultRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  catResultLeft: {
    flexDirection: "row",
    alignItems: "center",
    width: 130,
    gap: Spacing.xs,
  },
  catResultName: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  weakBadge: {
    backgroundColor: Colors.dark.error + "20",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  weakBadgeText: {
    fontSize: 8,
    color: Colors.dark.error,
    fontWeight: "700",
  },
  catResultRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  catBar: {
    flex: 1,
    height: 8,
    backgroundColor: Backgrounds.surface,
    borderRadius: 4,
    overflow: "visible",
  },
  catBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  catBarThreshold: {
    position: "absolute",
    top: -3,
    width: 2,
    height: 14,
    backgroundColor: Colors.dark.textMuted,
    borderRadius: 1,
  },
  catResultPct: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    width: 36,
    textAlign: "right",
  },
  promotionCard: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: NEON_GREEN + "40",
  },
  promotionCardGradient: {
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  promotionCardTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: NEON_GREEN,
  },
  promotionCardDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  focusCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
    gap: Spacing.sm,
    alignItems: "flex-start",
  },
  focusCardTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  focusCardDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    lineHeight: 20,
  },
});
