import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useMutation } from "@tanstack/react-query";
import { Colors, Spacing, Typography, BorderRadius, FontSizes } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type IoniconName = keyof typeof Ionicons.glyphMap;

const MOTIVATION_OPTIONS: { id: string; label: string; icon: IoniconName }[] = [
  { id: "fun", label: "Just for fun", icon: "happy-outline" },
  { id: "improve", label: "Improve seriously", icon: "trending-up-outline" },
  { id: "compete", label: "Play matches", icon: "trophy-outline" },
  { id: "unsure", label: "Not sure yet", icon: "help-circle-outline" },
];

const HAND_OPTIONS: { id: string; label: string; icon: IoniconName }[] = [
  { id: "right", label: "Right-handed", icon: "hand-right-outline" },
  { id: "left", label: "Left-handed", icon: "hand-left-outline" },
];

const BACKHAND_OPTIONS: { id: string; label: string; icon: IoniconName }[] = [
  { id: "single", label: "One-handed", icon: "hand-right-outline" },
  { id: "double", label: "Two-handed", icon: "body-outline" },
];

const EXPERIENCE_OPTIONS: { id: string; label: string }[] = [
  { id: "new", label: "New" },
  { id: "6-12months", label: "6-12 mo" },
  { id: "1-3years", label: "1-3 yrs" },
  { id: "3-5years", label: "3-5 yrs" },
  { id: "5-10years", label: "5-10 yrs" },
  { id: "10-20years", label: "10-20 yrs" },
];

const ENJOYMENT_OPTIONS: { id: string; label: string; icon: IoniconName }[] = [
  { id: "rallies", label: "Rallying", icon: "repeat-outline" },
  { id: "winning", label: "Winning points", icon: "star-outline" },
  { id: "technique", label: "Learning technique", icon: "school-outline" },
  { id: "social", label: "Playing together", icon: "people-outline" },
  { id: "active", label: "Being active", icon: "fitness-outline" },
  { id: "competing", label: "Competition", icon: "ribbon-outline" },
];

const FOCUS_OPTIONS: { id: string; label: string; icon: IoniconName }[] = [
  { id: "technique", label: "Technique", icon: "construct-outline" },
  { id: "confidence", label: "Confidence", icon: "shield-checkmark-outline" },
  { id: "fitness", label: "Fitness", icon: "barbell-outline" },
  { id: "focus", label: "Focus", icon: "eye-outline" },
  { id: "strategy", label: "Play smarter", icon: "bulb-outline" },
  { id: "social", label: "Together / Teamwork", icon: "people-circle-outline" },
];

interface MemberData {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  dominantHand: string | null;
  backhandType: string | null;
  experienceLevel: string | null;
  motivationType: string | null;
  enjoymentTags: string[];
  focusGoals: string[];
}

const TOTAL_STEPS = 5;

