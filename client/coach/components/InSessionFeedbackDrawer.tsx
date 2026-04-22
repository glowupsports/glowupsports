import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from "react-native";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
Backgrounds, } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { SuccessToast } from "@/components/SuccessToast";

interface Player {
  id: string;
  name: string;
  photoUrl?: string | null;
}

interface InSessionFeedbackDrawerProps {
  visible: boolean;
  sessionId: string;
  players: Player[];
  onClose: () => void;
  initialPlayerId?: string | null;
}

type FeedbackType = "praise" | "technique" | "effort" | "focus" | "attitude" | "improvement" | "note";
type Visibility = "public" | "private";

interface FeedbackOption {
  type: FeedbackType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  defaultVisibility: Visibility;
  xpBonus: number;
  templates: string[];
}

const FEEDBACK_OPTIONS: FeedbackOption[] = [
  {
    type: "praise",
    label: "Praise",
    icon: "star",
    color: GlowColors.primary,
    defaultVisibility: "public",
    xpBonus: 15,
    templates: [
      "Excellent work today!",
      "Great improvement on technique",
      "Outstanding focus and effort",
      "Really impressed with your progress",
    ],
  },
  {
    type: "effort",
    label: "Great Effort",
    icon: "flame",
    color: Colors.dark.orange,
    defaultVisibility: "public",
    xpBonus: 10,
    templates: [
      "Gave 100% today",
      "Pushed through challenges",
      "Never gave up on tough drills",
      "Extra effort noticed",
    ],
  },
  {
    type: "technique",
    label: "Technique Tip",
    icon: "bulb",
    color: Colors.dark.xpCyan,
    defaultVisibility: "public",
    xpBonus: 5,
    templates: [
      "Focus on follow-through",
      "Keep your eyes on the ball",
      "Work on footwork positioning",
      "Improve racket preparation",
    ],
  },
  {
    type: "improvement",
    label: "Improvement",
    icon: "trending-up",
    color: "#10B981",
    defaultVisibility: "public",
    xpBonus: 5,
    templates: [
      "Noticeable improvement this session",
      "Technique getting stronger",
      "Good progress on consistency",
      "Movement improving well",
    ],
  },
  {
    type: "focus",
    label: "Focus Needed",
    icon: "eye",
    color: "#F59E0B",
    defaultVisibility: "private",
    xpBonus: 0,
    templates: [
      "Needs to improve concentration",
      "Getting distracted easily",
      "Should focus more on instruction",
      "Mind seems elsewhere today",
    ],
  },
  {
    type: "attitude",
    label: "Attitude Note",
    icon: "alert-circle",
    color: Colors.dark.error,
    defaultVisibility: "private",
    xpBonus: 0,
    templates: [
      "Frustrated with mistakes",
      "Not receptive to feedback",
      "Argumentative today",
      "Needs motivation",
    ],
  },
  {
    type: "note",
    label: "Private Note",
    icon: "create",
    color: Colors.dark.tabIconDefault,
    defaultVisibility: "private",
    xpBonus: 0,
    templates: [],
  },
];

