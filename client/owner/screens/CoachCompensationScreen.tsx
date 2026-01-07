import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, ActivityIndicator, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

const CURRENCIES = ["AED", "EUR", "USD", "GBP"];

interface CoachContract {
  id: string;
  academyId: string;
  coachId: string;
  compensationType: string;
  currency: string;
  hourlyRate: string | null;
  sessionRate: string | null;
  revenueSharePercent: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Coach {
  id: string;
  userId: string;
  displayName: string;
  email?: string;
}

const COMPENSATION_TYPES = [
  { value: "hourly", label: "Hourly Rate", icon: "time" },
  { value: "per_session", label: "Per Session", icon: "calendar" },
  { value: "revenue_share", label: "Revenue Share", icon: "pie-chart" },
];

export default function CoachCompensationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContract, setEditingContract] = useState<CoachContract | null>(null);
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [compensationType, setCompensationType] = useState("hourly");
  const [hourlyRate, setHourlyRate] = useState("");
  const [sessionRate, setSessionRate] = useState("");
  const [revenueSharePercent, setRevenueSharePercent] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { data: contractsData, isLoading: contractsLoading } = useQuery<CoachContract[]>({
    queryKey: ["/api/coach-contracts"],
  });

  const { data: coachesData } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      coachId: string;
      compensationType: string;
      currency: string;
      hourlyRate?: string;
      sessionRate?: string;
      revenueSharePercent?: string;
      effectiveFrom: string;
      notes?: string;
    }) => {
      return apiRequest("POST", "/api/coach-contracts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach-contracts"] });
      handleCloseModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      const message = error.message || "Failed to create contract";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CoachContract> }) => {
      return apiRequest("PATCH", `/api/coach-contracts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach-contracts"] });
      handleCloseModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      const message = error.message || "Failed to update contract";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
    },
  });

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingContract(null);
    setSelectedCoachId("");
    setCompensationType("hourly");
    setHourlyRate("");
    setSessionRate("");
    setRevenueSharePercent("");
    setCurrency("AED");
    setEffectiveFrom(new Date().toISOString().split("T")[0]);
    setNotes("");
    setShowDatePicker(false);
  };

  const handleOpenAdd = () => {
    handleCloseModal();
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleOpenEdit = (contract: CoachContract) => {
    setEditingContract(contract);
    setSelectedCoachId(contract.coachId);
    setCompensationType(contract.compensationType);
    setHourlyRate(contract.hourlyRate || "");
    setSessionRate(contract.sessionRate || "");
    setRevenueSharePercent(contract.revenueSharePercent || "");
    setCurrency(contract.currency);
    setEffectiveFrom(contract.effectiveFrom);
    setNotes(contract.notes || "");
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = () => {
    if (!selectedCoachId) {
      const message = "Please select a coach";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
      return;
    }

    if (compensationType === "hourly" && (!hourlyRate || parseFloat(hourlyRate) <= 0)) {
      const message = "Please enter a valid hourly rate";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
      return;
    }

    if (compensationType === "per_session" && (!sessionRate || parseFloat(sessionRate) <= 0)) {
      const message = "Please enter a valid session rate";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
      return;
    }

    if (compensationType === "revenue_share" && (!revenueSharePercent || parseFloat(revenueSharePercent) <= 0 || parseFloat(revenueSharePercent) > 100)) {
      const message = "Please enter a valid revenue share percentage (1-100)";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
      return;
    }

    const data = {
      coachId: selectedCoachId,
      compensationType,
      currency,
      hourlyRate: compensationType === "hourly" ? hourlyRate : undefined,
      sessionRate: compensationType === "per_session" ? sessionRate : undefined,
      revenueSharePercent: compensationType === "revenue_share" ? revenueSharePercent : undefined,
      effectiveFrom,
      notes: notes || undefined,
    };

    if (editingContract) {
      updateMutation.mutate({ id: editingContract.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const activeContracts = contractsData?.filter((c) => c.status === "active") || [];
  const scheduledContracts = contractsData?.filter((c) => c.status === "scheduled") || [];
  const terminatedContracts = contractsData?.filter((c) => c.status === "terminated") || [];

  const formatCurrency = (amount: string, curr: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr,
    }).format(num);
  };

  const getCoachName = (coachId: string) => {
    const coach = coachesData?.find((c) => c.id === coachId);
    return coach?.displayName || "Unknown Coach";
  };

  const getCompensationLabel = (type: string) => {
    return COMPENSATION_TYPES.find((t) => t.value === type)?.label || type;
  };

  const getCompensationIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    const found = COMPENSATION_TYPES.find((t) => t.value === type);
    return (found?.icon as keyof typeof Ionicons.glyphMap) || "cash";
  };

  const getCompensationDisplay = (contract: CoachContract) => {
    switch (contract.compensationType) {
      case "hourly":
        return `${formatCurrency(contract.hourlyRate || "0", contract.currency)}/hr`;
      case "per_session":
        return `${formatCurrency(contract.sessionRate || "0", contract.currency)}/session`;
      case "revenue_share":
        return `${contract.revenueSharePercent}% revenue`;
      default:
        return "-";
    }
  };

  const renderContractCard = (contract: CoachContract, showStatus = false) => (
    <Pressable
      key={contract.id}
      style={[styles.contractCard, CardStyles.elevated]}
      onPress={() => handleOpenEdit(contract)}
    >
      <View style={styles.contractCardHeader}>
        <View style={styles.coachInfo}>
          <View style={[styles.coachAvatar, { backgroundColor: `${Colors.dark.gold}15` }]}>
            <Ionicons name="person" size={20} color={Colors.dark.gold} />
          </View>
          <View>
            <Text style={styles.coachName}>{getCoachName(contract.coachId)}</Text>
            <Text style={styles.compensationType}>{getCompensationLabel(contract.compensationType)}</Text>
          </View>
        </View>
        <View style={styles.compensationAmount}>
          <Text style={styles.compensationValue}>{getCompensationDisplay(contract)}</Text>
          {showStatus ? (
            <View style={[styles.statusBadge, contract.status === "active" ? styles.statusActive : styles.statusScheduled]}>
              <Text style={styles.statusText}>
                {contract.status === "active" ? "Active" : contract.status === "scheduled" ? "Scheduled" : "Ended"}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.contractCardFooter}>
        <Ionicons name="calendar-outline" size={14} color={Colors.dark.textMuted} />
        <Text style={styles.contractDate}>
          From {new Date(contract.effectiveFrom).toLocaleDateString()}
          {contract.effectiveUntil ? ` to ${new Date(contract.effectiveUntil).toLocaleDateString()}` : ""}
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
        <Text style={styles.screenTitle}>Coach Compensation</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.subtitle}>Manage how coaches are paid</Text>
        </View>

        {contractsLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.gold} />
          </View>
        ) : (
          <>
            {activeContracts.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active Contracts</Text>
                {activeContracts.map((c) => renderContractCard(c))}
              </View>
            ) : null}

            {scheduledContracts.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Scheduled</Text>
                {scheduledContracts.map((c) => renderContractCard(c, true))}
              </View>
            ) : null}

            {terminatedContracts.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>History</Text>
                {terminatedContracts.slice(0, 5).map((c) => renderContractCard(c))}
              </View>
            ) : null}

            {contractsData?.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="wallet-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTitle}>No Contracts Set</Text>
                <Text style={styles.emptySubtitle}>
                  Add compensation contracts for your coaches
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
              {editingContract ? "Edit Contract" : "Add Contract"}
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
            <Text style={styles.fieldLabel}>Coach *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.coachSelector}>
              {coachesData?.map((coach) => (
                <Pressable
                  key={coach.id}
                  style={[
                    styles.coachOption,
                    selectedCoachId === coach.id && styles.coachOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedCoachId(coach.id);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <View style={[styles.coachOptionAvatar, selectedCoachId === coach.id && styles.coachOptionAvatarSelected]}>
                    <Ionicons
                      name="person"
                      size={16}
                      color={selectedCoachId === coach.id ? Colors.dark.gold : Colors.dark.textMuted}
                    />
                  </View>
                  <Text 
                    style={[
                      styles.coachOptionName,
                      selectedCoachId === coach.id && styles.coachOptionNameSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {coach.displayName || "Coach"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Compensation Type</Text>
            <View style={styles.compTypeGrid}>
              {COMPENSATION_TYPES.map((type) => (
                <Pressable
                  key={type.value}
                  style={[
                    styles.compTypeOption,
                    compensationType === type.value && styles.compTypeSelected,
                  ]}
                  onPress={() => {
                    setCompensationType(type.value);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons
                    name={type.icon as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={compensationType === type.value ? Colors.dark.gold : Colors.dark.textMuted}
                  />
                  <Text style={[
                    styles.compTypeLabel,
                    compensationType === type.value && styles.compTypeLabelSelected,
                  ]}>
                    {type.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {compensationType === "hourly" ? (
              <>
                <Text style={styles.fieldLabel}>Hourly Rate *</Text>
                <View style={styles.priceInputContainer}>
                  <Text style={styles.currencyPrefix}>{currency}</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={hourlyRate}
                    onChangeText={setHourlyRate}
                    placeholder="0.00"
                    placeholderTextColor={Colors.dark.textMuted}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.rateSuffix}>/hour</Text>
                </View>
              </>
            ) : null}

            {compensationType === "per_session" ? (
              <>
                <Text style={styles.fieldLabel}>Session Rate *</Text>
                <View style={styles.priceInputContainer}>
                  <Text style={styles.currencyPrefix}>{currency}</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={sessionRate}
                    onChangeText={setSessionRate}
                    placeholder="0.00"
                    placeholderTextColor={Colors.dark.textMuted}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.rateSuffix}>/session</Text>
                </View>
              </>
            ) : null}

            {compensationType === "revenue_share" ? (
              <>
                <Text style={styles.fieldLabel}>Revenue Share *</Text>
                <View style={styles.priceInputContainer}>
                  <TextInput
                    style={styles.priceInput}
                    value={revenueSharePercent}
                    onChangeText={setRevenueSharePercent}
                    placeholder="0"
                    placeholderTextColor={Colors.dark.textMuted}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.rateSuffix}>%</Text>
                </View>
                <Text style={styles.fieldHint}>
                  Percentage of session revenue paid to coach
                </Text>
              </>
            ) : null}

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
              placeholder="e.g., Annual rate increase"
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
    ...Typography.h3,
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
  contractCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  contractCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  coachInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  coachAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  coachName: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  compensationType: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  compensationAmount: {
    alignItems: "flex-end",
  },
  compensationValue: {
    ...Typography.h3,
    color: Colors.dark.gold,
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
  contractCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.sm,
  },
  contractDate: {
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
  coachSelector: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  coachOption: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginRight: Spacing.sm,
    minWidth: 80,
  },
  coachOptionSelected: {
    borderColor: Colors.dark.gold,
    backgroundColor: `${Colors.dark.gold}10`,
  },
  coachOptionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  coachOptionAvatarSelected: {
    backgroundColor: `${Colors.dark.gold}20`,
  },
  coachOptionName: {
    ...Typography.small,
    color: Colors.dark.text,
    marginTop: Spacing.xs,
    textAlign: "center" as const,
  },
  coachOptionNameSelected: {
    color: Colors.dark.gold,
  },
  compTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  compTypeOption: {
    flex: 1,
    minWidth: 100,
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  compTypeSelected: {
    borderColor: Colors.dark.gold,
    backgroundColor: `${Colors.dark.gold}10`,
  },
  compTypeLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  compTypeLabelSelected: {
    color: Colors.dark.gold,
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
  },
  rateSuffix: {
    ...Typography.body,
    color: Colors.dark.textMuted,
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