function DOBPicker({ value, onChange }: { value: string | null; onChange: (d: string) => void }) {
  const [show, setShow] = useState(false);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 80 }, (_, i) => currentYear - i);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [selYear, setSelYear] = useState<number | null>(null);
  const [selMonth, setSelMonth] = useState<number | null>(null);
  const [selDay, setSelDay] = useState<number | null>(null);

  const getDays = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const days = selYear !== null && selMonth !== null
    ? Array.from({ length: getDays(selYear, selMonth) }, (_, i) => i + 1)
    : [];

  const openPicker = () => {
    if (value) {
      const d = new Date(value);
      setSelYear(d.getFullYear());
      setSelMonth(d.getMonth());
      setSelDay(d.getDate());
    } else {
      setSelYear(null);
      setSelMonth(null);
      setSelDay(null);
    }
    setShow(true);
  };

  const confirm = () => {
    if (selYear !== null && selMonth !== null && selDay !== null) {
      onChange(`${selYear}-${String(selMonth + 1).padStart(2, "0")}-${String(selDay).padStart(2, "0")}`);
      setShow(false);
    }
  };

  const displayText = value
    ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "Select date of birth";

  return (
    <>
      <Pressable
        style={[fStyles.dobBtn, value ? fStyles.dobBtnActive : null]}
        onPress={openPicker}
      >
        <Ionicons name="calendar-outline" size={20} color={value ? Colors.dark.xpCyan : Colors.dark.textMuted} />
        <Text style={[fStyles.dobText, value ? fStyles.dobTextActive : null]}>{displayText}</Text>
      </Pressable>

      <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
        <Pressable style={fStyles.dobOverlay} onPress={() => setShow(false)}>
          <Pressable style={fStyles.dobModal} onPress={() => {}}>
            <Text style={fStyles.dobTitle}>Date of Birth</Text>
            <View style={fStyles.dobCols}>
              <View style={{ flex: 1 }}>
                <Text style={fStyles.dobColLabel}>Year</Text>
                <ScrollView style={fStyles.dobScroll} showsVerticalScrollIndicator={false}>
                  {years.map((y) => (
                    <Pressable key={y} style={[fStyles.dobItem, selYear === y ? fStyles.dobItemActive : null]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelYear(y); }}>
                      <Text style={[fStyles.dobItemText, selYear === y ? fStyles.dobItemTextActive : null]}>{y}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fStyles.dobColLabel}>Month</Text>
                <ScrollView style={fStyles.dobScroll} showsVerticalScrollIndicator={false}>
                  {months.map((m, i) => (
                    <Pressable key={m} style={[fStyles.dobItem, selMonth === i ? fStyles.dobItemActive : null]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelMonth(i); }}>
                      <Text style={[fStyles.dobItemText, selMonth === i ? fStyles.dobItemTextActive : null]}>{m}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fStyles.dobColLabel}>Day</Text>
                <ScrollView style={fStyles.dobScroll} showsVerticalScrollIndicator={false}>
                  {days.map((d) => (
                    <Pressable key={d} style={[fStyles.dobItem, selDay === d ? fStyles.dobItemActive : null]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelDay(d); }}>
                      <Text style={[fStyles.dobItemText, selDay === d ? fStyles.dobItemTextActive : null]}>{d}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={fStyles.dobActions}>
              <Pressable style={fStyles.dobCancel} onPress={() => setShow(false)}>
                <Text style={fStyles.dobCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[fStyles.dobConfirm, (selYear === null || selMonth === null || selDay === null) ? fStyles.dobConfirmDisabled : null]}
                onPress={confirm}
                disabled={selYear === null || selMonth === null || selDay === null}
              >
                <Text style={fStyles.dobConfirmText}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onComplete: (newPlayerId: string, newPlayerName: string) => void;
}

export default function CreateFamilyMemberFlow({ visible, onClose, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<MemberData>({
    firstName: "",
    lastName: "",
    dateOfBirth: null,
    dominantHand: null,
    backhandType: null,
    experienceLevel: null,
    motivationType: null,
    enjoymentTags: [],
    focusGoals: [],
  });

  const createMutation = useMutation({
    mutationFn: async (memberData: MemberData) => {
      const res = await apiRequest("POST", "/api/family/create-member", memberData);
      return res.json();
    },
    onSuccess: (result) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete(result.player.id, result.player.name);
      resetFlow();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Could not create the profile. Please try again.";
      Alert.alert("Error", msg);
    },
  });

  const resetFlow = () => {
    setStep(0);
    setData({
      firstName: "",
      lastName: "",
      dateOfBirth: null,
      dominantHand: null,
      backhandType: null,
      experienceLevel: null,
      motivationType: null,
      enjoymentTags: [],
      focusGoals: [],
    });
  };

  const handleClose = () => {
    resetFlow();
    onClose();
  };

  const canProceed = () => {
    switch (step) {
      case 0:
        return data.firstName.trim().length > 0 && data.lastName.trim().length > 0;
      case 1:
        return !!data.motivationType;
      case 2:
        return !!data.dominantHand && !!data.backhandType && !!data.experienceLevel;
      case 3:
        return data.enjoymentTags.length > 0;
      case 4:
        return data.focusGoals.length > 0;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setStep((prev) => prev + 1);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStep((prev) => prev - 1);
    }
  };

  const toggleEnjoyment = (id: string) => {
    setData((prev) => {
      const cur = prev.enjoymentTags;
      if (cur.includes(id)) return { ...prev, enjoymentTags: cur.filter((t) => t !== id) };
      if (cur.length >= 3) return prev;
      return { ...prev, enjoymentTags: [...cur, id] };
    });
  };

  const toggleFocus = (id: string) => {
    setData((prev) => {
      const cur = prev.focusGoals;
      if (cur.includes(id)) return { ...prev, focusGoals: cur.filter((t) => t !== id) };
      return { ...prev, focusGoals: [...cur, id] };
    });
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={fStyles.stepContent} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.delay(100).duration(400)}>
              <Text style={fStyles.stepTitle}>New Family Member</Text>
              <Text style={fStyles.stepSubtitle}>Enter basic details for this profile</Text>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(200).duration(400)} style={fStyles.inputGroup}>
              <Text style={fStyles.inputLabel}>First name</Text>
              <TextInput
                style={fStyles.input}
                value={data.firstName}
                onChangeText={(t) => setData((prev) => ({ ...prev, firstName: t }))}
                placeholder="First name"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(260).duration(400)} style={fStyles.inputGroup}>
              <Text style={fStyles.inputLabel}>Last name</Text>
              <TextInput
                style={fStyles.input}
                value={data.lastName}
                onChangeText={(t) => setData((prev) => ({ ...prev, lastName: t }))}
                placeholder="Last name"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(320).duration(400)} style={fStyles.inputGroup}>
              <Text style={fStyles.inputLabel}>Date of birth (optional)</Text>
              <DOBPicker value={data.dateOfBirth} onChange={(d) => setData((prev) => ({ ...prev, dateOfBirth: d }))} />
            </Animated.View>
          </ScrollView>
        );

      case 1:
        return (
          <View style={fStyles.stepContent}>
            <Animated.View entering={FadeInDown.delay(100).duration(400)}>
              <Text style={fStyles.stepTitle}>What motivates {data.firstName || "this member"}?</Text>
              <Text style={fStyles.stepSubtitle}>Choose the best description</Text>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(200).duration(400)} style={fStyles.optionsList}>
              {MOTIVATION_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.id}
                  style={[fStyles.selectCard, data.motivationType === opt.id ? fStyles.selectCardActive : null]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setData((prev) => ({ ...prev, motivationType: opt.id }));
                    setTimeout(handleNext, 250);
                  }}
                >
                  <Ionicons name={opt.icon} size={22} color={data.motivationType === opt.id ? Colors.dark.xpCyan : Colors.dark.textMuted} />
                  <Text style={[fStyles.selectCardText, data.motivationType === opt.id ? fStyles.selectCardTextActive : null]}>{opt.label}</Text>
                  {data.motivationType === opt.id ? (
                    <View style={fStyles.checkBadge}>
                      <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} />
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </Animated.View>
          </View>
        );

      case 2:
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={fStyles.stepContent} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.delay(100).duration(400)}>
              <Text style={fStyles.stepTitle}>Play Style</Text>
              <Text style={fStyles.stepSubtitle}>Dominant hand, backhand and experience</Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(180).duration(400)} style={fStyles.section}>
              <Text style={fStyles.sectionLabel}>Dominant hand</Text>
              <View style={fStyles.handRow}>
                {HAND_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={[fStyles.handBtn, data.dominantHand === opt.id ? fStyles.handBtnActive : null]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setData((prev) => ({ ...prev, dominantHand: opt.id })); }}
                  >
                    <Ionicons name={opt.icon} size={24} color={data.dominantHand === opt.id ? Colors.dark.xpCyan : Colors.dark.textMuted} />
                    <Text style={[fStyles.handBtnText, data.dominantHand === opt.id ? fStyles.handBtnTextActive : null]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(240).duration(400)} style={fStyles.section}>
              <Text style={fStyles.sectionLabel}>Backhand</Text>
              <View style={fStyles.handRow}>
                {BACKHAND_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={[fStyles.handBtn, data.backhandType === opt.id ? fStyles.handBtnActive : null]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setData((prev) => ({ ...prev, backhandType: opt.id })); }}
                  >
                    <Ionicons name={opt.icon} size={24} color={data.backhandType === opt.id ? Colors.dark.xpCyan : Colors.dark.textMuted} />
                    <Text style={[fStyles.handBtnText, data.backhandType === opt.id ? fStyles.handBtnTextActive : null]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(300).duration(400)} style={fStyles.section}>
              <Text style={fStyles.sectionLabel}>Tennis experience</Text>
              <View style={fStyles.expGrid}>
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={[fStyles.expBtn, data.experienceLevel === opt.id ? fStyles.expBtnActive : null]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setData((prev) => ({ ...prev, experienceLevel: opt.id })); }}
                  >
                    <Text style={[fStyles.expBtnText, data.experienceLevel === opt.id ? fStyles.expBtnTextActive : null]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          </ScrollView>
        );

      case 3:
        return (
          <View style={fStyles.stepContent}>
            <Animated.View entering={FadeInDown.delay(100).duration(400)}>
              <Text style={fStyles.stepTitle}>What does {data.firstName || "this member"} enjoy?</Text>
              <Text style={fStyles.stepSubtitle}>Choose up to 3 options</Text>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(200).duration(400)} style={fStyles.gridOptions}>
              {ENJOYMENT_OPTIONS.map((opt) => {
                const sel = data.enjoymentTags.includes(opt.id);
                const disabled = !sel && data.enjoymentTags.length >= 3;
                return (
                  <Pressable
                    key={opt.id}
                    style={[fStyles.gridCard, sel ? fStyles.gridCardActive : null, disabled ? fStyles.gridCardDisabled : null]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleEnjoyment(opt.id); }}
                    disabled={disabled}
                  >
                    <Ionicons name={opt.icon} size={26} color={sel ? Colors.dark.xpCyan : Colors.dark.textMuted} />
                    <Text style={[fStyles.gridCardText, sel ? fStyles.gridCardTextActive : null]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </Animated.View>
            <Text style={fStyles.countText}>{data.enjoymentTags.length}/3 selected</Text>
          </View>
        );

      case 4:
        return (
          <View style={fStyles.stepContent}>
            <Animated.View entering={FadeInDown.delay(100).duration(400)}>
              <Text style={fStyles.stepTitle}>What does {data.firstName || "this member"} want to work on?</Text>
              <Text style={fStyles.stepSubtitle}>Select goals</Text>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(200).duration(400)} style={fStyles.gridOptions}>
              {FOCUS_OPTIONS.map((opt) => {
                const sel = data.focusGoals.includes(opt.id);
                return (
                  <Pressable
                    key={opt.id}
                    style={[fStyles.gridCard, sel ? fStyles.gridCardActive : null]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleFocus(opt.id); }}
                  >
                    <Ionicons name={opt.icon} size={26} color={sel ? Colors.dark.xpCyan : Colors.dark.textMuted} />
                    <Text style={[fStyles.gridCardText, sel ? fStyles.gridCardTextActive : null]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </Animated.View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={fStyles.overlay}>
        <View style={fStyles.sheet}>
          <View style={fStyles.header}>
            <View style={fStyles.progressRow}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <View key={i} style={[fStyles.dot, i <= step ? fStyles.dotActive : null]} />
              ))}
            </View>
            <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <View style={{ flex: 1 }}>
            {renderStep()}
          </View>

          <View style={fStyles.footer}>
            {step > 0 ? (
              <Pressable style={fStyles.backBtn} onPress={handleBack}>
                <Ionicons name="chevron-back" size={20} color={Colors.dark.textMuted} />
                <Text style={fStyles.backBtnText}>Back</Text>
              </Pressable>
            ) : (
              <View style={fStyles.backBtn} />
            )}

            {step === 1 ? null : (
              <Pressable
                style={[fStyles.nextBtn, (!canProceed() || createMutation.isPending) ? fStyles.nextBtnDisabled : null]}
                onPress={handleNext}
                disabled={!canProceed() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.buttonText} size="small" />
                ) : (
                  <>
                    <Text style={fStyles.nextBtnText}>{step === TOTAL_STEPS - 1 ? "Save" : "Next"}</Text>
                    <Ionicons name={step === TOTAL_STEPS - 1 ? "checkmark" : "chevron-forward"} size={18} color={Colors.dark.buttonText} />
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const fStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    minHeight: "60%",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  progressRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  dotActive: {
    backgroundColor: Colors.dark.xpCyan,
    width: 20,
  },
  stepContent: {
    gap: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  stepTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
  },
  stepSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  inputGroup: {
    gap: Spacing.sm,
  },
  inputLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundTertiary,
  },
  dobBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  dobBtnActive: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  dobText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  dobTextActive: {
    color: Colors.dark.text,
  },
  dobOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  dobModal: {
    width: "90%",
    maxWidth: 400,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  dobTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  dobCols: {
    flexDirection: "row",
    gap: Spacing.md,
    height: 200,
  },
  dobColLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  dobScroll: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
  },
  dobItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
  },
  dobItemActive: {
    backgroundColor: `${Colors.dark.xpCyan}20`,
  },
  dobItemText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  dobItemTextActive: {
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  dobActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  dobCancel: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
  },
  dobCancelText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  dobConfirm: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: BorderRadius.md,
  },
  dobConfirmDisabled: {
    opacity: 0.5,
  },
  dobConfirmText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  optionsList: {
    gap: Spacing.md,
  },
  selectCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectCardActive: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  selectCardText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  selectCardTextActive: {
    color: Colors.dark.xpCyan,
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dark.xpCyan,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  handRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  handBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  handBtnActive: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  handBtnText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  handBtnTextActive: {
    color: Colors.dark.xpCyan,
  },
  expGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  expBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  expBtnActive: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  expBtnText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  expBtnTextActive: {
    color: Colors.dark.xpCyan,
  },
  gridOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  gridCard: {
    width: "47%",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  gridCardActive: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: `${Colors.dark.xpCyan}10`,
  },
  gridCardDisabled: {
    opacity: 0.4,
  },
  gridCardText: {
    ...Typography.small,
    color: Colors.dark.text,
    textAlign: "center",
  },
  gridCardTextActive: {
    color: Colors.dark.xpCyan,
  },
  countText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.md,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    minWidth: 80,
  },
  backBtnText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  nextBtnDisabled: {
    opacity: 0.5,
  },
  nextBtnText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});
