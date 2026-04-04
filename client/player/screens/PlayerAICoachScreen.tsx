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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";
import AiProUpgradeModal from "@/player/components/AiProUpgradeModal";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [greetingFetched, setGreetingFetched] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const { data: contextData } = useQuery<{ dataMaturity: DataMaturity }>({
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
  const sessionCount = dataMaturity?.sessionCount ?? null;
  const maturityLevel = dataMaturity?.maturityLevel ?? null;

  const showOnboarding = sessionCount === 0 && !onboardingDone;
  const showBanner = !bannerDismissed && sessionCount !== null && sessionCount > 0 && sessionCount < 8;

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const streamChat = async (msgs: Message[], isGreeting = false) => {
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";
    let started = false;

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
        const errorData = await resp.json().catch(() => ({}));
        if (errorData.code === "ai_quota_exceeded") {
          setIsLoading(false);
          setShowUpgradeModal(true);
          setMessages((prev) => {
            const withoutLast = [...prev];
            if (withoutLast[withoutLast.length - 1]?.role === "user") {
              withoutLast.pop();
            }
            return withoutLast;
          });
          return;
        }
        throw new Error(`Server error: ${resp.status}`);
      }
      if (!resp.ok) {
        throw new Error(`Server error: ${resp.status}`);
      }
      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No stream reader available");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") {
            reader.cancel();
            break;
          }
          try {
            const parsed = JSON.parse(payload);
            if (parsed.token) {
              accumulated += parsed.token;
              if (!started) {
                if (isGreeting) {
                  setMessages([{ role: "assistant", content: accumulated }]);
                } else {
                  setMessages((prev) => [...prev, { role: "assistant", content: accumulated }]);
                }
                started = true;
              } else {
                setMessages((prev) => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: "assistant", content: accumulated };
                  return copy;
                });
              }
              scrollToBottom();
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("[PlayerAICoach] Stream error:", err);
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
    if (!greetingFetched && !showOnboarding) {
      setGreetingFetched(true);
      fetchAIGreeting();
    }
  }, [showOnboarding]);

  const sendMessage = async (text?: string) => {
    const content = (text ?? inputText).trim();
    if (!content || isLoading) return;

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
          {aiStatus && !aiStatus.isCoach && !aiStatus.isPro && aiStatus.limit > 0 ? (
            <View style={[
              styles.usagePill,
              aiStatus.callCount >= aiStatus.limit && styles.usagePillFull,
            ]}>
              <Text style={[
                styles.usagePillText,
                aiStatus.callCount >= aiStatus.limit && styles.usagePillTextFull,
              ]}>
                {aiStatus.callCount} / {aiStatus.limit} used
              </Text>
            </View>
          ) : aiStatus && aiStatus.isPro ? (
            <View style={styles.usagePillPro}>
              <Ionicons name="sparkles" size={10} color={Colors.dark.primary} />
              <Text style={styles.usagePillProText}>Unlimited</Text>
            </View>
          ) : null}
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
              </>
            )}
          </ScrollView>

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
        </KeyboardAvoidingView>
      )}

      <AiProUpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
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
  usagePillPro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: BorderRadius.full ?? 999,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  usagePillProText: {
    color: Colors.dark.primary,
    fontSize: 11,
    fontWeight: "700",
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
