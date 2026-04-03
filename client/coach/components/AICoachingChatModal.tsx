import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PlayerContext {
  playerName: string;
  playerAge: number | null;
  ballLevel: string;
  sessionType: string;
  requiredSkills: { skillName: string; pillar: string; targetScore: number; currentScore: number | null; required: boolean }[];
}

interface StructuredSummary {
  sessionNote: string;
  overall: string;
  effort: number;
  execution: number;
  understanding: number;
  techniquePillar?: number;
  tacticalPillar?: number;
  physicalPillar?: number;
  mentalPillar?: number;
  skillRatings: { skillName: string; score: number }[];
  levelUpFlag: boolean;
  levelUpMessage: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  sessionId: string;
  playerId: string;
  playerName: string;
}

function getDraftKey(sessionId: string, playerId: string): string {
  return `ai-chat-draft-${sessionId}-${playerId}`;
}

function parseStructuredSummary(text: string): StructuredSummary | null {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.sessionNote && parsed.overall) return parsed as StructuredSummary;
  } catch { /* ignore */ }
  return null;
}

function getOverallLabel(val: string): string {
  if (val === "improved") return "Improved";
  if (val === "declined") return "Needs attention";
  return "Stable";
}

function getOverallColor(val: string): string {
  if (val === "improved") return Colors.dark.primary;
  if (val === "declined") return Colors.dark.error;
  return Colors.dark.textMuted;
}

function getRatingLabel(score: number): string {
  if (score >= 2) return "Good";
  if (score >= 1) return "Developing";
  return "Needs attention";
}

const WRAP_UP_PROMPT =
  "Please wrap up our conversation now. Based on everything we've discussed, generate the structured JSON summary block to close this coaching session.";

