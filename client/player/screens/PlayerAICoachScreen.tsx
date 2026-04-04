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
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";
import AiProUpgradeModal from "@/player/components/AiProUpgradeModal";

interface Message {
  role: "user" | "assistant";
  content: string;
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

export default function PlayerAICoachScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [greetingFetched, setGreetingFetched] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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
    if (!greetingFetched) {
      setGreetingFetched(true);
      fetchAIGreeting();
    }
  }, []);

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
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
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
    paddingTop: Spacing.xxl,
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
