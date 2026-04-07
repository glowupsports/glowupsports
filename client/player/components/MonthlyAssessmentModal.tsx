import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getAuthHeaders, getApiUrl } from "@/lib/query-client";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";

const MIRROR_ACCENT = "#A78BFA";
const ACCENT2 = "#7C3AED";

interface PillarRatings {
  technical: number;
  physical: number;
  tactical: number;
  mental: number;
  matchplay: number;
}

interface MonthlyAssessmentModalProps {
  visible: boolean;
  onClose: () => void;
  existingAssessment?: any;
}

const PILLARS: { key: keyof PillarRatings; label: string; icon: string }[] = [
  { key: "technical", label: "Technical", icon: "tennisball" },
  { key: "tactical", label: "Tactical", icon: "bulb" },
  { key: "physical", label: "Physical", icon: "flash" },
  { key: "mental", label: "Mental", icon: "brain" },
  { key: "matchplay", label: "Match Play", icon: "trophy" },
];

const STEPS = [
  {
    id: "strengths",
    question: "What's been going well in your game this month?",
    placeholder: "e.g. My serve has been more consistent, I'm moving better...",
    field: "strengthsAnswer" as const,
  },
  {
    id: "challenges",
    question: "What's been your biggest challenge on court?",
    placeholder: "e.g. My backhand breaks down under pressure, reading the ball...",
    field: "challengesAnswer" as const,
  },
  {
    id: "progress",
    question: "How do you feel about your overall progress right now?",
    placeholder: "e.g. I feel like I'm improving but my consistency still lets me down...",
    field: "progressFeelAnswer" as const,
  },
  {
    id: "mindset",
    question: "How would you describe your motivation and mindset this month?",
    placeholder: "e.g. I've been really focused, or I've been feeling frustrated...",
    field: "mindsetAnswer" as const,
  },
  {
    id: "nextFocus",
    question: "What do you most want to focus on next month?",
    placeholder: "e.g. I want to work on my net game and be more aggressive...",
    field: "nextFocusAnswer" as const,
  },
  {
    id: "pillars",
    question: "Rate yourself honestly on each area (1 = needs work, 10 = excellent)",
    placeholder: "",
    field: null,
  },
];

