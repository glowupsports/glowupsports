import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, ActivityIndicator, Platform, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { getCurrentAcademyId } from "@/lib/auth";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface AcademyPricing {
  id: string;
  academyId: string;
  sessionType: string;
  currency: string;
  pricePerSession: string;
  pricePerHour: string | null;
  duration: number | null;
  isPerPerson: boolean | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const SESSION_TYPES = [
  { value: "private", labelKey: "academy.pricing.types.private", icon: "person", perPerson: false },
  { value: "semi_private", labelKey: "academy.pricing.types.semi_private", icon: "people", perPerson: true },
  { value: "group", labelKey: "academy.pricing.types.group", icon: "people-circle", perPerson: true },
  { value: "physical", labelKey: "academy.pricing.types.physical", icon: "fitness", perPerson: true },
  { value: "activity", labelKey: "academy.pricing.types.activity", icon: "football", perPerson: true },
];

const CURRENCIES = ["AED", "EUR", "USD", "GBP"];

export default function PricingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const academyId = getCurrentAcademyId();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPricing, setEditingPricing] = useState<AcademyPricing | null>(null);
  const [selectedSessionType, setSelectedSessionType] = useState("private");
  const [pricePerSession, setPricePerSession] = useState("");
  const [pricePerHour, setPricePerHour] = useState("");
  const [duration, setDuration] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);
  const [effectiveUntil, setEffectiveUntil] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [isPerPerson, setIsPerPerson] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showUntilPicker, setShowUntilPicker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const pricingPath = academyId ? `/api/academies/${academyId}/pricing` : null;

  const { data: pricingData, isLoading } = useQuery<AcademyPricing[]>({
    queryKey: [pricingPath],
    enabled: !!pricingPath,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (!pricingPath) throw new Error("No academy context");
      return apiRequest("POST", pricingPath, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pricingPath] });
      handleCloseModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      setFormError(error?.message || t("academy.pricing.errors.createFailed"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      if (!pricingPath) throw new Error("No academy context");
      return apiRequest("PATCH", `${pricingPath}/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pricingPath] });
      handleCloseModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      setFormError(error?.message || t("academy.pricing.errors.updateFailed"));
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!pricingPath) throw new Error("No academy context");
      return apiRequest("DELETE", `${pricingPath}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pricingPath] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      setListError(error?.message || t("academy.pricing.errors.disableFailed"));
    },
  });

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingPricing(null);
    setSelectedSessionType("private");
    setPricePerSession("");
    setPricePerHour("");
    setDuration("");
    setCurrency("AED");
    setEffectiveFrom(new Date().toISOString().split("T")[0]);
    setEffectiveUntil("");
    setNotes("");
    setIsPerPerson(false);
    setShowDatePicker(false);
    setShowUntilPicker(false);
    setFormError(null);
  };

  const handleOpenAdd = () => {
    handleCloseModal();
    const defaultSessionType = SESSION_TYPES.find((t) => t.value === "private");
    setIsPerPerson(defaultSessionType?.perPerson || false);
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleOpenEdit = (pricing: AcademyPricing) => {
    setEditingPricing(pricing);
    setSelectedSessionType(pricing.sessionType);
    setPricePerSession(pricing.pricePerSession);
    setPricePerHour(pricing.pricePerHour || "");
    setDuration(pricing.duration ? String(pricing.duration) : "");
    setCurrency(pricing.currency);
    setEffectiveFrom(pricing.effectiveFrom);
    setEffectiveUntil(pricing.effectiveUntil || "");
    setNotes(pricing.notes || "");
    const sessionTypeInfo = SESSION_TYPES.find((t) => t.value === pricing.sessionType);
    setIsPerPerson(pricing.isPerPerson ?? sessionTypeInfo?.perPerson ?? false);
    setShowAddModal(true);
    setFormError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = () => {
    setFormError(null);
    const priceNum = parseFloat(pricePerSession);
    if (!pricePerSession || !isFinite(priceNum) || priceNum <= 0) {
      setFormError(t("academy.pricing.errors.priceInvalid"));
      return;
    }
    if (effectiveUntil && effectiveFrom >= effectiveUntil) {
      setFormError(t("academy.pricing.errors.dateOrder"));
      return;
    }

    // Client-side guard for the "max one active per session_type" rule
    if (!editingPricing) {
      const today = new Date().toISOString().split("T")[0];
      const conflict = (pricingData || []).find(
        (p) =>
          p.sessionType === selectedSessionType &&
          p.isActive &&
          effectiveFrom <= today,
      );
      if (conflict) {
        setFormError(t("academy.pricing.errors.activeExists"));
        return;
      }
    }

    const durationNum = duration ? parseInt(duration, 10) : null;
    if (duration && (!isFinite(durationNum as number) || (durationNum as number) <= 0)) {
      setFormError(t("academy.pricing.errors.durationInvalid"));
      return;
    }

    const data: Record<string, unknown> = {
      sessionType: selectedSessionType,
      currency,
      pricePerSession,
      pricePerHour: pricePerHour || null,
      duration: durationNum,
      effectiveFrom,
      effectiveUntil: effectiveUntil || null,
      notes: notes || null,
      isPerPerson,
    };

    if (editingPricing) {
      updateMutation.mutate({ id: editingPricing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDisable = (id: string) => {
    setListError(null);
    disableMutation.mutate(id);
  };

  const today = new Date().toISOString().split("T")[0];
  const activePricing =
    pricingData?.filter(
      (p) =>
        p.isActive &&
        p.effectiveFrom <= today &&
        (!p.effectiveUntil || p.effectiveUntil >= today),
    ) || [];
  const scheduledPricing =
    pricingData?.filter((p) => !p.isActive && !p.effectiveUntil && p.effectiveFrom > today) || [];
  // History/Inactive: anything with an effective_until set (past dates AND
  // just-disabled rows where effective_until = today). This keeps freshly
  // disabled rows visible immediately instead of hiding them for the rest
  // of the day.
  const historicPricing =
    pricingData?.filter((p) => !p.isActive && p.effectiveUntil) || [];

  const formatCurrency = (amount: string, curr: string) => {
    const num = parseFloat(amount);
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: curr }).format(num);
    } catch {
      return `${curr} ${num.toFixed(2)}`;
    }
  };

  const getSessionTypeLabel = (type: string) => {
    const found = SESSION_TYPES.find((s) => s.value === type);
    return found ? t(found.labelKey) : type;
  };

  const getSessionTypeIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    const found = SESSION_TYPES.find((s) => s.value === type);
    return (found?.icon as keyof typeof Ionicons.glyphMap) || "pricetag";
  };

  const renderPricingCard = (pricing: AcademyPricing, showStatus = false, showDisable = false) => (
    <Pressable
      key={pricing.id}
      style={[styles.pricingCard, CardStyles.elevated]}
      onPress={() => handleOpenEdit(pricing)}
    >
      <View style={styles.pricingCardHeader}>
        <View style={styles.pricingTypeContainer}>
          <View style={[styles.pricingIcon, { backgroundColor: `${Colors.dark.gold}15` }]}>
            <Ionicons name={getSessionTypeIcon(pricing.sessionType)} size={20} color={Colors.dark.gold} />
          </View>
          <View>
            <Text style={styles.pricingType}>{getSessionTypeLabel(pricing.sessionType)}</Text>
            {showStatus ? (
              <View style={[styles.statusBadge, pricing.isActive ? styles.statusActive : styles.statusScheduled]}>
                <Text style={styles.statusText}>
                  {pricing.isActive
                    ? t("academy.pricing.status.active")
                    : t("academy.pricing.status.scheduled")}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.pricingAmounts}>
          <Text style={styles.pricingPrice}>
            {formatCurrency(pricing.pricePerSession, pricing.currency)}
          </Text>
          <Text style={styles.pricingLabel}>
            {(pricing.isPerPerson ?? SESSION_TYPES.find((s) => s.value === pricing.sessionType)?.perPerson)
              ? t("academy.pricing.perPerson")
              : t("academy.pricing.perSession")}
          </Text>
          {pricing.pricePerHour ? (
            <Text style={styles.pricingPriceSmall}>
              {formatCurrency(pricing.pricePerHour, pricing.currency)}/hr
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.pricingCardFooter}>
        <Ionicons name="calendar-outline" size={14} color={Colors.dark.textMuted} />
        <Text style={styles.pricingDate}>
          {t("academy.pricing.fromDate", { date: new Date(pricing.effectiveFrom).toLocaleDateString() })}
          {pricing.effectiveUntil
            ? ` ${t("academy.pricing.toDate", { date: new Date(pricing.effectiveUntil).toLocaleDateString() })}`
            : ""}
        </Text>
        {showDisable ? (
          <Pressable
            style={styles.disableButton}
            onPress={(e) => {
              e.stopPropagation?.();
              handleDisable(pricing.id);
            }}
            disabled={disableMutation.isPending}
            hitSlop={8}
          >
            <Text style={styles.disableButtonText}>
              {disableMutation.isPending && disableMutation.variables === pricing.id
                ? t("academy.pricing.disabling")
                : t("academy.pricing.disable")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );

  if (!academyId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.subtitle}>{t("academy.pricing.noAcademyContext")}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.screenHeader}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.screenTitle}>{t("academy.pricing.title")}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.subtitle}>{t("academy.pricing.subtitle")}</Text>
        </View>

        {listError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={Colors.dark.errorNeon || "#ff6b6b"} />
            <Text style={styles.errorText}>{listError}</Text>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.gold} />
          </View>
        ) : (
          <>
            {activePricing.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("academy.pricing.sections.active")}</Text>
                {activePricing.map((p) => renderPricingCard(p, false, true))}
              </View>
            ) : null}

            {scheduledPricing.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("academy.pricing.sections.scheduled")}</Text>
                {scheduledPricing.map((p) => renderPricingCard(p, true, true))}
              </View>
            ) : null}

            {historicPricing.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("academy.pricing.sections.history")}</Text>
                {historicPricing.slice(0, 5).map((p) => renderPricingCard(p))}
              </View>
            ) : null}

            {pricingData?.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="pricetag-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTitle}>{t("academy.pricing.empty.title")}</Text>
                <Text style={styles.emptySubtitle}>{t("academy.pricing.empty.subtitle")}</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Pressable style={[styles.fab, { bottom: insets.bottom + 80 }]} onPress={handleOpenAdd}>
        <Ionicons name="add" size={28} color={Colors.dark.buttonText} />
      </Pressable>

      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={handleCloseModal}>
              <Text style={styles.cancelButton}>{t("academy.pricing.cancel")}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingPricing ? t("academy.pricing.editTitle") : t("academy.pricing.addTitle")}
            </Text>
            <Pressable
              onPress={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              <Text
                style={[
                  styles.saveButton,
                  (createMutation.isPending || updateMutation.isPending) && styles.disabledButton,
                ]}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? t("academy.pricing.saving")
                  : t("academy.pricing.save")}
              </Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalContent}>
            {formError ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={Colors.dark.errorNeon || "#ff6b6b"} />
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>{t("academy.pricing.fields.sessionType")}</Text>
            <View style={styles.sessionTypeGrid}>
              {SESSION_TYPES.map((type) => (
                <Pressable
                  key={type.value}
                  style={[
                    styles.sessionTypeOption,
                    selectedSessionType === type.value && styles.sessionTypeSelected,
                  ]}
                  onPress={() => {
                    setSelectedSessionType(type.value);
                    setIsPerPerson(type.perPerson);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons
                    name={type.icon as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={selectedSessionType === type.value ? Colors.dark.gold : Colors.dark.textMuted}
                  />
                  <View>
                    <Text
                      style={[
                        styles.sessionTypeLabel,
                        selectedSessionType === type.value && styles.sessionTypeLabelSelected,
                      ]}
                    >
                      {t(type.labelKey)}
                    </Text>
                    {type.perPerson ? (
                      <Text style={styles.perPersonHint}>{t("academy.pricing.perPerson")}</Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{t("academy.pricing.fields.pricePerSession")} *</Text>
            <View style={styles.priceInputContainer}>
              <Text style={styles.currencyPrefix}>{currency}</Text>
              <TextInput
                style={styles.priceInput}
                value={pricePerSession}
                onChangeText={setPricePerSession}
                placeholder="0.00"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={styles.fieldLabel}>{t("academy.pricing.fields.pricePerHour")}</Text>
            <View style={styles.priceInputContainer}>
              <Text style={styles.currencyPrefix}>{currency}</Text>
              <TextInput
                style={styles.priceInput}
                value={pricePerHour}
                onChangeText={setPricePerHour}
                placeholder="0.00"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={styles.fieldLabel}>{t("academy.pricing.fields.duration")}</Text>
            <TextInput
              style={styles.textInput}
              value={duration}
              onChangeText={setDuration}
              placeholder="60"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="number-pad"
            />

            <Text style={styles.fieldLabel}>{t("academy.pricing.fields.perPerson")}</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t("academy.pricing.fields.perPersonHint")}</Text>
              <Switch
                value={isPerPerson}
                onValueChange={setIsPerPerson}
                trackColor={{ false: Colors.dark.border, true: Colors.dark.gold }}
                thumbColor={Colors.dark.text}
              />
            </View>

            <Text style={styles.fieldLabel}>{t("academy.pricing.fields.currency")}</Text>
            <View style={styles.currencyOptions}>
              {CURRENCIES.map((curr) => (
                <Pressable
                  key={curr}
                  style={[
                    styles.currencyOption,
                    currency === curr && styles.currencyOptionSelected,
                  ]}
                  onPress={() => {
                    setCurrency(curr);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text
                    style={[
                      styles.currencyOptionText,
                      currency === curr && styles.currencyOptionTextSelected,
                    ]}
                  >
                    {curr}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{t("academy.pricing.fields.effectiveFrom")}</Text>
            {Platform.OS === "web" ? (
              <View style={styles.datePickerButton}>
                <Ionicons name="calendar-outline" size={20} color={Colors.dark.gold} />
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  style={{
                    backgroundColor: "transparent",
                    border: "none",
                    color: Colors.dark.text,
                    fontSize: 16,
                    marginLeft: 8,
                    outline: "none",
                    cursor: "pointer",
                  }}
                />
              </View>
            ) : (
              <>
                <Pressable
                  style={styles.datePickerButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color={Colors.dark.gold} />
                  <Text style={styles.datePickerText}>{new Date(effectiveFrom).toLocaleDateString()}</Text>
                </Pressable>
                {showDatePicker ? (
                  <DateTimePicker
                    value={new Date(effectiveFrom)}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_event, selectedDate) => {
                      if (Platform.OS === "android") setShowDatePicker(false);
                      if (selectedDate) {
                        setEffectiveFrom(selectedDate.toISOString().split("T")[0]);
                      }
                    }}
                    themeVariant="dark"
                  />
                ) : null}
                {Platform.OS === "ios" && showDatePicker ? (
                  <Pressable style={styles.datePickerDone} onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.datePickerDoneText}>{t("academy.pricing.done")}</Text>
                  </Pressable>
                ) : null}
              </>
            )}

            <Text style={styles.fieldLabel}>{t("academy.pricing.fields.effectiveUntil")}</Text>
            {Platform.OS === "web" ? (
              <View style={styles.datePickerButton}>
                <Ionicons name="calendar-outline" size={20} color={Colors.dark.gold} />
                <input
                  type="date"
                  value={effectiveUntil}
                  onChange={(e) => setEffectiveUntil(e.target.value)}
                  style={{
                    backgroundColor: "transparent",
                    border: "none",
                    color: Colors.dark.text,
                    fontSize: 16,
                    marginLeft: 8,
                    outline: "none",
                    cursor: "pointer",
                  }}
                />
              </View>
            ) : (
              <>
                <Pressable
                  style={styles.datePickerButton}
                  onPress={() => setShowUntilPicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color={Colors.dark.gold} />
                  <Text style={styles.datePickerText}>
                    {effectiveUntil
                      ? new Date(effectiveUntil).toLocaleDateString()
                      : t("academy.pricing.optional")}
                  </Text>
                </Pressable>
                {showUntilPicker ? (
                  <DateTimePicker
                    value={effectiveUntil ? new Date(effectiveUntil) : new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_event, selectedDate) => {
                      if (Platform.OS === "android") setShowUntilPicker(false);
                      if (selectedDate) {
                        setEffectiveUntil(selectedDate.toISOString().split("T")[0]);
                      }
                    }}
                    themeVariant="dark"
                  />
                ) : null}
                {Platform.OS === "ios" && showUntilPicker ? (
                  <Pressable style={styles.datePickerDone} onPress={() => setShowUntilPicker(false)}>
                    <Text style={styles.datePickerDoneText}>{t("academy.pricing.done")}</Text>
                  </Pressable>
                ) : null}
              </>
            )}

            <Text style={styles.fieldLabel}>{t("academy.pricing.fields.notes")}</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t("academy.pricing.fields.notesPlaceholder")}
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={3}
            />

            {editingPricing ? (
              <Pressable
                style={styles.disableModalButton}
                onPress={() => {
                  handleDisable(editingPricing.id);
                  handleCloseModal();
                }}
                disabled={disableMutation.isPending}
              >
                <Ionicons name="close-circle-outline" size={18} color={Colors.dark.errorNeon || "#ff6b6b"} />
                <Text style={styles.disableModalButtonText}>{t("academy.pricing.disable")}</Text>
              </Pressable>
            ) : null}
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  screenTitle: { ...Typography.h2, color: Colors.dark.gold },
  scrollView: { flex: 1 },
  content: { padding: Spacing.lg },
  header: { marginBottom: Spacing.xl },
  subtitle: { ...Typography.body, color: Colors.dark.textMuted },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: Spacing.xl * 3 },
  section: { marginBottom: Spacing.xl },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  pricingCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  pricingCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  pricingTypeContainer: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  pricingIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  pricingType: { ...Typography.h4, color: Colors.dark.text },
  statusBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  statusActive: { backgroundColor: `${Colors.dark.successNeon}20` },
  statusScheduled: { backgroundColor: `${Colors.dark.gold}20` },
  statusText: { ...Typography.small, fontSize: 10, color: Colors.dark.text },
  pricingAmounts: { alignItems: "flex-end" },
  pricingPrice: { ...Typography.h2, color: Colors.dark.gold },
  pricingLabel: { ...Typography.small, color: Colors.dark.textMuted },
  pricingPriceSmall: { ...Typography.small, color: Colors.dark.textSecondary, marginTop: 2 },
  pricingCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.sm,
    flexWrap: "wrap",
  },
  pricingDate: { ...Typography.small, color: Colors.dark.textMuted, flex: 1 },
  disableButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    backgroundColor: `${Colors.dark.errorNeon || "#ff6b6b"}20`,
  },
  disableButtonText: {
    ...Typography.small,
    color: Colors.dark.errorNeon || "#ff6b6b",
    fontWeight: "600" as const,
  },
  disableModalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.errorNeon || "#ff6b6b",
  },
  disableModalButtonText: {
    ...Typography.body,
    color: Colors.dark.errorNeon || "#ff6b6b",
    fontWeight: "600" as const,
  },
  emptyState: { alignItems: "center", paddingVertical: Spacing.xl * 2 },
  emptyTitle: { ...Typography.h3, color: Colors.dark.text, marginTop: Spacing.md },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.errorNeon || "#ff6b6b"}15`,
    borderWidth: 1,
    borderColor: `${Colors.dark.errorNeon || "#ff6b6b"}40`,
  },
  errorText: {
    ...Typography.small,
    color: Colors.dark.errorNeon || "#ff6b6b",
    flex: 1,
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.gold,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalContainer: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: { ...Typography.h3, color: Colors.dark.text },
  cancelButton: { ...Typography.body, color: Colors.dark.textMuted },
  saveButton: { ...Typography.h4, color: Colors.dark.gold },
  disabledButton: { opacity: 0.5 },
  modalContent: { padding: Spacing.lg },
  fieldLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  sessionTypeGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  sessionTypeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sessionTypeSelected: { borderColor: Colors.dark.gold, backgroundColor: `${Colors.dark.gold}10` },
  sessionTypeLabel: { ...Typography.body, color: Colors.dark.textMuted },
  sessionTypeLabelSelected: { color: Colors.dark.gold },
  perPersonHint: { ...Typography.small, fontSize: 10, color: Colors.dark.textMuted },
  priceInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  currencyPrefix: { ...Typography.h4, color: Colors.dark.textMuted, paddingHorizontal: Spacing.md },
  priceInput: {
    flex: 1,
    ...Typography.h2,
    color: Colors.dark.text,
    paddingVertical: Spacing.md,
    paddingRight: Spacing.md,
  },
  currencyOptions: { flexDirection: "row", gap: Spacing.sm },
  currencyOption: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  currencyOptionSelected: { borderColor: Colors.dark.gold, backgroundColor: `${Colors.dark.gold}10` },
  currencyOptionText: { ...Typography.body, color: Colors.dark.textMuted },
  currencyOptionTextSelected: { color: Colors.dark.gold },
  textInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  toggleLabel: { ...Typography.body, color: Colors.dark.text, flex: 1, marginRight: Spacing.sm },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  datePickerText: { ...Typography.body, color: Colors.dark.text },
  datePickerDone: { alignSelf: "flex-end", marginTop: Spacing.sm },
  datePickerDoneText: { ...Typography.h4, color: Colors.dark.gold },
});
