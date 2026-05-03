import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Animated,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { writeBackTennisWorkout } from "@/player/services/healthService";

interface PostSessionCheckInModalProps {
  visible: boolean;
  sessionId: string;
  sessionTitle?: string;
  coachName?: string;
  sessionStartTime?: Date;
  sessionDurationMinutes?: number;
  onClose: () => void;
  onSuccess?: (xpAwarded: number) => void;
}

const ENERGY_LABELS = ["Exhausted", "Tired", "Okay", "Energized", "Peak"];
const MOOD_FACES: React.ComponentProps<typeof Ionicons>["name"][] = [
  "sad-outline",
  "sad-outline",
  "happy-outline",
  "happy-outline",
  "star-outline",
];
const MOOD_LABELS = ["Rough", "Meh", "Good", "Great", "Amazing"];
const MOOD_COLORS = ["#EF4444", "#F97316", "#EAB308", "#22C55E", "#6366F1"];

function ConfettiParticle({ index, trigger }: { index: number; trigger: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;
  const COLORS = ["#6366F1", "#22C55E", "#EAB308", "#F97316", "#EC4899", "#00D4FF"];
  const color = COLORS[index % COLORS.length];
  const xOffset = (Math.random() - 0.5) * 300;

  useEffect(() => {
    if (!trigger) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 1400 + Math.random() * 400,
      useNativeDriver: true,
    }).start();
  }, [trigger]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 420] });
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, xOffset] });
  const opacity = anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${360 * (Math.random() > 0.5 ? 1 : -1)}deg`] });

  return (
    <Animated.View
      style={[
        confStyles.particle,
        { backgroundColor: color, opacity, transform: [{ translateY }, { translateX }, { rotate }] },
      ]}
      pointerEvents="none"
    />
  );
}

const confStyles = StyleSheet.create({
  particle: { position: "absolute", top: 80, alignSelf: "center", width: 10, height: 10, borderRadius: 3 },
});

export function PostSessionCheckInModal({
  visible,
  sessionId,
  sessionTitle,
  coachName,
  sessionStartTime,
  sessionDurationMinutes,
  onClose,
  onSuccess,
}: PostSessionCheckInModalProps) {
  const [step, setStep] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [mood, setMood] = useState(0);
  const [notes, setNotes] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [xpEarned, setXpEarned] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!visible) {
      setStep(0);
      setEnergy(0);
      setMood(0);
      setNotes("");
      setShowConfetti(false);
      setSubmitted(false);
    }
  }, [visible]);

  const checkinMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/player/sessions/${sessionId}/checkin`, {
        energyLevel: energy,
        mood: mood,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (data: any) => {
      const xp = data?.xpAwarded ?? 25;
      setXpEarned(xp);
      setSubmitted(true);
      setShowConfetti(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/session-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/home-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/checkin-insight"] });

      // Write the completed tennis session to Apple Health / Google Health
      const endTime = new Date();
      const durationMinutes = sessionDurationMinutes ?? 60;
      const startTime = sessionStartTime ?? new Date(endTime.getTime() - durationMinutes * 60_000);
      writeBackTennisWorkout({ startTime, endTime, durationMinutes }).catch(() => {});

      setTimeout(() => {
        onSuccess?.(xp);
        onClose();
      }, 2200);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleEnergySelect = (val: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEnergy(val);
    setTimeout(() => setStep(1), 180);
  };

  const handleMoodSelect = (val: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMood(val);
    setTimeout(() => setStep(2), 180);
  };

  const handleSubmit = () => {
    if (energy === 0 || mood === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    checkinMutation.mutate();
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={handleSkip} />

        {showConfetti ? (
          <View style={s.confettiContainer} pointerEvents="none">
            {Array.from({ length: 18 }).map((_, i) => (
              <ConfettiParticle key={i} index={i} trigger={showConfetti} />
            ))}
          </View>
        ) : null}

        <KeyboardAwareScrollViewCompat
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.sheet}>
            {/* Header */}
            <View style={s.header}>
              <View style={s.titleBlock}>
                <Text style={s.title}>
                  {submitted ? "Check-in Saved!" : "How was your session?"}
                </Text>
                {(sessionTitle || coachName) ? (
                  <Text style={s.subtitle} numberOfLines={1}>
                    {sessionTitle || "Session"}
                    {coachName ? ` · ${coachName}` : ""}
                  </Text>
                ) : null}
              </View>
              {!submitted ? (
                <Pressable onPress={handleSkip} style={s.skipBtn} hitSlop={8}>
                  <Text style={s.skipText}>Skip</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Page indicator */}
            {!submitted ? (
              <View style={s.pageIndicator}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[s.pageDot, step >= i && s.pageDotActive]} />
                ))}
              </View>
            ) : null}

            {/* Step 0 — Energy */}
            {!submitted && step === 0 ? (
              <View style={s.stepBlock}>
                <Text style={s.stepLabel}>Energy Level</Text>
                <Text style={s.stepHint}>How did your body feel?</Text>
                <View style={s.energyRow}>
                  {[1, 2, 3, 4, 5].map((val) => (
                    <Pressable
                      key={val}
                      style={({ pressed }) => [s.energyBtn, energy === val && s.energyBtnSelected, pressed && s.pressed]}
                      onPress={() => handleEnergySelect(val)}
                    >
                      <Ionicons
                        name="flame"
                        size={28}
                        color={val <= (energy || val) ? (val <= 2 ? "#EF4444" : val <= 3 ? "#F97316" : "#22C55E") : Colors.dark.chipBackgroundStrong}
                      />
                      <Text style={[s.energyVal, energy === val && s.energyValSelected]}>{val}</Text>
                    </Pressable>
                  ))}
                </View>
                {energy > 0 ? (
                  <Text style={s.selectionLabel}>{ENERGY_LABELS[energy - 1]}</Text>
                ) : null}
              </View>
            ) : null}

            {/* Step 1 — Mood */}
            {!submitted && step === 1 ? (
              <View style={s.stepBlock}>
                <Text style={s.stepLabel}>How did it go?</Text>
                <Text style={s.stepHint}>Rate your overall session experience</Text>
                <View style={s.moodRow}>
                  {[1, 2, 3, 4, 5].map((val) => (
                    <Pressable
                      key={val}
                      style={({ pressed }) => [
                        s.moodBtn,
                        mood === val && { borderColor: MOOD_COLORS[val - 1], backgroundColor: MOOD_COLORS[val - 1] + "20" },
                        pressed && s.pressed,
                      ]}
                      onPress={() => handleMoodSelect(val)}
                    >
                      <Ionicons
                        name={MOOD_FACES[val - 1]}
                        size={32}
                        color={mood === val ? MOOD_COLORS[val - 1] : Colors.dark.textMuted}
                      />
                      <Text style={[s.moodLabel, mood === val && { color: MOOD_COLORS[val - 1] }]}>
                        {MOOD_LABELS[val - 1]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Step 2 — Notes */}
            {!submitted && step === 2 ? (
              <View style={s.stepBlock}>
                <Text style={s.stepLabel}>What did you work on?</Text>
                <Text style={s.stepHint}>Optional — add a quick note</Text>
                <TextInput
                  style={s.notesInput}
                  placeholder="e.g. Worked on my backhand cross-court..."
                  placeholderTextColor={Colors.dark.textMuted}
                  value={notes}
                  onChangeText={(t) => setNotes(t.slice(0, 120))}
                  multiline
                  maxLength={120}
                  autoFocus={Platform.OS !== "web"}
                />
                <Text style={s.charCount}>{notes.length}/120</Text>
                <Pressable
                  style={({ pressed }) => [s.submitBtn, pressed && s.pressed, checkinMutation.isPending && s.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={checkinMutation.isPending}
                >
                  <Text style={s.submitText}>
                    {checkinMutation.isPending ? "Saving..." : "Save Check-in"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {/* Success state */}
            {submitted ? (
              <View style={s.successBlock}>
                <View style={s.successIcon}>
                  <Ionicons name="checkmark-circle" size={56} color={GlowColors.primary} />
                </View>
                <Text style={s.successTitle}>Logged!</Text>
                <View style={s.xpRow}>
                  <Ionicons name="flash" size={18} color={Colors.dark.gold} />
                  <Text style={s.xpText}>+{xpEarned} XP earned</Text>
                </View>
                <Text style={s.successSub}>Your journey is growing</Text>
              </View>
            ) : null}

            {/* Back nav for step > 0 */}
            {!submitted && step > 0 ? (
              <Pressable onPress={() => setStep((p) => p - 1)} style={s.backBtn}>
                <Ionicons name="arrow-back" size={14} color={Colors.dark.textMuted} />
                <Text style={s.backText}>Back</Text>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  backdrop: { flex: 1 },
  confettiContainer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center" },
  scrollContent: { flexGrow: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 40,
    paddingTop: Spacing.lg,
    minHeight: 340,
  },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: Spacing.md },
  titleBlock: { flex: 1, marginRight: Spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: Colors.dark.text },
  subtitle: { fontSize: 13, color: Colors.dark.textMuted, marginTop: 3 },
  skipBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  skipText: { fontSize: 13, color: Colors.dark.textMuted, fontWeight: "600" },
  pageIndicator: { flexDirection: "row", gap: 6, marginBottom: Spacing.lg },
  pageDot: { width: 24, height: 4, borderRadius: 2, backgroundColor: Colors.dark.chipBackgroundStrong },
  pageDotActive: { backgroundColor: GlowColors.primary },
  stepBlock: { gap: Spacing.md },
  stepLabel: { fontSize: 17, fontWeight: "700", color: Colors.dark.text },
  stepHint: { fontSize: 13, color: Colors.dark.textMuted, marginTop: -8 },
  energyRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: Spacing.sm },
  energyBtn: {
    alignItems: "center",
    gap: 4,
    padding: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.dark.chipBorder,
    flex: 1,
    marginHorizontal: 3,
  },
  energyBtnSelected: { borderColor: GlowColors.primary, backgroundColor: GlowColors.primary + "18" },
  energyVal: { fontSize: 12, fontWeight: "700", color: Colors.dark.textMuted },
  energyValSelected: { color: GlowColors.primary },
  selectionLabel: { textAlign: "center", fontSize: 14, fontWeight: "600", color: GlowColors.primary },
  moodRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: Spacing.sm, flexWrap: "wrap", gap: 6 },
  moodBtn: {
    alignItems: "center",
    gap: 4,
    padding: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.dark.chipBorder,
    flex: 1,
    minWidth: 56,
  },
  moodLabel: { fontSize: 10, fontWeight: "600", color: Colors.dark.textMuted, textAlign: "center" },
  notesInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
    color: Colors.dark.text,
    fontSize: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 100,
    textAlignVertical: "top",
  },
  charCount: { fontSize: 11, color: Colors.dark.textMuted, textAlign: "right", marginTop: -8 },
  submitBtn: {
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.8 },
  successBlock: { alignItems: "center", paddingVertical: Spacing.xl, gap: Spacing.md },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: GlowColors.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: { fontSize: 24, fontWeight: "800", color: Colors.dark.text },
  xpRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  xpText: { fontSize: 18, fontWeight: "800", color: Colors.dark.gold },
  successSub: { fontSize: 14, color: Colors.dark.textMuted },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: Spacing.md, alignSelf: "flex-start" },
  backText: { fontSize: 13, color: Colors.dark.textMuted, fontWeight: "600" },
});
