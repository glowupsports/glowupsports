import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";
import AiProUpgradeModal from "@/player/components/AiProUpgradeModal";
import { MonthlyAssessmentModal } from "@/player/components/MonthlyAssessmentModal";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const AI_COACH_INTRO_SEEN_KEY = "ai_coach_intro_seen";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type DataMaturityLevel = "none" | "basic" | "trends" | "full";

interface DataMaturity {
  sessionCount: number;
  maturityLevel: DataMaturityLevel;
  nextMilestone: string;
}

interface GlowMirrorLayers {
  sessionCheckins: boolean;
  monthlyVoice: boolean;
  perceptionGaps: boolean;
}

interface TrainingSession {
  id: string;
  date: string;
  type: string;
  duration: number;
  coachName: string;
  attended: boolean;
  xpEarned: number;
  hasReflection?: boolean;
  domains?: { domain: string; xp: number }[];
  feedback?: {
    focus: number;
    effort: number;
    message?: string;
  };
}

interface WeeklyDigest {
  id: string;
  title: string;
  body: string;
  type: string;
  data: {
    focusArea?: string;
    keepDoing?: string;
    improve?: string;
    reason?: string;
    drillTip?: string;
    motivation?: string;
  } | null;
  createdAt: string;
}

interface WeeklyPlanFocusArea {
  title: string;
  description: string;
  drillSuggestion: string;
  timeTarget: string;
  pillar: string;
  rationale: string;
}

interface WeeklyPlan {
  id: string;
  weekStartDate: string;
  status: string;
  coachNotes: string | null;
  planJson: {
    focusAreas: WeeklyPlanFocusArea[];
    overallRationale: string;
  } | null;
  generatedAt: string;
}

interface MonthlyAssessmentEntry {
  id: string;
  status: "pending" | "completed";
  monthYear: string;
  aiSummary?: string | null;
}

interface MonthlyAssessmentResponse {
  monthYear: string;
  assessment: MonthlyAssessmentEntry | null;
}

const AI_LABEL = "AI Coach";
const ACCENT = Colors.dark.primary;
const MIRROR_ACCENT = "#A78BFA";

type TabKey = "chat" | "mirror" | "plan";

function TypingIndicator() {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 450);
    return () => clearInterval(interval);
  }, []);
  return (
    <View style={styles.aiBubbleRow}>
      <View style={styles.aiAvatar}>
        <Ionicons name="sparkles" size={12} color={Colors.dark.buttonText} />
      </View>
      <View style={[styles.bubble, styles.aiBubble]}>
        <Text style={styles.aiLabel}>{AI_LABEL}</Text>
        <Text style={[styles.bubbleText, { color: Colors.dark.textMuted }]}>{dots}</Text>
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return isUser ? (
    <View style={styles.userBubbleRow}>
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={[styles.bubbleText, styles.userBubbleText]}>{message.content}</Text>
      </View>
    </View>
  ) : (
    <View style={styles.aiBubbleRow}>
      <View style={styles.aiAvatar}>
        <Ionicons name="sparkles" size={12} color={Colors.dark.buttonText} />
      </View>
      <View style={[styles.bubble, styles.aiBubble]}>
        <Text style={styles.aiLabel}>{AI_LABEL}</Text>
        <Text style={styles.bubbleText}>{message.content}</Text>
      </View>
    </View>
  );
}

const MILESTONES = [
  { label: "Basic advice", sessions: 1 },
  { label: "Trend analysis", sessions: 4 },
  { label: "Full coaching", sessions: 8 },
];

const FEATURE_HIGHLIGHTS = [
  { icon: "calendar-outline" as const, label: "Knows your sessions", desc: "Trained on every session your coach logs with you" },
  { icon: "trending-up-outline" as const, label: "Tracks your progress", desc: "Sees your skill scores, feedback and improvement trends" },
  { icon: "bulb-outline" as const, label: "Gives personalised tips", desc: "Asks about your goals and tailors advice to your game" },
  { icon: "sparkles-outline" as const, label: "Gets smarter over time", desc: "The more you train, the more data your coach has to work with" },
];

const GLOW_MIRROR_LAYER_LABELS = [
  { key: "sessionCheckins" as const, label: "Session check-ins", icon: "journal-outline" as const, desc: "Your feelings and reflections after each session" },
  { key: "monthlyVoice" as const, label: "Monthly voice", icon: "mic-outline" as const, desc: "Your self-assessment answers and self-ratings" },
  { key: "perceptionGaps" as const, label: "Perception gaps", icon: "eye-outline" as const, desc: "How your view of your game compares to your coach's" },
];

