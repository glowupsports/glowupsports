import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { Colors, Spacing, Typography, BorderRadius, FontSizes } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import CreateFamilyMemberFlow from "./CreateFamilyMemberFlow";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface Props {
  visible: boolean;
  onDone: () => void;
}

export default function AddFamilyMemberPrompt({ visible, onDone }: Props) {
  const { user } = useAuth();
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const [addedCount, setAddedCount] = useState(0);

  const [showInviteCode, setShowInviteCode] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [invitePreview, setInvitePreview] = useState<{ playerName: string; academyName: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteClaimed, setInviteClaimed] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const claimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (claimTimerRef.current) clearTimeout(claimTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setShowInviteCode(false);
      setInviteCode("");
      setInvitePreview(null);
      setInviteError(null);
      setInviteClaimed(false);
      setClaimLoading(false);
      setInviteLoading(false);
    }
  }, [visible]);

  const handleAddMember = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCreateFlow(true);
  };

  const handleMemberCreated = (_playerId: string, _playerName: string) => {
    setShowCreateFlow(false);
    setAddedCount((prev) => prev + 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDone();
  };

  const handleOpenInviteCode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowInviteCode(true);
    setInviteCode("");
    setInvitePreview(null);
    setInviteError(null);
    setInviteClaimed(false);
  };

  const handleBackFromInvite = () => {
    setShowInviteCode(false);
    setInviteCode("");
    setInvitePreview(null);
    setInviteError(null);
    setInviteClaimed(false);
  };

  const handleLookup = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;
    setInviteLoading(true);
    setInvitePreview(null);
    setInviteError(null);
    try {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/player-invites/${code}/preview`, baseUrl).toString();
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setInviteError(data.message || "Code not found. Please check and try again.");
      } else {
        const data = await res.json();
        setInvitePreview({ playerName: data.playerName, academyName: data.academyName });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      setInviteError("Could not reach the server. Please try again.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleConfirmClaim = async () => {
    if (!invitePreview) return;
    if (!user?.id) {
      setInviteError("You must be signed in to claim an invite.");
      return;
    }
    setClaimLoading(true);
    try {
      await apiRequest("POST", "/api/player-invite/claim", {
        inviteCode: inviteCode.trim().toUpperCase(),
        userId: user.id,
      });
      setInviteClaimed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      claimTimerRef.current = setTimeout(() => {
        setAddedCount((prev) => prev + 1);
        setShowInviteCode(false);
        setInviteCode("");
        setInvitePreview(null);
        setInviteError(null);
        setInviteClaimed(false);
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not claim the invite. Please try again.";
      setInviteError(message);
      setInviteClaimed(false);
    } finally {
      setClaimLoading(false);
    }
  };

  const renderInviteContent = () => {
    if (inviteClaimed && invitePreview) {
      return (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.dark.primary} />
          </View>
          <Text style={styles.successTitle}>Linked!</Text>
          <Text style={styles.successSubtitle}>
            You are now linked to {invitePreview.playerName} at {invitePreview.academyName}.
          </Text>
        </Animated.View>
      );
    }

    return (
      <>
        <Pressable onPress={handleBackFromInvite} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={Colors.dark.textMuted} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <Text style={styles.title}>Enter your invite code</Text>
          <Text style={styles.subtitle}>
            Enter the 6-character code your coach or academy shared with you
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.codeInputRow}>
          <TextInput
            style={styles.codeInput}
            value={inviteCode}
            onChangeText={(t) => {
              setInviteCode(t.toUpperCase());
              setInvitePreview(null);
              setInviteError(null);
            }}
            autoCapitalize="characters"
            maxLength={8}
            placeholder="ABC123"
            placeholderTextColor={Colors.dark.textMuted}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleLookup}
          />
          <Pressable
            style={[styles.lookupBtn, (!inviteCode.trim() || inviteLoading) && styles.lookupBtnDisabled]}
            onPress={handleLookup}
            disabled={!inviteCode.trim() || inviteLoading}
          >
            {inviteLoading ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <Text style={styles.lookupBtnText}>Look up</Text>
            )}
          </Pressable>
        </Animated.View>

        {inviteError ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            <Text style={styles.errorText}>{inviteError}</Text>
          </Animated.View>
        ) : null}

        {invitePreview ? (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.previewCard}>
            <View style={styles.previewCheckRow}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
              <Text style={styles.previewLabel}>You&apos;ve been invited to:</Text>
            </View>
            <Text style={styles.previewPlayerName}>{invitePreview.playerName}</Text>
            <Text style={styles.previewAcademy}>{invitePreview.academyName}</Text>

            <Pressable
              style={[styles.confirmBtn, claimLoading && styles.confirmBtnDisabled]}
              onPress={handleConfirmClaim}
              disabled={claimLoading}
            >
              {claimLoading ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm — I&apos;m {invitePreview.playerName}</Text>
              )}
            </Pressable>
          </Animated.View>
        ) : null}
      </>
    );
  };

  return (
    <>
      <Modal
        visible={visible && !showCreateFlow}
        transparent
        animationType="fade"
        onRequestClose={showInviteCode ? handleBackFromInvite : handleDone}
      >
        <View style={styles.overlay}>
          <Animated.View entering={ZoomIn.duration(400)} style={styles.card}>
            <LinearGradient
              colors={[`${Colors.dark.primary}20`, "transparent"]}
              style={styles.gradient}
            />

            {showInviteCode ? (
              renderInviteContent()
            ) : (
              <>
                <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.iconRow}>
                  <View style={styles.iconBg}>
                    <Ionicons name="people" size={48} color={Colors.dark.primary} />
                  </View>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(200).duration(400)}>
                  <Text style={styles.title}>
                    {addedCount === 0 ? "Add Family Members?" : "Add another family member?"}
                  </Text>
                  <Text style={styles.subtitle}>
                    {addedCount === 0
                      ? "Do you play tennis with family? Add a profile for each family member right now — no separate account needed."
                      : `${addedCount} member${addedCount > 1 ? "s" : ""} added. Would you like to add another?`}
                  </Text>
                </Animated.View>

                {addedCount > 0 ? (
                  <Animated.View entering={FadeInDown.delay(200).duration(300)} style={styles.addedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.dark.primary} />
                    <Text style={styles.addedText}>{addedCount} profile{addedCount > 1 ? "s" : ""} created</Text>
                  </Animated.View>
                ) : null}

                <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.buttons}>
                  <Pressable
                    style={styles.addBtn}
                    onPress={handleAddMember}
                    accessibilityRole="button"
                    accessibilityLabel="Add family member"
                  >
                    <Ionicons name="person-add" size={20} color={Colors.dark.buttonText} />
                    <Text style={styles.addBtnText}>Yes, add one</Text>
                  </Pressable>

                  <Pressable
                    style={styles.coachCodeBtn}
                    onPress={handleOpenInviteCode}
                    accessibilityRole="button"
                    accessibilityLabel="I have a coach invite code"
                  >
                    <Ionicons name="key-outline" size={20} color={Colors.dark.primary} />
                    <Text style={styles.coachCodeBtnText}>I have an invite code</Text>
                  </Pressable>

                  <Pressable
                    style={styles.doneBtn}
                    onPress={handleDone}
                    accessibilityRole="button"
                    accessibilityLabel="Done, go to home"
                  >
                    <Text style={styles.doneBtnText}>
                      {addedCount === 0 ? "No, done" : "Done"}
                    </Text>
                    <Ionicons name="arrow-forward" size={18} color={Colors.dark.textMuted} />
                  </Pressable>
                </Animated.View>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>

      <CreateFamilyMemberFlow
        visible={showCreateFlow}
        onClose={() => setShowCreateFlow(false)}
        onComplete={handleMemberCreated}
      />
    </>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 24,
    padding: Spacing.xl,
    gap: Spacing.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  iconRow: {
    alignItems: "center",
  },
  iconBg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: `${Colors.dark.primary}15`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: `${Colors.dark.primary}30`,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginTop: Spacing.xs,
  },
  addedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    justifyContent: "center",
    backgroundColor: `${Colors.dark.primary}15`,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    alignSelf: "center",
  },
  addedText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  buttons: {
    gap: Spacing.md,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md + 2,
  },
  addBtnText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  coachCodeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md + 2,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
    backgroundColor: "transparent",
  },
  coachCodeBtnText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  doneBtnText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  backText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  codeInputRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "center",
  },
  codeInput: {
    flex: 1,
    backgroundColor: `${Colors.dark.primary}10`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}40`,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 4,
    textAlign: "center",
  },
  lookupBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  lookupBtnDisabled: {
    opacity: 0.5,
  },
  lookupBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  errorText: {
    fontSize: FontSizes.sm,
    color: "#FF5C5C",
    textAlign: "center",
  },
  previewCard: {
    backgroundColor: `${Colors.dark.primary}15`,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  previewCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  previewLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  previewPlayerName: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  previewAcademy: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  confirmBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  successContainer: {
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${Colors.dark.primary}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
  },
  successSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
}));
