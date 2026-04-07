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
import AsyncStorage from "@react-native-async-storage/async-storage";

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

const AI_LABEL = "AI Coach";
const ACCENT = Colors.dark.primary;

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
        <Ionicons name="sparkles" size={12} color={Colors.dark.backgroundRoot} />
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
        <Ionicons name="sparkles" size={12} color={Colors.dark.backgroundRoot} />
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
                <Ionicons name="chatbubble-ellipses" size={16} color={Colors.dark.backgroundRoot} />
                <Text style={introStyles.ctaBtnText}>Try Free ({remaining} message{remaining !== 1 ? "s" : ""})</Text>
              </Pressable>
              <Pressable style={introStyles.upgradeBtn} onPress={onUpgrade}>
                <Ionicons name="flash" size={15} color={Colors.dark.primary} />
                <Text style={introStyles.upgradeBtnText}>Unlock Full Access — 200 msg/month</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={introStyles.ctaBtn} onPress={onStart}>
              <Ionicons name="chatbubble-ellipses" size={16} color={Colors.dark.backgroundRoot} />
              <Text style={introStyles.ctaBtnText}>Start Chatting</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const introStyles = StyleSheet.create({
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
    backgroundColor: "rgba(255,255,255,0.04)",
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
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
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
    color: Colors.dark.backgroundRoot,
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
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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
    backgroundColor: "rgba(255,255,255,0.04)",
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
});

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
        <Ionicons name="chatbubble-ellipses" size={16} color={Colors.dark.backgroundRoot} />
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

export default function PlayerAICoachScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
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
  const scrollRef = useRef<ScrollView>(null);

  const { data: contextData } = useQuery<{ dataMaturity: DataMaturity; glowMirrorLayers?: GlowMirrorLayers; hasHistory: boolean }>({
    queryKey: ["/api/player/me/ai-coach/context"],
    staleTime: 60 * 1000,
  });

  const { data: aiStatus } = useQuery<{
    isPro: boolean;
    isCoach: boolean;
    callCount: number;
    limit: number;
  }>({
    queryKey: ["/api/ai-pro/status"],
    staleTime: 60 * 1000,
    retry: false,
  });

  const dataMaturity = contextData?.dataMaturity;
  const hasHistory = contextData?.hasHistory ?? false;
  const sessionCount = dataMaturity?.sessionCount ?? null;
  const maturityLevel = dataMaturity?.maturityLevel ?? null;

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
        queryClient.invalidateQueries({ queryKey: ["/api/ai-pro/status"] });
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerIcon}>
            <Ionicons name="sparkles" size={16} color={Colors.dark.backgroundRoot} />
          </View>
          <View>
            <Text style={styles.headerTitle}>My AI Coach</Text>
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

      {showOnboarding ? (
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
                  <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                ) : (
                  <Ionicons name="send" size={18} color={Colors.dark.backgroundRoot} />
                )}
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      <AiProUpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        callCount={upgradeModalData.callCount}
        limit={upgradeModalData.limit}
        isPro={upgradeModalData.isPro}
        resetDate={upgradeModalData.resetDate}
        onSubscribed={() => queryClient.invalidateQueries({ queryKey: ["/api/ai-pro/status"] })}
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
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderBottomColor: "rgba(255,255,255,0.06)",
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
    borderColor: "rgba(255,255,255,0.12)",
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
    borderBottomColor: "rgba(255,255,255,0.06)",
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
    color: Colors.dark.backgroundRoot,
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
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
    flexDirection: "row",
  },
  maturityProgressFill: {
    height: 3,
    borderRadius: 2,
  },
  maturityBannerSub: {
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    paddingTop: Spacing["2xl"],
    gap: Spacing.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.dark.primary + "40",
    marginBottom: Spacing.xs,
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyDesc: {
    color: Colors.dark.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: Spacing.lg,
  },
  quickQuestions: {
    width: "100%",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  quickChip: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  quickChipText: {
    color: Colors.dark.text,
    fontSize: 14,
  },
  aiBubbleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  userBubbleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: Spacing.xs,
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  aiBubble: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  userBubble: {
    backgroundColor: Colors.dark.primary + "25",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
  },
  aiLabel: {
    color: Colors.dark.primary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  bubbleText: {
    color: Colors.dark.text,
    fontSize: 14,
    lineHeight: 20,
  },
  userBubbleText: {
    color: Colors.dark.text,
  },
  remainingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  remainingBannerText: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  continuingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary + "14",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "35",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.sm,
  },
  continuingBannerText: {
    color: Colors.dark.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  lockedBar: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  lockedBarInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  lockedBarText: {
    flex: 1,
    color: Colors.dark.textMuted,
    fontSize: 14,
  },
  lockedUpgradeBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  lockedUpgradeBtnText: {
    color: Colors.dark.backgroundRoot,
    fontSize: 13,
    fontWeight: "700",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: Colors.dark.text,
    fontSize: 14,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