export function AICoachingChatModal({ visible, onClose, sessionId, playerId, playerName }: Props) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [pendingSummary, setPendingSummary] = useState<StructuredSummary | null>(null);
  const [levelUpChoice, setLevelUpChoice] = useState<boolean | null>(null);
  const [resumedDraft, setResumedDraft] = useState(false);
  // isDraftHydrated guards both greeting and persistence effects from running
  // before the AsyncStorage restore attempt has finished.
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Load player context
  const { data: ctx, isLoading: ctxLoading } = useQuery<PlayerContext>({
    queryKey: [`/api/sessions/${sessionId}/players/${playerId}/ai-chat/context`],
    enabled: visible && !!sessionId && !!playerId,
    staleTime: Infinity,
  });

  // Restore draft on open — sets isDraftHydrated when done (with or without a draft)
  useEffect(() => {
    if (!visible || !sessionId || !playerId) return;
    setIsDraftHydrated(false);
    const key = getDraftKey(sessionId, playerId);
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (raw) {
          try {
            const draft: Message[] = JSON.parse(raw);
            if (Array.isArray(draft) && draft.length > 0) {
              setMessages(draft);
              setResumedDraft(true);
              // If the last assistant message contains a summary, restore it
              for (let i = draft.length - 1; i >= 0; i--) {
                if (draft[i].role === "assistant") {
                  const summary = parseStructuredSummary(draft[i].content);
                  if (summary) setPendingSummary(summary);
                  break;
                }
              }
            }
          } catch { /* ignore bad draft */ }
        }
      })
      .catch(() => { /* ignore storage errors */ })
      .finally(() => {
        setIsDraftHydrated(true);
      });
  }, [visible, sessionId, playerId]);

  // Initial greeting when context loads — only after hydration and only if no draft
  useEffect(() => {
    if (!isDraftHydrated) return;
    if (ctx && messages.length === 0 && !resumedDraft) {
      const requiredList = ctx.requiredSkills.filter((s) => s.required).slice(0, 3);
      const skillHint =
        requiredList.length > 0
          ? ` Key curriculum skills to cover: ${requiredList.map((s) => s.skillName).join(", ")}.`
          : "";
      const greeting = `You just finished a ${ctx.sessionType} session with ${ctx.playerName}${ctx.playerAge ? ` (age ${ctx.playerAge})` : ""} at ${ctx.ballLevel} ball level.${skillHint} What was the main focus of today's session?`;
      setMessages([{ role: "assistant", content: greeting }]);
    }
  }, [ctx, isDraftHydrated, messages.length, resumedDraft]);

  // Persist draft on every messages change — only after hydration to avoid overwriting
  useEffect(() => {
    if (!isDraftHydrated || !sessionId || !playerId || !visible) return;
    if (messages.length === 0) return;
    const key = getDraftKey(sessionId, playerId);
    AsyncStorage.setItem(key, JSON.stringify(messages)).catch(() => {});
  }, [messages, sessionId, playerId, visible, isDraftHydrated]);

  // Reset on close
  useEffect(() => {
    if (!visible) {
      setMessages([]);
      setInputText("");
      setPendingSummary(null);
      setLevelUpChoice(null);
      setResumedDraft(false);
      setIsDraftHydrated(false);
    }
  }, [visible]);

  // Chat turn mutation
  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const updatedMessages: Message[] = [
        ...messages,
        { role: "user", content: userMessage },
      ];
      setMessages(updatedMessages);
      const res = await apiRequest("POST", `/api/sessions/${sessionId}/players/${playerId}/ai-chat`, {
        messages: updatedMessages,
      });
      if (res.status === 429) {
        const data = await res.json() as { error: string; message: string };
        throw Object.assign(new Error(data.message || "Quota exceeded"), { isQuota: true, serverMessage: data.message });
      }
      const data = await res.json() as { reply: string | null };
      return { reply: data.reply, userMessages: updatedMessages };
    },
    onSuccess: ({ reply, userMessages }) => {
      const replyText = reply ?? "AI coaching is unavailable right now.";
      const withReply: Message[] = [...userMessages, { role: "assistant", content: replyText }];
      setMessages(withReply);
      const summary = parseStructuredSummary(replyText);
      if (summary) setPendingSummary(summary);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    },
    onError: (err: any) => {
      if (err.isQuota) {
        Alert.alert(
          "AI-limiet bereikt",
          err.serverMessage || "Je AI-limiet voor vandaag is bereikt — probeer het morgen opnieuw.",
          [{ text: "OK" }]
        );
        setMessages((prev) => prev.slice(0, -1));
      }
    },
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!pendingSummary) throw new Error("No summary");
      const finalSummary = {
        ...pendingSummary,
        levelUpFlag: levelUpChoice !== null ? levelUpChoice : pendingSummary.levelUpFlag,
      };
      return apiRequest("POST", `/api/sessions/${sessionId}/players/${playerId}/ai-chat/commit`, {
        messages,
        structured: finalSummary,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      AsyncStorage.removeItem(getDraftKey(sessionId, playerId)).catch(() => {});
      onClose();
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Could not save session",
        "Something went wrong while saving the session notes. Please try again.",
        [{ text: "OK" }]
      );
    },
  });

  const sendMessage = () => {
    const text = inputText.trim();
    if (!text || chatMutation.isPending) return;
    setInputText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    chatMutation.mutate(text);
  };

  const handleWrapUp = () => {
    if (chatMutation.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    chatMutation.mutate(WRAP_UP_PROMPT);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <View style={styles.headerLeft}>
            <View style={styles.aiIcon}>
              <Ionicons name="sparkles" size={16} color={Colors.dark.backgroundRoot} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Coach with AI</Text>
              <Text style={styles.headerSubtitle}>{playerName}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {!pendingSummary ? (
              <Pressable
                style={[styles.wrapUpButton, chatMutation.isPending && { opacity: 0.4 }]}
                onPress={handleWrapUp}
                disabled={chatMutation.isPending || messages.length < 2}
              >
                <Ionicons name="checkmark-done" size={14} color={Colors.dark.primary} />
                <Text style={styles.wrapUpButtonText}>Wrap Up</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
        </View>

        {ctxLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
            <Text style={styles.loadingText}>Loading player context...</Text>
          </View>
        ) : (
          <>
            {/* Messages */}
            <ScrollView
              ref={scrollRef}
              style={styles.messageList}
              contentContainerStyle={styles.messageListContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {resumedDraft && messages.length > 0 ? (
                <View style={styles.resumeBanner}>
                  <Ionicons name="time-outline" size={13} color={Colors.dark.textMuted} />
                  <Text style={styles.resumeBannerText}>Resuming previous chat</Text>
                </View>
              ) : null}

              {messages.map((msg, i) => (
                <View
                  key={i}
                  style={[
                    styles.messageBubble,
                    msg.role === "user" ? styles.userBubble : styles.aiBubble,
                  ]}
                >
                  {msg.role === "assistant" ? (
                    <View style={styles.aiLabel}>
                      <Ionicons name="sparkles" size={10} color={Colors.dark.primary} />
                      <Text style={styles.aiLabelText}>AI Coach</Text>
                    </View>
                  ) : null}
                  {/* Strip the JSON block from display */}
                  <Text style={[styles.messageText, msg.role === "user" && styles.userMessageText]}>
                    {msg.content.replace(/```json[\s\S]*?```/g, "").trim()}
                  </Text>
                  {msg.role === "assistant" && parseStructuredSummary(msg.content) ? (
                    <View style={styles.summaryBadge}>
                      <Ionicons name="checkmark-circle" size={12} color={Colors.dark.primary} />
                      <Text style={styles.summaryBadgeText}>Session summary ready</Text>
                    </View>
                  ) : null}
                </View>
              ))}

              {chatMutation.isPending ? (
                <View style={styles.aiBubble}>
                  <View style={styles.aiLabel}>
                    <Ionicons name="sparkles" size={10} color={Colors.dark.primary} />
                    <Text style={styles.aiLabelText}>AI Coach</Text>
                  </View>
                  <View style={styles.typingDots}>
                    <ActivityIndicator size="small" color={Colors.dark.textMuted} />
                    <Text style={styles.typingText}>Thinking...</Text>
                  </View>
                </View>
              ) : null}
            </ScrollView>

            {/* Summary Approval Panel */}
            {pendingSummary && !commitMutation.isSuccess ? (
              <View style={styles.summaryPanel}>
                <Text style={styles.summaryTitle}>Session Summary</Text>
                <Text style={styles.summaryNote}>{pendingSummary.sessionNote}</Text>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipLabel}>Overall</Text>
                    <Text style={[styles.summaryChipValue, { color: getOverallColor(pendingSummary.overall) }]}>
                      {getOverallLabel(pendingSummary.overall)}
                    </Text>
                  </View>
                  <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipLabel}>Effort</Text>
                    <Text style={styles.summaryChipValue}>{getRatingLabel(pendingSummary.effort)}</Text>
                  </View>
                  <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipLabel}>Execution</Text>
                    <Text style={styles.summaryChipValue}>{getRatingLabel(pendingSummary.execution)}</Text>
                  </View>
                </View>

                {(pendingSummary.techniquePillar !== undefined ||
                  pendingSummary.tacticalPillar !== undefined ||
                  pendingSummary.physicalPillar !== undefined ||
                  pendingSummary.mentalPillar !== undefined) ? (
                  <View style={styles.pillarRow}>
                    {pendingSummary.techniquePillar !== undefined ? (
                      <View style={styles.pillarChip}>
                        <Text style={styles.pillarChipLabel}>Tech</Text>
                        <Text style={styles.pillarChipValue}>{getRatingLabel(pendingSummary.techniquePillar)}</Text>
                      </View>
                    ) : null}
                    {pendingSummary.tacticalPillar !== undefined ? (
                      <View style={styles.pillarChip}>
                        <Text style={styles.pillarChipLabel}>Tactical</Text>
                        <Text style={styles.pillarChipValue}>{getRatingLabel(pendingSummary.tacticalPillar)}</Text>
                      </View>
                    ) : null}
                    {pendingSummary.physicalPillar !== undefined ? (
                      <View style={styles.pillarChip}>
                        <Text style={styles.pillarChipLabel}>Physical</Text>
                        <Text style={styles.pillarChipValue}>{getRatingLabel(pendingSummary.physicalPillar)}</Text>
                      </View>
                    ) : null}
                    {pendingSummary.mentalPillar !== undefined ? (
                      <View style={styles.pillarChip}>
                        <Text style={styles.pillarChipLabel}>Mental</Text>
                        <Text style={styles.pillarChipValue}>{getRatingLabel(pendingSummary.mentalPillar)}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {pendingSummary.levelUpFlag ? (
                  <View style={styles.levelUpBanner}>
                    <Ionicons name="trophy" size={14} color={Colors.dark.gold} />
                    <Text style={styles.levelUpText}>
                      {pendingSummary.levelUpMessage || `${playerName} may be ready for their next level trial.`}
                    </Text>
                    <View style={styles.levelUpActions}>
                      <Pressable
                        style={[styles.levelUpBtn, levelUpChoice === true && styles.levelUpBtnActive]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setLevelUpChoice(true);
                        }}
                      >
                        <Text style={styles.levelUpBtnText}>Ready</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.levelUpBtn, levelUpChoice === false && styles.levelUpBtnInactive]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setLevelUpChoice(false);
                        }}
                      >
                        <Text style={styles.levelUpBtnText}>Not yet</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                <Text style={styles.saveInfoText}>
                  This will save session notes, skill scores, and progress tracking for {playerName}.
                </Text>

                <View style={styles.summaryActions}>
                  <Pressable
                    style={styles.continueButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPendingSummary(null);
                    }}
                  >
                    <Text style={styles.continueButtonText}>Continue chat</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.saveButton, commitMutation.isPending && { opacity: 0.6 }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      commitMutation.mutate();
                    }}
                    disabled={commitMutation.isPending}
                  >
                    {commitMutation.isPending ? (
                      <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                    ) : (
                      <Ionicons name="checkmark" size={16} color={Colors.dark.backgroundRoot} />
                    )}
                    <Text style={styles.saveButtonText}>
                      {commitMutation.isPending ? "Saving..." : "Save & Close"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Input */}
            {!pendingSummary ? (
              <View style={[styles.inputRow, { paddingBottom: insets.bottom + Spacing.sm }]}>
                <TextInput
                  style={styles.textInput}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Type your response..."
                  placeholderTextColor={Colors.dark.disabled}
                  multiline
                  maxLength={500}
                  returnKeyType="default"
                  showsVerticalScrollIndicator={false}
                />
                <Pressable
                  style={[styles.sendButton, (!inputText.trim() || chatMutation.isPending) && styles.sendButtonDisabled]}
                  onPress={sendMessage}
                  disabled={!inputText.trim() || chatMutation.isPending}
                >
                  <Ionicons name="send" size={18} color={Colors.dark.backgroundRoot} />
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
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
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundTertiary,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  aiIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  headerSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  wrapUpButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
    backgroundColor: Colors.dark.primary + "12",
  },
  wrapUpButtonText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
    fontSize: 12,
  },
  closeButton: {
    padding: Spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  resumeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    alignSelf: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full ?? 999,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginBottom: Spacing.sm,
  },
  resumeBannerText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  messageBubble: {
    maxWidth: "88%",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xs,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: Colors.dark.primary + "20",
    borderTopRightRadius: BorderRadius.xs,
  },
  aiLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginBottom: 2,
  },
  aiLabelText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
    fontSize: 10,
  },
  messageText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
  },
  userMessageText: {
    color: Colors.dark.text,
  },
  summaryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.xs,
  },
  summaryBadgeText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontSize: 10,
  },
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  typingText: {
    ...Typography.small,
    color: Colors.dark.disabled,
  },
  summaryPanel: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  summaryTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  summaryNote: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  summaryChip: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  summaryChipLabel: {
    ...Typography.caption,
    color: Colors.dark.disabled,
    fontSize: 10,
  },
  summaryChipValue: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    fontSize: 11,
  },
  pillarRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    flexWrap: "wrap",
  },
  pillarChip: {
    flex: 1,
    minWidth: 60,
    backgroundColor: Colors.dark.primary + "14",
    borderRadius: BorderRadius.sm,
    padding: Spacing.xs,
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "25",
  },
  pillarChipLabel: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pillarChipValue: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    fontSize: 10,
  },
  levelUpBanner: {
    backgroundColor: Colors.dark.gold + "15",
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
  },
  levelUpText: {
    ...Typography.small,
    color: Colors.dark.text,
    lineHeight: 18,
  },
  levelUpActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  levelUpBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  levelUpBtnActive: {
    backgroundColor: Colors.dark.primary + "30",
  },
  levelUpBtnInactive: {
    backgroundColor: Colors.dark.error + "20",
  },
  levelUpBtnText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  saveInfoText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: Spacing.sm,
  },
  summaryActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  continueButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  continueButtonText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  saveButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.primary,
  },
  saveButtonText: {
    ...Typography.small,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
    maxHeight: 100,
    lineHeight: 20,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
