import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

const NEON_YELLOW = "#FFE600";

type Category = "bug" | "idea" | "compliment";

const CATEGORIES: { id: Category; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { id: "bug", label: "Bug", icon: "bug-outline", color: "#E74C3C" },
  { id: "idea", label: "Idea", icon: "bulb-outline", color: "#3498DB" },
  { id: "compliment", label: "Compliment", icon: "star-outline", color: "#2ECC40" },
];

interface BetaFeedbackButtonProps {
  playerId?: string;
  playerName?: string;
  bottomOffset?: number;
}

export function BetaFeedbackButton({
  playerId,
  playerName = "Tester",
  bottomOffset = 100,
}: BetaFeedbackButtonProps) {
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setModalVisible(true);
    setCategory(null);
    setMessage("");
    setShowSuccess(false);
  }, []);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setModalVisible(false);
    setCategory(null);
    setMessage("");
    setShowSuccess(false);
  }, [isSubmitting]);

  const handleSubmit = useCallback(async () => {
    if (!category || !message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/beta-feedback", {
        playerId: playerId || null,
        playerName,
        category,
        message: message.trim(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccess(true);

      setTimeout(() => {
        setModalVisible(false);
        setShowSuccess(false);
        setCategory(null);
        setMessage("");
      }, 2000);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error("[BetaFeedback] Submit error:", err);
    } finally {
      setIsSubmitting(false);
    }
  }, [category, message, isSubmitting, playerId, playerName]);

  const canSubmit = !!category && message.trim().length > 0 && !isSubmitting;

  return (
    <>
      <Pressable
        style={[
          styles.pill,
          { bottom: bottomOffset + insets.bottom, left: Spacing.lg },
        ]}
        onPress={handleOpen}
        accessibilityLabel="Open beta feedback"
        accessibilityRole="button"
      >
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.dark.buttonText} />
        <Text style={styles.pillText}>Feedback</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            {Platform.OS === "ios" ? (
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0f0f0f" }]} />
            )}

            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {showSuccess ? (
                <View style={styles.successContainer}>
                  <View style={styles.successIcon}>
                    <Ionicons name="checkmark-circle" size={56} color="#2ECC40" />
                  </View>
                  <Text style={styles.successTitle}>Thank you!</Text>
                  <Text style={styles.successSub}>Your feedback has been received.</Text>
                </View>
              ) : (
                <>
                  <View style={styles.header}>
                    <View style={styles.pillBadge}>
                      <Ionicons name="flask-outline" size={13} color={NEON_YELLOW} />
                      <Text style={styles.pillBadgeText}>BETA</Text>
                    </View>
                    <Text style={styles.title}>Send Feedback</Text>
                    <Text style={styles.subtitle}>Help us improve the app</Text>
                    <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={12}>
                      <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
                    </Pressable>
                  </View>

                  <Text style={styles.label}>Category</Text>
                  <View style={styles.categoryRow}>
                    {CATEGORIES.map((cat) => {
                      const selected = category === cat.id;
                      return (
                        <Pressable
                          key={cat.id}
                          style={[
                            styles.categoryChip,
                            selected && { borderColor: cat.color, backgroundColor: cat.color + "1A" },
                          ]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setCategory(cat.id);
                          }}
                        >
                          <Ionicons
                            name={cat.icon}
                            size={16}
                            color={selected ? cat.color : Colors.dark.textMuted}
                          />
                          <Text
                            style={[
                              styles.categoryChipText,
                              selected && { color: cat.color },
                            ]}
                          >
                            {cat.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>Message</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Tell us what you encountered or what you'd like to see..."
                    placeholderTextColor={Colors.dark.textSubtle}
                    multiline
                    numberOfLines={5}
                    maxLength={2000}
                    value={message}
                    onChangeText={setMessage}
                    textAlignVertical="top"
                    returnKeyType="default"
                    blurOnSubmit={false}
                  />
                  <Text style={styles.charCount}>{message.length}/2000</Text>

                  <View style={styles.testerRow}>
                    <Ionicons name="person-circle-outline" size={16} color={Colors.dark.textSubtle} />
                    <Text style={styles.testerName}>{playerName}</Text>
                  </View>

                  <Pressable
                    style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={!canSubmit}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                    ) : (
                      <>
                        <Ionicons name="send" size={16} color={Colors.dark.buttonText} />
                        <Text style={styles.submitBtnText}>Submit</Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: NEON_YELLOW,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: NEON_YELLOW,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 110,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.buttonText,
    letterSpacing: 0.3,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    maxHeight: "85%",
  },
  sheetContent: {
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  header: {
    position: "relative",
    marginBottom: Spacing.sm,
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: NEON_YELLOW + "1A",
    borderColor: NEON_YELLOW + "44",
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: Spacing.sm,
  },
  pillBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: NEON_YELLOW,
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  closeBtn: {
    position: "absolute",
    top: 0,
    right: 0,
    padding: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textSubtle,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: -4,
  },
  categoryRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  categoryChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  textInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 15,
    minHeight: 120,
    lineHeight: 22,
  },
  charCount: {
    fontSize: 11,
    color: Colors.dark.textSubtle,
    textAlign: "right",
    marginTop: -8,
  },
  testerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  testerName: {
    fontSize: 13,
    color: Colors.dark.textSubtle,
    fontWeight: "500",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: NEON_YELLOW,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.buttonText,
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  successIcon: {
    marginBottom: Spacing.sm,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  successSub: {
    fontSize: 15,
    color: Colors.dark.textMuted,
  },
});