function PillarSlider({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.pillarRow}>
      <View style={styles.pillarLabelRow}>
        <Ionicons name={icon as any} size={14} color={MIRROR_ACCENT} />
        <Text style={styles.pillarLabel}>{label}</Text>
        <Text style={styles.pillarValue}>{value}/10</Text>
      </View>
      <View style={styles.ratingDots}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((dot) => (
          <Pressable
            key={dot}
            style={[
              styles.ratingDot,
              dot <= value && styles.ratingDotActive,
              dot === value && styles.ratingDotSelected,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(dot);
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function MonthlyAssessmentModal({
  visible,
  onClose,
  existingAssessment,
}: MonthlyAssessmentModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    strengthsAnswer: existingAssessment?.strengthsAnswer || "",
    challengesAnswer: existingAssessment?.challengesAnswer || "",
    progressFeelAnswer: existingAssessment?.progressFeelAnswer || "",
    mindsetAnswer: existingAssessment?.mindsetAnswer || "",
    nextFocusAnswer: existingAssessment?.nextFocusAnswer || "",
  });
  const [pillarRatings, setPillarRatings] = useState<PillarRatings>(
    existingAssessment?.pillarSelfRatings || {
      technical: 5,
      physical: 5,
      tactical: 5,
      mental: 5,
      matchplay: 5,
    }
  );
  const [completed, setCompleted] = useState(false);

  const mutation = useMutation({
    mutationFn: async (complete: boolean) => {
      const url = new URL("/api/player/me/monthly-assessment", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          ...answers,
          pillarSelfRatings: pillarRatings,
          complete,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/player/me/monthly-assessment/current"],
      });
    },
  });

  const currentStep = STEPS[step];
  const isLastStep = step === STEPS.length - 1;
  const isPillarStep = currentStep.id === "pillars";

  const canProceed = isPillarStep
    ? true
    : (answers[currentStep.field as keyof typeof answers] || "").trim().length > 0;

  const handleNext = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLastStep) {
      await mutation.mutateAsync(true);
      setCompleted(true);
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep((s) => Math.max(0, s - 1));
  };

  const handleClose = () => {
    if (!completed && step > 0) {
      mutation.mutateAsync(false).catch(() => {});
    }
    onClose();
    setStep(0);
    setCompleted(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <LinearGradient
              colors={[ACCENT2 + "40", "transparent"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.headerContent}>
              <View style={styles.headerIcon}>
                <Ionicons name="mic" size={20} color={MIRROR_ACCENT} />
              </View>
              <View>
                <Text style={styles.headerTitle}>Monthly Check-In</Text>
                <Text style={styles.headerSub}>Glow Mirror — Your Voice</Text>
              </View>
              <Pressable onPress={handleClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.dark.textMuted} />
              </Pressable>
            </View>

            {/* Progress bar */}
            {!completed && (
              <View style={styles.progressBar}>
                {STEPS.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.progressDot,
                      i <= step ? styles.progressDotActive : null,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>

          {completed ? (
            <View style={styles.completedContainer}>
              <LinearGradient
                colors={[ACCENT2 + "30", "transparent"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.completedIcon}>
                <Ionicons name="checkmark-circle" size={56} color={MIRROR_ACCENT} />
              </View>
              <Text style={styles.completedTitle}>Voice Captured</Text>
              <Text style={styles.completedText}>
                Your monthly self-assessment has been saved. Your coach will see your perspective when preparing for your next sessions.
              </Text>
              <Pressable style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneButtonText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.stepQuestion}>{currentStep.question}</Text>

              {isPillarStep ? (
                <View style={styles.pillarsContainer}>
                  {PILLARS.map((p) => (
                    <PillarSlider
                      key={p.key}
                      label={p.label}
                      icon={p.icon}
                      value={pillarRatings[p.key]}
                      onChange={(v) =>
                        setPillarRatings((prev) => ({ ...prev, [p.key]: v }))
                      }
                    />
                  ))}
                </View>
              ) : (
                <TextInput
                  style={styles.textInput}
                  value={answers[currentStep.field as keyof typeof answers]}
                  onChangeText={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [currentStep.field as string]: val,
                    }))
                  }
                  placeholder={currentStep.placeholder}
                  placeholderTextColor={Colors.dark.textMuted}
                  multiline
                  numberOfLines={4}
                  autoFocus
                />
              )}

              <View style={styles.navRow}>
                {step > 0 && (
                  <Pressable style={styles.backButton} onPress={handleBack}>
                    <Ionicons name="chevron-back" size={16} color={MIRROR_ACCENT} />
                    <Text style={styles.backButtonText}>Back</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[
                    styles.nextButton,
                    !canProceed && styles.nextButtonDisabled,
                  ]}
                  onPress={handleNext}
                  disabled={!canProceed || mutation.isPending}
                >
                  {mutation.isPending ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Text style={styles.nextButtonText}>
                        {isLastStep ? "Submit" : "Next"}
                      </Text>
                      <Ionicons
                        name={isLastStep ? "checkmark" : "chevron-forward"}
                        size={16}
                        color="#000"
                      />
                    </>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    overflow: "hidden",
    borderBottomWidth: 1,
    borderBottomColor: MIRROR_ACCENT + "20",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: MIRROR_ACCENT + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerSub: {
    fontSize: 11,
    color: MIRROR_ACCENT,
    marginTop: 1,
  },
  closeBtn: {
    marginLeft: "auto",
    padding: 8,
  },
  progressBar: {
    flexDirection: "row",
    gap: 6,
    marginTop: 14,
  },
  progressDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: MIRROR_ACCENT + "30",
  },
  progressDotActive: {
    backgroundColor: MIRROR_ACCENT,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 24,
    paddingBottom: 40,
  },
  stepQuestion: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    lineHeight: 26,
    marginBottom: 20,
  },
  textInput: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 16,
    color: Colors.dark.text,
    fontSize: 15,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: MIRROR_ACCENT + "30",
    minHeight: 120,
    textAlignVertical: "top",
  },
  pillarsContainer: {
    gap: 16,
  },
  pillarRow: {
    gap: 8,
  },
  pillarLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pillarLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  pillarValue: {
    fontSize: 14,
    color: MIRROR_ACCENT,
    fontWeight: "700",
    minWidth: 36,
    textAlign: "right",
  },
  ratingDots: {
    flexDirection: "row",
    gap: 4,
  },
  ratingDot: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: MIRROR_ACCENT + "30",
  },
  ratingDotActive: {
    backgroundColor: MIRROR_ACCENT + "60",
    borderColor: MIRROR_ACCENT,
  },
  ratingDotSelected: {
    backgroundColor: MIRROR_ACCENT,
    transform: [{ scaleY: 1.4 }],
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 24,
    gap: 12,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: MIRROR_ACCENT + "40",
  },
  backButtonText: {
    fontSize: 14,
    color: MIRROR_ACCENT,
    fontWeight: "600",
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: MIRROR_ACCENT,
  },
  nextButtonDisabled: {
    backgroundColor: MIRROR_ACCENT + "50",
  },
  nextButtonText: {
    fontSize: 14,
    color: "#000",
    fontWeight: "700",
  },
  completedContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    overflow: "hidden",
  },
  completedIcon: {
    marginBottom: 20,
  },
  completedTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.dark.text,
    marginBottom: 12,
    textAlign: "center",
  },
  completedText: {
    fontSize: 15,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  doneButton: {
    backgroundColor: MIRROR_ACCENT,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
});