function GlowMirrorStatusCard({ layers }: { layers: GlowMirrorLayers | null }) {
  const anyConnected = layers && (layers.sessionCheckins || layers.monthlyVoice || layers.perceptionGaps);
  const connectedCount = layers ? [layers.sessionCheckins, layers.monthlyVoice, layers.perceptionGaps].filter(Boolean).length : 0;
  return (
    <View style={introStyles.glowMirrorCard}>
      <View style={introStyles.glowMirrorHeader}>
        <View style={introStyles.glowMirrorHeaderLeft}>
          <View style={[introStyles.glowMirrorDot, { backgroundColor: anyConnected ? Colors.dark.primary : Colors.dark.textMuted }]} />
          <Text style={introStyles.glowMirrorTitle}>Glow Mirror</Text>
        </View>
        <View style={[introStyles.glowMirrorBadge, anyConnected ? introStyles.glowMirrorBadgeActive : introStyles.glowMirrorBadgeInactive]}>
          <Text style={[introStyles.glowMirrorBadgeText, anyConnected ? { color: Colors.dark.primary } : { color: Colors.dark.textMuted }]}>
            {anyConnected ? `${connectedCount}/3 connected` : "Not yet connected"}
          </Text>
        </View>
      </View>
      <View style={introStyles.glowMirrorLayers}>
        {GLOW_MIRROR_LAYER_LABELS.map((l) => {
          const active = layers ? layers[l.key] : false;
          return (
            <View key={l.key} style={introStyles.glowMirrorLayerRow}>
              <View style={[introStyles.glowMirrorLayerIcon, active ? introStyles.glowMirrorLayerIconActive : introStyles.glowMirrorLayerIconInactive]}>
                <Ionicons name={l.icon} size={13} color={active ? Colors.dark.primary : Colors.dark.textMuted} />
              </View>
              <View style={introStyles.glowMirrorLayerText}>
                <Text style={[introStyles.glowMirrorLayerLabel, !active && { color: Colors.dark.textMuted }]}>{l.label}</Text>
                <Text style={introStyles.glowMirrorLayerDesc}>{l.desc}</Text>
              </View>
              <Ionicons
                name={active ? "checkmark-circle" : "ellipse-outline"}
                size={16}
                color={active ? Colors.dark.primary : Colors.dark.textMuted}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function FeatureIntroModal({ visible, isPro, callCount, limit, glowMirrorLayers, onStart, onUpgrade }: {
  visible: boolean;
  isPro: boolean;
  callCount: number;
  limit: number;
  glowMirrorLayers: GlowMirrorLayers | null;
  onStart: () => void;
  onUpgrade: () => void;
}) {
  const insets = useSafeAreaInsets();
  const remaining = Math.max(limit - callCount, 0);
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={[introStyles.container, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>
        <ScrollView contentContainerStyle={introStyles.scroll} showsVerticalScrollIndicator={false}>
          <View style={introStyles.iconWrap}>
            <Ionicons name="sparkles" size={40} color={Colors.dark.primary} />
          </View>
          <Text style={introStyles.title}>Your Personal AI Coach</Text>
          <Text style={introStyles.subtitle}>
            Ask anything about your game, sessions, progress, serve technique or what to focus on next.
          </Text>

          <View style={introStyles.highlights}>
            {FEATURE_HIGHLIGHTS.map((h) => (
              <View key={h.label} style={introStyles.highlightRow}>
                <View style={introStyles.highlightIcon}>
                  <Ionicons name={h.icon} size={18} color={Colors.dark.primary} />
                </View>
                <View style={introStyles.highlightText}>
                  <Text style={introStyles.highlightLabel}>{h.label}</Text>
                  <Text style={introStyles.highlightDesc}>{h.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <GlowMirrorStatusCard layers={glowMirrorLayers} />

          <View style={introStyles.costNote}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.dark.textMuted} />
            <Text style={introStyles.costNoteText}>
              Every message is powered by OpenAI. We pass on a fair monthly plan so you get 200 messages per month without us running at a loss.
            </Text>
          </View>

          {!isPro ? (
            <View style={introStyles.limitBadge}>
              <Ionicons name="chatbubble-ellipses" size={14} color={Colors.dark.primary} />
              <Text style={introStyles.limitBadgeText}>
                You have {remaining} free message{remaining !== 1 ? "s" : ""} this month
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={introStyles.footer}>
          {!isPro ? (
            <>
              <Pressable style={introStyles.ctaBtn} onPress={onStart}>
                <Ionicons name="chatbubble-ellipses" size={16} color={Colors.dark.buttonText} />
                <Text style={introStyles.ctaBtnText}>Try Free ({remaining} message{remaining !== 1 ? "s" : ""})</Text>
              </Pressable>
              <Pressable style={introStyles.upgradeBtn} onPress={onUpgrade}>
                <Ionicons name="flash" size={15} color={Colors.dark.primary} />
                <Text style={introStyles.upgradeBtnText}>Unlock Full Access — 200 msg/month</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={introStyles.ctaBtn} onPress={onStart}>
              <Ionicons name="chatbubble-ellipses" size={16} color={Colors.dark.buttonText} />
              <Text style={introStyles.ctaBtnText}>Start Chatting</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const introStyles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080C14",
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
    alignItems: "center",
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.dark.primary + "1A",
    borderWidth: 1.5,
    borderColor: Colors.dark.primary + "50",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    color: Colors.dark.textSubtle,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  highlights: {
    width: "100%",
    gap: Spacing.sm,
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: Spacing.md,
  },
  highlightIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.dark.primary + "18",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  highlightText: {
    flex: 1,
    gap: 2,
  },
  highlightLabel: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "700",
  },
  highlightDesc: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  costNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
    padding: Spacing.md,
  },
  costNoteText: {
    flex: 1,
    color: Colors.dark.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: "italic",
  },
  limitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary + "18",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  limitBadgeText: {
    color: Colors.dark.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md + 2,
  },
  ctaBtnText: {
    color: Colors.dark.buttonText,
    fontSize: 16,
    fontWeight: "700",
  },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: "transparent",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.dark.primary + "60",
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  upgradeBtnText: {
    color: Colors.dark.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  glowMirrorCard: {
    width: "100%",
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  glowMirrorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  glowMirrorHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  glowMirrorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  glowMirrorTitle: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  glowMirrorBadge: {
    borderRadius: BorderRadius.full ?? 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  glowMirrorBadgeActive: {
    backgroundColor: Colors.dark.primary + "18",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  glowMirrorBadgeInactive: {
    backgroundColor: Colors.dark.chipBackground,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
  },
  glowMirrorBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  glowMirrorLayers: {
    gap: Spacing.xs,
  },
  glowMirrorLayerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  glowMirrorLayerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  glowMirrorLayerIconActive: {
    backgroundColor: Colors.dark.primary + "18",
  },
  glowMirrorLayerIconInactive: {
    backgroundColor: Colors.dark.chipBackground,
  },
  glowMirrorLayerText: {
    flex: 1,
    gap: 1,
  },
  glowMirrorLayerLabel: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "600",
  },
  glowMirrorLayerDesc: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
}));

function OnboardingSplash({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.onboardingContainer}>
      <View style={styles.onboardingIcon}>
        <Ionicons name="sparkles" size={36} color={ACCENT} />
      </View>
      <Text style={styles.onboardingTitle}>Your AI Coach Starts Here</Text>
      <Text style={styles.onboardingDesc}>
        The AI Coach learns from every session your coach logs. The more sessions you complete, the more personalised and accurate the coaching becomes.
      </Text>
      <View style={styles.milestonesCard}>
        {MILESTONES.map((m, i) => (
          <View key={m.label} style={[styles.milestoneRow, i < MILESTONES.length - 1 && styles.milestoneRowBorder]}>
            <View style={styles.milestoneDot}>
              <Text style={styles.milestoneDotText}>{m.sessions}</Text>
            </View>
            <View style={styles.milestoneInfo}>
              <Text style={styles.milestoneLabel}>{m.label}</Text>
              <Text style={styles.milestoneSub}>{m.sessions === 1 ? "1 session attended" : `${m.sessions} sessions attended`}</Text>
            </View>
            {i === 0 ? (
              <View style={styles.milestoneBadge}>
                <Text style={styles.milestoneBadgeText}>Next</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
      <Text style={styles.onboardingHint}>
        For now, the AI will give general tennis advice and get to know your goals. Chat away!
      </Text>
      <Pressable style={styles.onboardingCta} onPress={onStart}>
        <Ionicons name="chatbubble-ellipses" size={16} color={Colors.dark.buttonText} />
        <Text style={styles.onboardingCtaText}>Start chatting</Text>
      </Pressable>
    </View>
  );
}

function MaturityBanner({ dataMaturity, onDismiss }: { dataMaturity: DataMaturity; onDismiss: () => void }) {
  const { sessionCount, maturityLevel, nextMilestone } = dataMaturity;
  const isBasic = maturityLevel === "basic";
  const isTrends = maturityLevel === "trends";

  const progressFraction = isBasic
    ? Math.min(sessionCount / 4, 1)
    : isTrends
    ? Math.min((sessionCount - 4) / 4, 1)
    : 0;

  const accentColor = isTrends ? Colors.dark.primary : Colors.dark.warning;

  return (
    <View style={[styles.maturityBanner, { borderColor: accentColor + "30" }]}>
      <View style={styles.maturityBannerHeader}>
        <View style={styles.maturityBannerLeft}>
          <View style={[styles.maturityPill, { backgroundColor: accentColor + "18" }]}>
            <Ionicons name="analytics-outline" size={11} color={accentColor} />
            <Text style={[styles.maturityPillText, { color: accentColor }]}>
              {isTrends ? "Trends unlocked" : "Still learning your game"}
            </Text>
          </View>
        </View>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Ionicons name="chevron-up" size={14} color={Colors.dark.textMuted} />
        </Pressable>
      </View>
      <View style={styles.maturityProgressTrack}>
        <View
          style={[
            styles.maturityProgressFill,
            { flex: progressFraction, backgroundColor: accentColor },
          ]}
        />
        <View style={{ flex: 1 - progressFraction }} />
      </View>
      <Text style={styles.maturityBannerSub}>{nextMilestone}</Text>
    </View>
  );
}

function MyMirrorTab({
  glowMirrorLayers,
  monthlyAssessmentData,
  onOpenMonthlyModal,
  // Task #1426 — training-history is fetched once by the parent screen
  // via `/api/player/me/ai-coach-data` and passed in here. The legacy
  // useQuery in this tab is gone, so the combined endpoint is the only
  // fetch path on AI Coach mount. The parent still seeds the legacy
  // ["/api/player/training-history"] cache key via setQueryData so other
  // screens (PlayerTrainingScreen) keep getting a warm cache.
  trainingHistory,
}: {
  glowMirrorLayers: GlowMirrorLayers | null;
  // Task #1419 — accept null in addition to undefined. The god-route
  // returns null when monthly-assessment is genuinely empty for the
  // player, and the parent's derived `aiCoachData?.monthlyAssessment ??
  // undefined` therefore has the type `MonthlyAssessmentResponse | null
  // | undefined`. All consumers below already null-check via truthy
  // guards (`monthlyAssessmentData ?`), so accepting null is safe.
  monthlyAssessmentData: MonthlyAssessmentResponse | null | undefined;
  onOpenMonthlyModal: () => void;
  trainingHistory: TrainingSession[] | null | undefined;
}) {
  const navigation = useNavigation();
  const connectedCount = glowMirrorLayers
    ? [glowMirrorLayers.sessionCheckins, glowMirrorLayers.monthlyVoice, glowMirrorLayers.perceptionGaps].filter(Boolean).length
    : 0;

  const recentSessions = (trainingHistory || []).slice(0, 5);

  const handleSessionPress = (sessionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("TrainingDetail", { sessionId });
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={mirrorTabStyles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Glow Mirror Layer Health Grid */}
      <View style={mirrorTabStyles.section}>
        <Text style={mirrorTabStyles.sectionTitle}>GLOW MIRROR LAYERS</Text>
        <View style={mirrorTabStyles.layersCard}>
          <View style={mirrorTabStyles.layersHeader}>
            <View style={mirrorTabStyles.layersHeaderLeft}>
              <View style={[mirrorTabStyles.layersDot, { backgroundColor: connectedCount > 0 ? MIRROR_ACCENT : Colors.dark.textMuted }]} />
              <Text style={mirrorTabStyles.layersTitle}>Your Coaching Picture</Text>
            </View>
            <View style={[
              mirrorTabStyles.layersBadge,
              connectedCount > 0 ? mirrorTabStyles.layersBadgeActive : mirrorTabStyles.layersBadgeInactive,
            ]}>
              <Text style={[
                mirrorTabStyles.layersBadgeText,
                { color: connectedCount > 0 ? MIRROR_ACCENT : Colors.dark.textMuted },
              ]}>
                {connectedCount}/3 active
              </Text>
            </View>
          </View>
          {GLOW_MIRROR_LAYER_LABELS.map((l) => {
            const active = glowMirrorLayers ? glowMirrorLayers[l.key] : false;
            return (
              <View key={l.key} style={mirrorTabStyles.layerRow}>
                <View style={[mirrorTabStyles.layerIcon, active ? mirrorTabStyles.layerIconActive : mirrorTabStyles.layerIconInactive]}>
                  <Ionicons name={l.icon} size={14} color={active ? MIRROR_ACCENT : Colors.dark.textMuted} />
                </View>
                <View style={mirrorTabStyles.layerText}>
                  <Text style={[mirrorTabStyles.layerLabel, !active && { color: Colors.dark.textMuted }]}>{l.label}</Text>
                  <Text style={mirrorTabStyles.layerDesc}>{l.desc}</Text>
                </View>
                <Ionicons
                  name={active ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={active ? MIRROR_ACCENT : Colors.dark.textMuted}
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* Monthly Check-In Card */}
      {monthlyAssessmentData ? (
        <View style={mirrorTabStyles.section}>
          <Text style={mirrorTabStyles.sectionTitle}>MONTHLY CHECK-IN</Text>
          <Pressable
            style={[
              mirrorTabStyles.monthlyCard,
              monthlyAssessmentData.assessment?.status === "completed"
                ? mirrorTabStyles.monthlyCardDone
                : mirrorTabStyles.monthlyCardPending,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onOpenMonthlyModal();
            }}
          >
            <View style={mirrorTabStyles.monthlyCardLeft}>
              <View style={mirrorTabStyles.monthlyIcon}>
                <Ionicons name="mic" size={22} color={MIRROR_ACCENT} />
              </View>
              <View style={mirrorTabStyles.monthlyInfo}>
                <Text style={mirrorTabStyles.monthlyTitle}>
                  {monthlyAssessmentData.assessment?.status === "completed"
                    ? "Monthly Voice Captured"
                    : "Monthly Check-In Ready"}
                </Text>
                <Text style={mirrorTabStyles.monthlySub}>
                  {monthlyAssessmentData.assessment?.status === "completed"
                    ? monthlyAssessmentData.assessment?.aiSummary
                      ? monthlyAssessmentData.assessment.aiSummary.slice(0, 80) + "..."
                      : `${monthlyAssessmentData.monthYear} — your voice is with your coach`
                    : "Share how you feel about your game this month"}
                </Text>
              </View>
            </View>
            <Ionicons
              name={monthlyAssessmentData.assessment?.status === "completed" ? "checkmark-circle" : "chevron-forward"}
              size={22}
              color={MIRROR_ACCENT}
            />
          </Pressable>
        </View>
      ) : null}

      {/* Recent Sessions */}
      <View style={mirrorTabStyles.section}>
        <View style={mirrorTabStyles.sectionHeaderRow}>
          <Text style={mirrorTabStyles.sectionTitle}>RECENT SESSIONS</Text>
          <Text style={mirrorTabStyles.sectionSubtitle}>Tap to add or view reflection</Text>
        </View>
        {recentSessions.length === 0 ? (
          <View style={mirrorTabStyles.emptyCard}>
            <Ionicons name="calendar-outline" size={28} color={Colors.dark.textMuted} />
            <Text style={mirrorTabStyles.emptyText}>No sessions yet</Text>
            <Text style={mirrorTabStyles.emptySubtext}>Your recent sessions will appear here after you attend a session</Text>
          </View>
        ) : (
          <View style={mirrorTabStyles.sessionsList}>
            {recentSessions.map((session) => {
              const date = new Date(session.date);
              const dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              const typeLabel = session.type === "private" ? "Private" : session.type === "group" ? "Group" : session.type === "physical" ? "Physical" : "Training";
              const hasReflection = session.hasReflection ?? false;

              return (
                <Pressable
                  key={session.id}
                  style={mirrorTabStyles.sessionRow}
                  onPress={() => handleSessionPress(session.id)}
                >
                  <View style={mirrorTabStyles.sessionLeft}>
                    <View style={[mirrorTabStyles.sessionDot, { backgroundColor: hasReflection ? MIRROR_ACCENT + "30" : Colors.dark.chipBackground }]}>
                      <Ionicons
                        name={hasReflection ? "mic" : "mic-outline"}
                        size={14}
                        color={hasReflection ? MIRROR_ACCENT : Colors.dark.textMuted}
                      />
                    </View>
                    <View style={mirrorTabStyles.sessionInfo}>
                      <Text style={mirrorTabStyles.sessionDate}>{dateStr}</Text>
                      <Text style={mirrorTabStyles.sessionType}>{typeLabel} · {session.duration} min</Text>
                    </View>
                  </View>
                  <View style={mirrorTabStyles.sessionRight}>
                    {hasReflection ? (
                      <View style={mirrorTabStyles.reflectionBadge}>
                        <Ionicons name="checkmark-circle" size={12} color={MIRROR_ACCENT} />
                        <Text style={mirrorTabStyles.reflectionBadgeText}>Reflected</Text>
                      </View>
                    ) : (
                      <View style={mirrorTabStyles.addReflectionBadge}>
                        <Ionicons name="add" size={12} color={Colors.dark.primary} />
                        <Text style={mirrorTabStyles.addReflectionText}>Add</Text>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const mirrorTabStyles = makeReactiveStyles(() => StyleSheet.create({
  scroll: {
    paddingBottom: 40,
    gap: 0,
  },
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: Colors.dark.textMuted,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionSubtitle: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  layersCard: {
    backgroundColor: "rgba(167,139,250,0.06)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: MIRROR_ACCENT + "25",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  layersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  layersHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  layersDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  layersTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  layersBadge: {
    borderRadius: BorderRadius.full ?? 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  layersBadgeActive: {
    backgroundColor: MIRROR_ACCENT + "15",
    borderWidth: 1,
    borderColor: MIRROR_ACCENT + "40",
  },
  layersBadgeInactive: {
    backgroundColor: Colors.dark.chipBackground,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
  },
  layersBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  layerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  layerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  layerIconActive: {
    backgroundColor: MIRROR_ACCENT + "18",
  },
  layerIconInactive: {
    backgroundColor: Colors.dark.chipBackground,
  },
  layerText: {
    flex: 1,
    gap: 1,
  },
  layerLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  layerDesc: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    lineHeight: 15,
  },
  monthlyCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  monthlyCardDone: {
    backgroundColor: MIRROR_ACCENT + "10",
    borderColor: MIRROR_ACCENT + "40",
  },
  monthlyCardPending: {
    backgroundColor: MIRROR_ACCENT + "08",
    borderColor: MIRROR_ACCENT + "30",
  },
  monthlyCardLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  monthlyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MIRROR_ACCENT + "20",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  monthlyInfo: {
    flex: 1,
    gap: 3,
  },
  monthlyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  monthlySub: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 17,
  },
  emptyCard: {
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
    padding: Spacing.xl,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  emptySubtext: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 17,
  },
  sessionsList: {
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
  },
  sessionLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sessionDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sessionInfo: {
    flex: 1,
    gap: 2,
  },
  sessionDate: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  sessionType: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  sessionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  reflectionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: MIRROR_ACCENT + "18",
    borderRadius: BorderRadius.full ?? 999,
    borderWidth: 1,
    borderColor: MIRROR_ACCENT + "40",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reflectionBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: MIRROR_ACCENT,
  },
  addReflectionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.primary + "18",
    borderRadius: BorderRadius.full ?? 999,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  addReflectionText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
}));

interface PlayerSession {
  id: string;
  sessionId: string;
  attendanceStatus: string;
  coachName: string | null;
  session: {
    id: string;
    startTime: string;
    endTime: string;
    sessionType: string | null;
    title: string;
    courtName: string | null;
    locationName: string | null;
  };
}

function GlowPlanTab({
  digest,
  // Task #1426 — weekly-plan and sessions are fetched once by the parent
  // screen via `/api/player/me/ai-coach-data` and passed in here. The
  // legacy useQuery calls in this tab are gone, so the combined endpoint
  // is the only fetch path on AI Coach mount. The parent still seeds the
  // legacy ["/api/player/me/weekly-plan"] and ["/api/player/me/sessions"]
  // cache keys via setQueryData so other screens (PlayerProgressScreen,
  // PlayerScheduleScreen) keep getting a warm cache.
  weeklyPlan,
  allSessions,
}: {
  digest: WeeklyDigest | null;
  weeklyPlan: WeeklyPlan | null | undefined;
  allSessions: PlayerSession[] | null | undefined;
}) {
  const hasFocus = digest && digest.data?.focusArea;
  const focusArea = digest?.data?.focusArea;
  const keepDoing = digest?.data?.keepDoing || digest?.data?.drillTip;
  const improve = digest?.data?.improve || digest?.data?.motivation;

  const now = new Date();
  const nextSession = (allSessions || [])
    .filter((s) => new Date(s.session.startTime) > now && s.attendanceStatus !== "absent")
    .sort((a, b) => new Date(a.session.startTime).getTime() - new Date(b.session.startTime).getTime())[0] || null;

  const currentWeekStartDate = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    return monday.toISOString().split("T")[0];
  })();

  const isCurrentWeekPlan = weeklyPlan?.weekStartDate === currentWeekStartDate;
  const focusAreas = weeklyPlan?.planJson?.focusAreas || [];
  const hasPlan = focusAreas.length > 0 && isCurrentWeekPlan;

  const pillarColors: Record<string, string> = {
    technical: "#8B5CF6",
    tactical: "#3B82F6",
    physical: "#10B981",
    mental: "#F59E0B",
    social: "#EC4899",
  };

  const formatSessionDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  };

  const formatSessionTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={planTabStyles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Weekly AI Focus Card */}
      <View style={planTabStyles.section}>
        <Text style={planTabStyles.sectionTitle}>YOUR FOCUS THIS WEEK</Text>
        <View style={[planTabStyles.card, hasFocus ? planTabStyles.cardActive : planTabStyles.cardEmpty]}>
          <View style={planTabStyles.cardHeader}>
            <View style={planTabStyles.cardIconWrap}>
              <Ionicons name="sparkles" size={18} color="#8B5CF6" />
            </View>
            <View style={planTabStyles.cardHeaderText}>
              <Text style={planTabStyles.cardTitle}>Weekly AI Focus</Text>
              {hasFocus ? (
                <Text style={planTabStyles.cardSubtitle}>Personalised for your game</Text>
              ) : (
                <Text style={planTabStyles.cardSubtitle}>Generated after your coach logs sessions</Text>
              )}
            </View>
          </View>
          {hasFocus ? (
            <View style={planTabStyles.bulletList}>
              <View style={planTabStyles.bulletRow}>
                <View style={planTabStyles.bulletIconWrap}>
                  <Ionicons name="flag" size={13} color="#8B5CF6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[planTabStyles.bulletLabel, { color: "#8B5CF6" }]}>FOCUS THIS WEEK</Text>
                  <Text style={planTabStyles.bulletText}>{focusArea}</Text>
                </View>
              </View>
              {keepDoing ? (
                <View style={planTabStyles.bulletRow}>
                  <View style={planTabStyles.bulletIconWrap}>
                    <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[planTabStyles.bulletLabel, { color: "#10B981" }]}>KEEP DOING</Text>
                    <Text style={planTabStyles.bulletText}>{keepDoing}</Text>
                  </View>
                </View>
              ) : null}
              {improve ? (
                <View style={planTabStyles.bulletRow}>
                  <View style={planTabStyles.bulletIconWrap}>
                    <Ionicons name="trending-up" size={13} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[planTabStyles.bulletLabel, { color: "#F59E0B" }]}>ONE THING TO IMPROVE</Text>
                    <Text style={planTabStyles.bulletText}>{improve}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={planTabStyles.placeholderRow}>
              <Ionicons name="time-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={planTabStyles.placeholderText}>Your weekly AI focus drops after sessions are logged by your coach</Text>
            </View>
          )}
        </View>
      </View>

      {/* Pre-Session Brief */}
      <View style={planTabStyles.section}>
        <Text style={planTabStyles.sectionTitle}>PRE-SESSION BRIEF</Text>
        <View style={[planTabStyles.card, nextSession ? planTabStyles.cardActive : planTabStyles.cardEmpty]}>
          <View style={planTabStyles.cardHeader}>
            <View style={[planTabStyles.cardIconWrap, { backgroundColor: Colors.dark.primary + "20" }]}>
              <Ionicons name="flash" size={18} color={Colors.dark.primary} />
            </View>
            <View style={planTabStyles.cardHeaderText}>
              <Text style={planTabStyles.cardTitle}>Pre-Session Brief</Text>
              <Text style={planTabStyles.cardSubtitle}>
                {nextSession ? nextSession.session.title : "Prepared before each session"}
              </Text>
            </View>
          </View>
          {nextSession ? (
            <View style={planTabStyles.bulletList}>
              <View style={planTabStyles.bulletRow}>
                <View style={planTabStyles.bulletIconWrap}>
                  <Ionicons name="calendar-outline" size={13} color={Colors.dark.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[planTabStyles.bulletLabel, { color: Colors.dark.primary }]}>NEXT SESSION</Text>
                  <Text style={planTabStyles.bulletText}>{formatSessionDate(nextSession.session.startTime)}</Text>
                  <Text style={[planTabStyles.bulletText, { color: Colors.dark.textMuted }]}>
                    {formatSessionTime(nextSession.session.startTime)}
                    {nextSession.session.locationName ? " · " + nextSession.session.locationName : ""}
                  </Text>
                </View>
              </View>
              {nextSession.coachName ? (
                <View style={planTabStyles.bulletRow}>
                  <View style={planTabStyles.bulletIconWrap}>
                    <Ionicons name="person-outline" size={13} color={Colors.dark.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[planTabStyles.bulletLabel, { color: Colors.dark.textMuted }]}>COACH</Text>
                    <Text style={planTabStyles.bulletText}>{nextSession.coachName}</Text>
                  </View>
                </View>
              ) : null}
              <View style={planTabStyles.bulletRow}>
                <View style={planTabStyles.bulletIconWrap}>
                  <Ionicons name="information-circle-outline" size={13} color={Colors.dark.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[planTabStyles.bulletLabel, { color: Colors.dark.textMuted }]}>BRIEF</Text>
                  <Text style={planTabStyles.bulletText}>
                    Your coach will generate a personalised brief before this session — focus areas, warm-up tips, and mental cues.
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={planTabStyles.placeholderRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={planTabStyles.placeholderText}>
                No session scheduled yet. Once your coach books your next session, your pre-session brief will appear here.
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Weekly Glow Plan */}
      <View style={planTabStyles.section}>
        <Text style={planTabStyles.sectionTitle}>GLOW PLAN</Text>
        <View style={[planTabStyles.card, hasPlan ? planTabStyles.cardActive : planTabStyles.cardEmpty]}>
          <View style={planTabStyles.cardHeader}>
            <View style={[planTabStyles.cardIconWrap, { backgroundColor: "#E040FB20" }]}>
              <Ionicons name="calendar" size={18} color="#E040FB" />
            </View>
            <View style={planTabStyles.cardHeaderText}>
              <Text style={planTabStyles.cardTitle}>Weekly Glow Plan</Text>
              {hasPlan ? (
                <Text style={planTabStyles.cardSubtitle}>
                  {"Week of " + currentWeekStartDate}
                </Text>
              ) : (
                <Text style={planTabStyles.cardSubtitle}>Your weekly plan drops every Monday</Text>
              )}
            </View>
          </View>
          {hasPlan ? (
            <View style={planTabStyles.bulletList}>
              {weeklyPlan?.planJson?.overallRationale ? (
                <View style={planTabStyles.bulletRow}>
                  <View style={planTabStyles.bulletIconWrap}>
                    <Ionicons name="information-circle" size={13} color="#E040FB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[planTabStyles.bulletLabel, { color: "#E040FB" }]}>THIS WEEK</Text>
                    <Text style={planTabStyles.bulletText}>{weeklyPlan.planJson!.overallRationale}</Text>
                  </View>
                </View>
              ) : null}
              {focusAreas.map((area, idx) => {
                const color = pillarColors[area.pillar?.toLowerCase()] || "#8B5CF6";
                return (
                  <View key={idx} style={planTabStyles.bulletRow}>
                    <View style={planTabStyles.bulletIconWrap}>
                      <Ionicons name="checkmark-circle" size={13} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[planTabStyles.bulletLabel, { color }]}>{area.pillar?.toUpperCase() || "FOCUS"}</Text>
                      <Text style={planTabStyles.bulletText}>{area.title}</Text>
                      {area.description ? (
                        <Text style={[planTabStyles.bulletText, { color: Colors.dark.textMuted, marginTop: 2 }]}>{area.description}</Text>
                      ) : null}
                      {area.drillSuggestion ? (
                        <Text style={[planTabStyles.bulletText, { color: Colors.dark.textMuted, fontStyle: "italic", marginTop: 2 }]}>
                          {"Drill: " + area.drillSuggestion}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
              {weeklyPlan?.coachNotes ? (
                <View style={[planTabStyles.bulletRow, { marginTop: 4 }]}>
                  <View style={planTabStyles.bulletIconWrap}>
                    <Ionicons name="chatbubble-ellipses" size={13} color={Colors.dark.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[planTabStyles.bulletLabel, { color: Colors.dark.textMuted }]}>COACH NOTES</Text>
                    <Text style={planTabStyles.bulletText}>{weeklyPlan.coachNotes}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={planTabStyles.placeholderRow}>
              <Ionicons name="time-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={planTabStyles.placeholderText}>
                A full weekly training plan tailored to your level, schedule and goals — generated every Monday by your AI coach.
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const planTabStyles = makeReactiveStyles(() => StyleSheet.create({
  scroll: {
    paddingBottom: 40,
    gap: 0,
  },
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: Colors.dark.textMuted,
  },
  card: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  cardActive: {
    backgroundColor: "rgba(139,92,246,0.08)",
    borderColor: "rgba(139,92,246,0.25)",
  },
  cardEmpty: {
    backgroundColor: Colors.dark.chipBackground,
    borderColor: Colors.dark.chipBackgroundStrong,
  },
  cardComingSoon: {
    backgroundColor: Colors.dark.chipBackground,
    borderColor: "rgba(255,255,255,0.07)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(139,92,246,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  cardSubtitle: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  comingSoonBadge: {
    backgroundColor: Colors.dark.primary + "18",
    borderRadius: BorderRadius.full ?? 999,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  comingSoonText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: Colors.dark.primary,
  },
  bulletList: {
    gap: Spacing.sm,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  bulletIconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  bulletLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  bulletText: {
    fontSize: 13,
    color: Colors.dark.text,
    lineHeight: 19,
  },
  placeholderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  placeholderText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.textMuted,
    lineHeight: 19,
  },
}));

export default function PlayerAICoachScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [greetingFetched, setGreetingFetched] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalData, setUpgradeModalData] = useState<{ isPro: boolean; callCount: number; limit: number; resetDate?: string }>({ isPro: false, callCount: 0, limit: 5 });
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [introChecked, setIntroChecked] = useState(false);
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // ===========================================================================
  // Task #1419 + #1426 — single god-query for the AI Coach tab.
  //
  // BEFORE: PlayerAICoachScreen fanned out SEVEN parallel React Query
  // calls on mount (4 here in the parent + 3 inside MyMirrorTab /
  // GlowPlanTab). On iOS that fanout serialised on the JS<->native
  // bridge after the splash hand-off and made the tab feel "stuck"
  // until the user nudged the screen.
  //
  // AFTER: ONE call to /api/player/me/ai-coach-data which the server
  // resolves via in-process dispatch (server/routes/player-ai-coach-data.ts).
  // The 4 derived reads in this component (contextData, aiStatus,
  // monthlyAssessmentData, digest) come straight from god-data, and the
  // training-history / weekly-plan / sessions slices are passed down to
  // MyMirrorTab and GlowPlanTab as props (the per-tile useQuery calls
  // were removed in Task #1426).
  //
  // The seed effect below STILL primes legacy queryKeys via
  // queryClient.setQueryData — not for the subcomponents, but for OTHER
  // screens that consume those keys (PlayerProgressScreen reads
  // weekly-plan, PlayerScheduleScreen reads sessions, PlayerTrainingScreen
  // reads training-history, PlayerDNABanner reads ai-coach/context). The
  // seed lets those screens render warm when the user navigates to them
  // after the AI Coach tab.
  // ===========================================================================
  type AiCoachData = {
    weeklyPlan: WeeklyPlan | null;
    sessions: PlayerSession[];
    trainingHistory: TrainingSession[];
    aiCoachContext: {
      dataMaturity: DataMaturity;
      glowMirrorLayers?: GlowMirrorLayers;
      hasHistory: boolean;
    } | null;
    aiProStatus: {
      isPro: boolean;
      isCoach: boolean;
      callCount: number;
      limit: number;
    } | null;
    monthlyAssessment: MonthlyAssessmentResponse | null;
    weeklyDigest: WeeklyDigest | null;
  };
  const { data: aiCoachData } = useQuery<AiCoachData>({
    queryKey: ["/api/player/me/ai-coach-data"],
    // Match the server-side 30s in-memory cache. Mirrors the home /
    // progress / play / community god-routes.
    staleTime: 30 * 1000,
  });

  // Seed legacy queryKeys for OTHER screens (PlayerProgressScreen,
  // PlayerScheduleScreen, PlayerTrainingScreen, PlayerDNABanner) that
  // still consume the per-feature endpoints. We seed only when the
  // corresponding god-route branch resolved non-null — preserves legacy
  // behaviour where a transient backend hiccup leaves the key empty
  // rather than locked into a stale-null for 30s.
  useEffect(() => {
    if (!aiCoachData) return;
    if (aiCoachData.aiCoachContext) {
      queryClient.setQueryData(
        ["/api/player/me/ai-coach/context"],
        aiCoachData.aiCoachContext,
      );
    }
    if (aiCoachData.aiProStatus) {
      queryClient.setQueryData(
        ["/api/ai-pro/status"],
        aiCoachData.aiProStatus,
      );
    }
    queryClient.setQueryData(
      ["/api/player/me/monthly-assessment/current"],
      aiCoachData.monthlyAssessment ?? null,
    );
    queryClient.setQueryData(
      ["/api/player/me/weekly-digest"],
      aiCoachData.weeklyDigest ?? null,
    );
    queryClient.setQueryData(
      ["/api/player/me/weekly-plan"],
      aiCoachData.weeklyPlan ?? null,
    );
    queryClient.setQueryData(
      ["/api/player/me/sessions"],
      aiCoachData.sessions ?? [],
    );
    queryClient.setQueryData(
      ["/api/player/training-history"],
      aiCoachData.trainingHistory ?? [],
    );
  }, [aiCoachData, queryClient]);

  // Derived reads — same shape as the old standalone useQueries so the
  // rest of the screen reads identically.
  const contextData = aiCoachData?.aiCoachContext ?? undefined;
  const aiStatus = aiCoachData?.aiProStatus ?? undefined;
  const monthlyAssessmentData = aiCoachData?.monthlyAssessment ?? undefined;
  const digest = aiCoachData?.weeklyDigest ?? undefined;

  const dataMaturity = contextData?.dataMaturity;
  const hasHistory = contextData?.hasHistory ?? false;
  const sessionCount = dataMaturity?.sessionCount ?? null;
  const maturityLevel = dataMaturity?.maturityLevel ?? null;
  const glowMirrorLayers = contextData?.glowMirrorLayers ?? null;

  const showOnboarding = sessionCount === 0 && !onboardingDone;
  const showBanner = !bannerDismissed && sessionCount !== null && sessionCount > 0 && sessionCount < 8;

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const streamChat = async (msgs: Message[], isGreeting = false) => {
    try {
      const resp = await apiFetch("/api/player/me/ai-coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs }),
      });

      if (resp.status === 429) {
        let quotaMsg = "Je AI-limiet voor vandaag is bereikt — probeer het morgen opnieuw.";
        try {
          const data = await resp.json() as { message?: string };
          if (data.message) quotaMsg = data.message;
        } catch {}
        Alert.alert("AI-limiet bereikt", quotaMsg, [{ text: "OK" }]);
        setIsLoading(false);
        return;
      }

      if (resp.status === 402) {
        const errorData = await resp.json().catch(() => ({})) as { error?: string; code?: string; isPro?: boolean; callCount?: number; limit?: number; message?: string };
        if (errorData.error === "ai_quota_exceeded" || errorData.code === "ai_quota_exceeded") {
          const isPro = errorData.isPro ?? false;
          const callCount = errorData.callCount ?? 0;
          const limit = errorData.limit ?? (isPro ? 200 : 5);
          let resetDate: string | undefined;
          if (isPro) {
            const rd = new Date();
            rd.setMonth(rd.getMonth() + 1, 1);
            rd.setHours(0, 0, 0, 0);
            resetDate = rd.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
          }
          setIsLoading(false);
          setUpgradeModalData({ isPro, callCount, limit, resetDate });
          setShowUpgradeModal(true);
          setMessages((prev) => {
            const copy = [...prev];
            if (copy[copy.length - 1]?.role === "user") {
              copy.pop();
            }
            return copy;
          });
          return;
        }
        throw new Error(`Server error: ${resp.status}`);
      }
      if (!resp.ok) {
        throw new Error(`Server error: ${resp.status}`);
      }

      const data = await resp.json() as { reply?: string };
      const reply = typeof data.reply === "string" && data.reply.trim()
        ? data.reply
        : isGreeting
          ? "Welcome! I'm your personal AI coach. Ask me anything about your game, what to focus on, or how you've been progressing."
          : "Sorry, I had trouble connecting right now. Please try again in a moment.";

      if (isGreeting) {
        setMessages([{ role: "assistant", content: reply }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      }
      scrollToBottom();

      if (!isGreeting) {
        // Task #1419 — invalidate the legacy key AND both god-routes
        // that fold ai-pro/status (home-data + ai-coach-data). Only
        // invalidating the legacy key would leave the home banner
        // and the AI Coach derived `aiStatus` reading stale callCount
        // until the 30s server-side TTL expires. Server already
        // evicts its own caches on the same chat call (see
        // server/routes/player-progress.ts), so refetch will see
        // the fresh count.
        queryClient.invalidateQueries({ queryKey: ["/api/ai-pro/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/ai-coach-data"] });
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
      }
    } catch (err) {
      console.error("[PlayerAICoach] Chat error:", err);
      const fallback = isGreeting
        ? "Welcome! I'm your personal AI coach. Ask me anything about your game, what to focus on, or how you've been progressing."
        : "Sorry, I had trouble connecting right now. Please try again in a moment.";
      if (isGreeting) {
        setMessages([{ role: "assistant", content: fallback }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: fallback }]);
      }
      scrollToBottom();
    }
  };

  const fetchAIGreeting = async () => {
    try {
      await streamChat([{ role: "user", content: "__greeting__" }], true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    AsyncStorage.getItem(AI_COACH_INTRO_SEEN_KEY).then((val) => {
      if (!val) {
        setShowIntroModal(true);
      }
      setIntroChecked(true);
    }).catch(() => {
      setIntroChecked(true);
    });
  }, []);

  const handleIntroStart = () => {
    AsyncStorage.setItem(AI_COACH_INTRO_SEEN_KEY, "1").catch(() => {});
    setShowIntroModal(false);
  };

  useEffect(() => {
    if (!greetingFetched && !showOnboarding && !showIntroModal && introChecked) {
      setGreetingFetched(true);
      fetchAIGreeting();
    }
  }, [showOnboarding, showIntroModal, introChecked]);

  const openUpgradeModal = () => {
    const isPro = aiStatus?.isPro ?? false;
    const callCount = aiStatus?.callCount ?? 0;
    const limit = aiStatus?.limit ?? 5;
    let resetDate: string | undefined;
    if (isPro) {
      const rd = new Date();
      rd.setMonth(rd.getMonth() + 1, 1);
      rd.setHours(0, 0, 0, 0);
      resetDate = rd.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    }
    setUpgradeModalData({ isPro, callCount, limit, resetDate });
    setShowUpgradeModal(true);
  };

  const remaining = aiStatus && !aiStatus.isCoach && !aiStatus.isPro
    ? Math.max(aiStatus.limit - aiStatus.callCount, 0)
    : null;

  const isOutOfMessages = remaining !== null && remaining === 0;

  const sendMessage = async (text?: string) => {
    const content = (text ?? inputText).trim();
    if (!content || isLoading) return;

    if (isOutOfMessages) {
      openUpgradeModal();
      return;
    }

    const userMsg: Message = { role: "user", content };
    const next = [...messages, userMsg];
    setMessages(next);
    setInputText("");
    setIsLoading(true);
    scrollToBottom();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await streamChat(next);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOnboardingStart = () => {
    setOnboardingDone(true);
    if (!greetingFetched) {
      setGreetingFetched(true);
      setIsLoading(true);
      fetchAIGreeting();
    }
  };

  const QUICK_QUESTIONS = [
    "What should I focus on this week?",
    "How is my game improving?",
    "What is my biggest weakness right now?",
    "Am I ready to move up a level?",
  ];

  const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "chat", label: "Chat", icon: "chatbubble-ellipses" },
    { key: "mirror", label: "My Mirror", icon: "mic" },
    { key: "plan", label: "Glow Plan", icon: "sparkles" },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerIcon}>
            <Ionicons name="sparkles" size={16} color={Colors.dark.buttonText} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Coach Hub</Text>
            <Text style={styles.headerSub}>Powered by your coaching data</Text>
          </View>
        </View>
        <View style={styles.usagePillWrap}>
          {aiStatus && !aiStatus.isCoach && aiStatus.limit > 0 ? (() => {
            const rem = Math.max(aiStatus.limit - aiStatus.callCount, 0);
            const isLow = rem <= 2;
            const pillColor = isLow ? Colors.dark.error : Colors.dark.primary;
            return (
              <View style={[
                styles.usagePill,
                isLow && { borderColor: pillColor + "60", backgroundColor: pillColor + "18" },
              ]}>
                {aiStatus.isPro ? (
                  <Ionicons name="sparkles" size={10} color={pillColor} style={{ marginRight: 3 }} />
                ) : null}
                <Text style={[
                  styles.usagePillText,
                  isLow && { color: pillColor },
                ]}>
                  {`${rem} left`}
                </Text>
              </View>
            );
          })() : null}
        </View>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab(tab.key);
              }}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={isActive ? Colors.dark.primary : Colors.dark.textMuted}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Tab Content */}
      {activeTab === "chat" ? (
        showOnboarding ? (
          <ScrollView
            contentContainerStyle={[styles.onboardingScroll, { paddingBottom: insets.bottom + Spacing.xl }]}
            showsVerticalScrollIndicator={false}
          >
            <OnboardingSplash onStart={handleOnboardingStart} />
          </ScrollView>
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            {showBanner && dataMaturity ? (
              <MaturityBanner dataMaturity={dataMaturity} onDismiss={() => setBannerDismissed(true)} />
            ) : null}

            <ScrollView
              ref={scrollRef}
              style={styles.messageList}
              contentContainerStyle={styles.messageListContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={scrollToBottom}
            >
              {messages.length === 0 && isLoading ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="sparkles" size={32} color={ACCENT} />
                  </View>
                  <Text style={styles.emptyTitle}>Your Personal AI Coach</Text>
                  <Text style={styles.emptyDesc}>
                    I know your game from every session your coach has logged. Ask me anything.
                  </Text>
                  {hasHistory ? (
                    <View style={styles.continuingBanner}>
                      <Ionicons name="time-outline" size={13} color={Colors.dark.primary} />
                      <Text style={styles.continuingBannerText}>Continuing from where we left off...</Text>
                    </View>
                  ) : null}
                  <TypingIndicator />
                </View>
              ) : messages.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="sparkles" size={32} color={ACCENT} />
                  </View>
                  <Text style={styles.emptyTitle}>Your Personal AI Coach</Text>
                  <Text style={styles.emptyDesc}>
                    I know your game from every session your coach has logged. Ask me anything.
                  </Text>
                  <View style={styles.quickQuestions}>
                    {QUICK_QUESTIONS.map((q) => (
                      <Pressable
                        key={q}
                        style={styles.quickChip}
                        onPress={() => sendMessage(q)}
                      >
                        <Text style={styles.quickChipText}>{q}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <MessageBubble key={i} message={msg} />
                  ))}
                  {isLoading && messages[messages.length - 1]?.role === "user" ? (
                    <TypingIndicator />
                  ) : null}
                  {!isLoading && remaining !== null && remaining > 0 && messages.length > 0 && messages[messages.length - 1]?.role === "assistant" ? (
                    <View style={styles.remainingBanner}>
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={13}
                        color={remaining <= 1 ? Colors.dark.error : remaining <= 2 ? "#F59E0B" : Colors.dark.textMuted}
                      />
                      <Text style={[
                        styles.remainingBannerText,
                        remaining <= 1 && { color: Colors.dark.error },
                        remaining === 2 && { color: "#F59E0B" },
                      ]}>
                        {remaining} message{remaining !== 1 ? "s" : ""} left this month
                      </Text>
                    </View>
                  ) : null}
                </>
              )}
            </ScrollView>

            {isOutOfMessages ? (
              <Pressable
                style={[styles.lockedBar, { paddingBottom: insets.bottom + Spacing.sm }]}
                onPress={openUpgradeModal}
              >
                <View style={styles.lockedBarInner}>
                  <Ionicons name="lock-closed" size={16} color={Colors.dark.textMuted} />
                  <Text style={styles.lockedBarText}>No messages left — upgrade to continue</Text>
                  <View style={styles.lockedUpgradeBtn}>
                    <Text style={styles.lockedUpgradeBtnText}>Upgrade</Text>
                  </View>
                </View>
              </Pressable>
            ) : (
              <View style={[styles.inputRow, { paddingBottom: insets.bottom + Spacing.sm }]}>
                <TextInput
                  style={styles.input}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Ask your coach anything..."
                  placeholderTextColor={Colors.dark.textMuted}
                  multiline
                  maxLength={500}
                  showsVerticalScrollIndicator={false}
                  onSubmitEditing={() => sendMessage()}
                  blurOnSubmit={false}
                />
                <Pressable
                  onPress={() => sendMessage()}
                  disabled={!inputText.trim() || isLoading}
                  style={[
                    styles.sendBtn,
                    { opacity: !inputText.trim() || isLoading ? 0.4 : 1 },
                  ]}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                  ) : (
                    <Ionicons name="send" size={18} color={Colors.dark.buttonText} />
                  )}
                </Pressable>
              </View>
            )}
          </KeyboardAvoidingView>
        )
      ) : activeTab === "mirror" ? (
        <MyMirrorTab
          glowMirrorLayers={glowMirrorLayers}
          monthlyAssessmentData={monthlyAssessmentData}
          onOpenMonthlyModal={() => setShowMonthlyModal(true)}
          trainingHistory={aiCoachData?.trainingHistory ?? null}
        />
      ) : (
        <GlowPlanTab
          digest={digest ?? null}
          weeklyPlan={aiCoachData?.weeklyPlan ?? null}
          allSessions={aiCoachData?.sessions ?? null}
        />
      )}

      <AiProUpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        callCount={upgradeModalData.callCount}
        limit={upgradeModalData.limit}
        isPro={upgradeModalData.isPro}
        resetDate={upgradeModalData.resetDate}
        onSubscribed={() => {
          // Task #1419 — subscription change flips isPro / limit, so
          // also evict the home-data + ai-coach-data caches that
          // bundle ai-pro/status. Otherwise the upgrade modal closes
          // but the banner keeps saying "5/5 used" for 30s.
          queryClient.invalidateQueries({ queryKey: ["/api/ai-pro/status"] });
          queryClient.invalidateQueries({ queryKey: ["/api/player/me/ai-coach-data"] });
          queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
        }}
      />

      <FeatureIntroModal
        visible={showIntroModal}
        isPro={aiStatus?.isPro ?? false}
        callCount={aiStatus?.callCount ?? 0}
        limit={aiStatus?.limit ?? 5}
        glowMirrorLayers={contextData?.glowMirrorLayers ?? null}
        onStart={handleIntroStart}
        onUpgrade={() => {
          handleIntroStart();
          setUpgradeModalData({
            isPro: false,
            callCount: aiStatus?.callCount ?? 0,
            limit: aiStatus?.limit ?? 5,
          });
          setShowUpgradeModal(true);
        }}
      />

      <MonthlyAssessmentModal
        visible={showMonthlyModal}
        onClose={() => setShowMonthlyModal(false)}
        existingAssessment={monthlyAssessmentData?.assessment}
      />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "700",
  },
  headerSub: {
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  usagePillWrap: {
    minWidth: 70,
    alignItems: "flex-end",
  },
  usagePill: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full ?? 999,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  usagePillFull: {
    borderColor: Colors.dark.error + "60",
    backgroundColor: Colors.dark.error + "15",
  },
  usagePillText: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  usagePillTextFull: {
    color: Colors.dark.error,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: {
    borderBottomColor: Colors.dark.primary,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  tabLabelActive: {
    color: Colors.dark.primary,
  },
  onboardingScroll: {
    flexGrow: 1,
    padding: Spacing.lg,
  },
  onboardingContainer: {
    flex: 1,
    alignItems: "center",
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },
  onboardingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.primary + "1A",
    borderWidth: 1.5,
    borderColor: Colors.dark.primary + "40",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  onboardingTitle: {
    color: Colors.dark.text,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  onboardingDesc: {
    color: Colors.dark.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: Spacing.md,
  },
  milestonesCard: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
    marginTop: Spacing.xs,
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  milestoneRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
  },
  milestoneDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1.5,
    borderColor: Colors.dark.primary + "50",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  milestoneDotText: {
    color: Colors.dark.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  milestoneInfo: {
    flex: 1,
  },
  milestoneLabel: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "600",
  },
  milestoneSub: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  milestoneBadge: {
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  milestoneBadgeText: {
    color: Colors.dark.primary,
    fontSize: 10,
    fontWeight: "700",
  },
  onboardingHint: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: Spacing.md,
  },
  onboardingCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
  },
  onboardingCtaText: {
    color: Colors.dark.buttonText,
    fontSize: 15,
    fontWeight: "700",
  },
  maturityBanner: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  maturityBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  maturityBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  maturityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: BorderRadius.full ?? 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  maturityPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  maturityProgressTrack: {
    height: 3,
    flexDirection: "row",
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  maturityProgressFill: {
    borderRadius: 2,
  },
  maturityBannerSub: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  emptyState: {
    alignItems: "center",
    gap: Spacing.md,
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ACCENT + "18",
    borderWidth: 1.5,
    borderColor: ACCENT + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyDesc: {
    color: Colors.dark.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  continuingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: BorderRadius.full ?? 999,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  continuingBannerText: {
    color: Colors.dark.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  quickQuestions: {
    width: "100%",
    gap: Spacing.xs,
  },
  quickChip: {
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    padding: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
  },
  quickChipText: {
    color: Colors.dark.textSubtle,
    fontSize: 14,
    lineHeight: 20,
  },
  remainingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.xs,
  },
  remainingBannerText: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  aiBubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.xs,
    maxWidth: "88%",
    alignSelf: "flex-start",
  },
  userBubbleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    maxWidth: "88%",
    alignSelf: "flex-end",
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginBottom: 2,
  },
  bubble: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    maxWidth: "100%",
  },
  aiBubble: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    flex: 1,
  },
  userBubble: {
    backgroundColor: Colors.dark.primary,
  },
  aiLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: ACCENT,
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  bubbleText: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 20,
  },
  userBubbleText: {
    color: Colors.dark.buttonText,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    color: Colors.dark.text,
    fontSize: 15,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  lockedBar: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  lockedBarInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    padding: Spacing.md,
  },
  lockedBarText: {
    flex: 1,
    color: Colors.dark.textMuted,
    fontSize: 13,
  },
  lockedUpgradeBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  lockedUpgradeBtnText: {
    color: Colors.dark.buttonText,
    fontSize: 13,
    fontWeight: "700",
  },
}));
