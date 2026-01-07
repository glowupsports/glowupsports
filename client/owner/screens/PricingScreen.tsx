import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, ActivityIndicator, Platform, Alert, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface AcademyPricing {
  id: string;
  academyId: string;
  sessionType: string;
  currency: string;
  pricePerSession: string;
  pricePerHour: string | null;
  isPerPerson: boolean | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const SESSION_TYPES = [
  { value: "private", label: "Private", icon: "person", perPerson: false },
  { value: "semi", label: "Semi-Private", icon: "people", perPerson: true },
  { value: "group", label: "Group", icon: "people-circle", perPerson: true },
  { value: "physical", label: "Physical Training", icon: "fitness", perPerson: true },
  { value: "activity", label: "Activity", icon: "football", perPerson: true },
];

const CURRENCIES = ["AED", "EUR", "USD", "GBP"];

export default function PricingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPricing, setEditingPricing] = useState<AcademyPricing | null>(null);
  const [selectedSessionType, setSelectedSessionType] = useState("private");
  const [pricePerSession, setPricePerSession] = useState("");
  const [pricePerHour, setPricePerHour] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [isPerPerson, setIsPerPerson] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { data: pricingData, isLoading } = useQuery<AcademyPricing[]>({
    queryKey: ["/api/admin/pricing"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      sessionType: string;
      currency: string;
      pricePerSession: string;
      pricePerHour?: string;
      effectiveFrom: string;
      notes?: string;
      isPerPerson?: boolean;
    }) => {
      return apiRequest("POST", "/api/admin/pricing", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
      handleCloseModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      const message = error.message || "Failed to create pricing";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AcademyPricing> }) => {
      return apiRequest("PATCH", `/api/admin/pricing/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
      handleCloseModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      const message = error.message || "Failed to update pricing";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
    },
  });

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingPricing(null);
    setSelectedSessionType("private");
    setPricePerSession("");
    setPricePerHour("");
    setCurrency("AED");
    setEffectiveFrom(new Date().toISOString().split("T")[0]);
    setNotes("");
    setIsPerPerson(false);
    setShowDatePicker(false);
  };

  const handleOpenAdd = () => {
    handleCloseModal();
    const defaultSessionType = SESSION_TYPES.find(t => t.value === "private");
    setIsPerPerson(defaultSessionType?.perPerson || false);
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleOpenEdit = (pricing: AcademyPricing) => {
    setEditingPricing(pricing);
    setSelectedSessionType(pricing.sessionType);
    setPricePerSession(pricing.pricePerSession);
    setPricePerHour(pricing.pricePerHour || "");
    setCurrency(pricing.currency);
    setEffectiveFrom(pricing.effectiveFrom);
    setNotes(pricing.notes || "");
    // Use stored value if exists, otherwise fall back to session type default
    const sessionTypeInfo = SESSION_TYPES.find(t => t.value === pricing.sessionType);
    setIsPerPerson(pricing.isPerPerson ?? sessionTypeInfo?.perPerson ?? false);
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = () => {
    if (!pricePerSession || parseFloat(pricePerSession) <= 0) {
      const message = "Please enter a valid price per session";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
      return;
    }

    const data = {
      sessionType: selectedSessionType,
      currency,
      pricePerSession,
      pricePerHour: pricePerHour || undefined,
      effectiveFrom,
      notes: notes || undefined,
      isPerPerson,
    };

    if (editingPricing) {
      updateMutation.mutate({ id: editingPricing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const activePricing = pricingData?.filter((p) => p.isActive) || [];
  const scheduledPricing = pricingData?.filter((p) => !p.isActive && !p.effectiveUntil) || [];
  const historicPricing = pricingData?.filter((p) => p.effectiveUntil) || [];

  const formatCurrency = (amount: string, curr: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr,
    }).format(num);
  };

  const getSessionTypeLabel = (type: string) => {
    return SESSION_TYPES.find((t) => t.value === type)?.label || type;
  };

  const getSessionTypeIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    const found = SESSION_TYPES.find((t) => t.value === type);
    return (found?.icon as keyof typeof Ionicons.glyphMap) || "pricetag";
  };

  const renderPricingCard = (pricing: AcademyPricing, showStatus = false) => (
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
                  {pricing.isActive ? "Active" : "Scheduled"}
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
            {(pricing.isPerPerson ?? SESSION_TYPES.find(t => t.value === pricing.sessionType)?.perPerson) ? "per person" : "per session"}
          </Text>
          {pricing.pricePerHour ? (
            <>
              <Text style={styles.pricingPriceSmall}>
                {formatCurrency(pricing.pricePerHour, pricing.currency)}/hr
              </Text>
            </>
          ) : null}
        </View>
      </View>
      <View style={styles.pricingCardFooter}>
        <Ionicons name="calendar-outline" size={14} color={Colors.dark.textMuted} />
        <Text style={styles.pricingDate}>
          From {new Date(pricing.effectiveFrom).toLocaleDateString()}
          {pricing.effectiveUntil ? ` to ${new Date(pricing.effectiveUntil).toLocaleDateString()}` : ""}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.screenHeader}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.screenTitle}>Pricing</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.subtitle}>Set session prices for your academy</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.gold} />
          </View>
        ) : (
          <>
            {activePricing.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active Prices</Text>
                {activePricing.map((p) => renderPricingCard(p))}
              </View>
            ) : null}

            {scheduledPricing.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Scheduled</Text>
                {scheduledPricing.map((p) => renderPricingCard(p, true))}
              </View>
            ) : null}

            {historicPricing.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>History</Text>
                {historicPricing.slice(0, 5).map((p) => renderPricingCard(p))}
              </View>
            ) : null}

            {pricingData?.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="pricetag-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTitle}>No Pricing Set</Text>
                <Text style={styles.emptySubtitle}>
                  Add pricing for your session types to start billing
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Pressable style={[styles.fab, { bottom: insets.bottom + 80 }]} onPress={handleOpenAdd}>
        <Ionicons name="add" size={28} color={Colors.dark.backgroundRoot} />
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
              <Text style={styles.cancelButton}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingPricing ? "Edit Pricing" : "Add Pricing"}
            </Text>
            <Pressable
              onPress={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              <Text style={[styles.saveButton, (createMutation.isPending || updateMutation.isPending) && styles.disabledButton]}>
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalContent}>
            <Text style={styles.fieldLabel}>Session Type</Text>
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
                    <Text style={[
                      styles.sessionTypeLabel,
                      selectedSessionType === type.value && styles.sessionTypeLabelSelected,
                    ]}>
                      {type.label}
                    </Text>
                    {type.perPerson ? (
                      <Text style={styles.perPersonHint}>per person</Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Price Per Session *</Text>
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

            <Text style={styles.fieldLabel}>Price Per Hour (Optional)</Text>
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

            <Text style={styles.fieldLabel}>Per Person Pricing</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Price is per person (for multi-player sessions)</Text>
              <Switch
                value={isPerPerson}
                onValueChange={setIsPerPerson}
                trackColor={{ false: Colors.dark.border, true: Colors.dark.gold }}
                thumbColor={Colors.dark.text}
              />
            </View>

            <Text style={styles.fieldLabel}>Currency</Text>
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
                  <Text style={[
                    styles.currencyOptionText,
                    currency === curr && styles.currencyOptionTextSelected,
                  ]}>
                    {curr}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Effective From</Text>
            <Pressable
              style={styles.datePickerButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={Colors.dark.gold} />
              <Text style={styles.datePickerText}>
                {new Date(effectiveFrom).toLocaleDateString()}
              </Text>
            </Pressable>
            {showDatePicker ? (
              <DateTimePicker
                value={new Date(effectiveFrom)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selectedDate) => {
                  if (Platform.OS === "android") {
                    setShowDatePicker(false);
                  }
                  if (selectedDate) {
                    setEffectiveFrom(selectedDate.toISOString().split("T")[0]);
                  }
                }}
                themeVariant="dark"
              />
            ) : null}
            {Platform.OS === "ios" && showDatePicker ? (
              <Pressable style={styles.datePickerDone} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.datePickerDoneText}>Done</Text>
              </Pressable>
            ) : null}
            <Text style={styles.fieldHint}>
              Can be any date (past or future)
            </Text>

            <Text style={styles.fieldLabel}>Notes (Optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g., Summer pricing adjustment"
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={3}
            />
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  screenTitle: {
    ...Typography.h2,
    color: Colors.dark.gold,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing.xl * 3,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  pricingCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  pricingCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  pricingTypeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pricingIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  pricingType: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  statusBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    marginTop: 4,
  },
  statusActive: {
    backgroundColor: `${Colors.dark.successNeon}20`,
  },
  statusScheduled: {
    backgroundColor: `${Colors.dark.gold}20`,
  },
  statusText: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.text,
  },
  pricingAmounts: {
    alignItems: "flex-end",
  },
  pricingPrice: {
    ...Typography.h2,
    color: Colors.dark.gold,
  },
  pricingLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  pricingPriceSmall: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  pricingCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.sm,
  },
  pricingDate: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.xs,
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
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  cancelButton: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  saveButton: {
    ...Typography.h4,
    color: Colors.dark.gold,
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalContent: {
    padding: Spacing.lg,
  },
  fieldLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  fieldHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  sessionTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
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
  sessionTypeSelected: {
    borderColor: Colors.dark.gold,
    backgroundColor: `${Colors.dark.gold}10`,
  },
  sessionTypeLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  sessionTypeLabelSelected: {
    color: Colors.dark.gold,
  },
  perPersonHint: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  priceInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  currencyPrefix: {
    ...Typography.h4,
    color: Colors.dark.textMuted,
    paddingHorizontal: Spacing.md,
  },
  priceInput: {
    flex: 1,
    ...Typography.h2,
    color: Colors.dark.text,
    paddingVertical: Spacing.md,
    paddingRight: Spacing.md,
  },
  currencyOptions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  currencyOption: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  currencyOptionSelected: {
    borderColor: Colors.dark.gold,
    backgroundColor: `${Colors.dark.gold}10`,
  },
  currencyOptionText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  currencyOptionTextSelected: {
    color: Colors.dark.gold,
  },
  textInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
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
  toggleLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
    marginRight: Spacing.sm,
  },
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
  datePickerText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  datePickerDone: {
    alignSelf: "flex-end",
    marginTop: Spacing.sm,
  },
  datePickerDoneText: {
    ...Typography.h4,
    color: Colors.dark.gold,
  },
});