export default function InSessionFeedbackDrawer({
  visible,
  sessionId,
  players,
  onClose,
  initialPlayerId,
}: InSessionFeedbackDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedType, setSelectedType] = useState<FeedbackOption | null>(null);
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successXp, setSuccessXp] = useState(0);

  React.useEffect(() => {
    if (visible && initialPlayerId && players.length > 0) {
      const match = players.find((p) => p.id === initialPlayerId) ?? null;
      if (match) setSelectedPlayer(match);
    } else if (visible && !initialPlayerId && players.length === 1) {
      setSelectedPlayer(players[0]);
    }
  }, [visible, initialPlayerId, players]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/coach/sessions/${sessionId}/in-session-feedback`, {
        playerId: selectedPlayer!.id,
        feedbackType: selectedType!.type,
        message,
        visibility,
      });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessXp(data.xpAwarded || 0);
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/sessions", sessionId, "in-session-feedback"] });
      if (selectedPlayer) {
        queryClient.invalidateQueries({ queryKey: [`/api/coach/players/${selectedPlayer.id}/feedback-history`] });
      }
      setTimeout(() => {
        setShowSuccess(false);
        resetForm();
      }, 2000);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const resetForm = () => {
    setSelectedPlayer(null);
    setSelectedType(null);
    setMessage("");
    setVisibility("private");
  };

  const handleSelectType = (option: FeedbackOption) => {
    setSelectedType(option);
    setVisibility(option.defaultVisibility);
    if (option.templates.length > 0) {
      setMessage(option.templates[0]);
    } else {
      setMessage("");
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSubmit = () => {
    if (!selectedPlayer || !selectedType || !message.trim()) return;
    submitMutation.mutate();
  };

  const renderStep = () => {
    if (!selectedPlayer) {
      return (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Select Player</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.playerList}
          >
            {players.map((player) => (
              <Pressable
                key={player.id}
                style={styles.playerCard}
                onPress={() => {
                  setSelectedPlayer(player);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
              >
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerInitial}>
                    {player.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.playerName} numberOfLines={1}>
                  {player.name.split(" ")[0]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      );
    }

    if (!selectedType) {
      return (
        <View style={styles.stepContent}>
          <View style={styles.stepHeader}>
            <Pressable onPress={() => setSelectedPlayer(null)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.stepTitle}>Feedback for {selectedPlayer.name.split(" ")[0]}</Text>
          </View>
          <View style={styles.feedbackGrid}>
            {FEEDBACK_OPTIONS.map((option) => (
              <Pressable
                key={option.type}
                style={[styles.feedbackOption]}
                onPress={() => handleSelectType(option)}
              >
                <LinearGradient
                  colors={[option.color + "40", option.color + "20"]}
                  style={styles.feedbackOptionGradient}
                >
                  <Ionicons name={option.icon} size={24} color={option.color} />
                  <Text style={styles.feedbackOptionLabel}>{option.label}</Text>
                  {option.xpBonus > 0 && (
                    <View style={styles.xpBadge}>
                      <Text style={styles.xpBadgeText}>+{option.xpBonus} XP</Text>
                    </View>
                  )}
                </LinearGradient>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Pressable onPress={() => setSelectedType(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerInfo}>
            <View style={[styles.typeBadge, { backgroundColor: selectedType.color + "30" }]}>
              <Ionicons name={selectedType.icon} size={14} color={selectedType.color} />
              <Text style={[styles.typeBadgeText, { color: selectedType.color }]}>
                {selectedType.label}
              </Text>
            </View>
            <Text style={styles.forPlayerText}>for {selectedPlayer.name.split(" ")[0]}</Text>
          </View>
        </View>

        {selectedType.templates.length > 0 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.templatesContainer}
            contentContainerStyle={styles.templatesList}
          >
            {selectedType.templates.map((template, index) => (
              <Pressable
                key={index}
                style={[
                  styles.templateChip,
                  message === template && styles.templateChipActive,
                ]}
                onPress={() => {
                  setMessage(template);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text
                  style={[
                    styles.templateChipText,
                    message === template && styles.templateChipTextActive,
                  ]}
                >
                  {template}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <TextInput
          style={styles.messageInput}
          value={message}
          onChangeText={setMessage}
          placeholder="Add your feedback message..."
          placeholderTextColor={Colors.dark.tabIconDefault}
          multiline
          maxLength={300}
        />

        <View style={styles.visibilityRow}>
          <Text style={styles.visibilityLabel}>Visibility:</Text>
          <View style={styles.visibilityOptions}>
            <Pressable
              style={[
                styles.visibilityBtn,
                visibility === "public" && styles.visibilityBtnActive,
              ]}
              onPress={() => setVisibility("public")}
            >
              <Ionicons
                name="globe-outline"
                size={16}
                color={visibility === "public" ? Colors.dark.buttonText : Colors.dark.text}
              />
              <Text
                style={[
                  styles.visibilityBtnText,
                  visibility === "public" && styles.visibilityBtnTextActive,
                ]}
              >
                Public
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.visibilityBtn,
                visibility === "private" && styles.visibilityBtnActive,
              ]}
              onPress={() => setVisibility("private")}
            >
              <Ionicons
                name="lock-closed-outline"
                size={16}
                color={visibility === "private" ? Colors.dark.buttonText : Colors.dark.text}
              />
              <Text
                style={[
                  styles.visibilityBtnText,
                  visibility === "private" && styles.visibilityBtnTextActive,
                ]}
              >
                Private
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.visibilityHint}>
          <Ionicons
            name={visibility === "public" ? "information-circle" : "lock-closed"}
            size={14}
            color={Colors.dark.tabIconDefault}
          />
          <Text style={styles.visibilityHintText}>
            {visibility === "public"
              ? "Player will see this feedback and earn XP"
              : "Only visible to coaches - player won't see this"}
          </Text>
        </View>

        <Pressable
          style={[
            styles.submitBtn,
            (!message.trim() || submitMutation.isPending) && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!message.trim() || submitMutation.isPending}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color={Colors.dark.buttonText} size="small" />
          ) : (
            <>
              <Ionicons name="send" size={18} color={Colors.dark.buttonText} />
              <Text style={styles.submitBtnText}>Send Feedback</Text>
              {visibility === "public" && selectedType.xpBonus > 0 && (
                <View style={styles.submitXpBadge}>
                  <Text style={styles.submitXpBadgeText}>+{selectedType.xpBonus} XP</Text>
                </View>
              )}
            </>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <>
    <SwipeableBottomSheet
      visible={visible}
      onClose={onClose}
      bottomInset={insets.bottom + Spacing.md}
      sheetStyle={styles.drawer}
    >
          <View style={styles.header}>
            <Text style={styles.title}>Feedback</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          {showSuccess ? (
            <View style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={64} color={GlowColors.primary} />
              </View>
              <Text style={styles.successText}>Feedback Sent!</Text>
              {successXp > 0 && (
                <Text style={styles.successXp}>+{successXp} XP awarded to player</Text>
              )}
            </View>
          ) : (
            renderStep()
          )}
    </SwipeableBottomSheet>
    <SuccessToast visible={showSuccess} message="Feedback sent successfully" />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.overlay,
  },
  drawer: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.sm,
    maxHeight: "80%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.tabIconDefault,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  title: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  stepContent: {
    padding: Spacing.lg,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  stepTitle: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    borderRadius: BorderRadius.sm,
  },
  typeBadgeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
  },
  forPlayerText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  playerList: {
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  playerCard: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  playerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GlowColors.primary + "30",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: GlowColors.primary + "50",
  },
  playerInitial: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  playerName: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.text,
    maxWidth: 60,
    textAlign: "center",
  },
  feedbackGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  feedbackOption: {
    width: "48%",
  },
  feedbackOptionGradient: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  feedbackOptionLabel: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
  },
  xpBadge: {
    backgroundColor: GlowColors.primary + "30",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  xpBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  templatesContainer: {
    marginBottom: Spacing.md,
  },
  templatesList: {
    gap: Spacing.sm,
  },
  templateChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  templateChipActive: {
    backgroundColor: GlowColors.primary + "30",
    borderColor: GlowColors.primary,
  },
  templateChipText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  templateChipTextActive: {
    color: GlowColors.primary,
  },
  messageInput: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: Spacing.md,
  },
  visibilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  visibilityLabel: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  visibilityOptions: {
    flexDirection: "row",
    gap: Spacing.sm,
    flex: 1,
  },
  visibilityBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  visibilityBtnActive: {
    backgroundColor: GlowColors.primary,
    borderColor: GlowColors.primary,
  },
  visibilityBtnText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  visibilityBtnTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  visibilityHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  visibilityHintText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    flex: 1,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  submitXpBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  submitXpBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
  },
  successIcon: {
    marginBottom: Spacing.md,
  },
  successText: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  successXp: {
    fontSize: Typography.body.fontSize,
    color: GlowColors.primary,
    fontWeight: "600",
  },
});
