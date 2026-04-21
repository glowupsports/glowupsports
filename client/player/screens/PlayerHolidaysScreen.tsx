import React, { useState, useLayoutEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Spacing, BorderRadius, Backgrounds, TextColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface VacationData {
  active: boolean;
  currentVacation?: { id: string; startDate: string; endDate: string } | null;
  upcomingVacation?: { id: string; startDate: string; endDate: string } | null;
  holidays: Array<{ id: string; startDate: string; endDate: string }>;
}

const VACATION_BLUE = "#4DA3FF";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function PlayerHolidaysScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsActive, setEditingIsActive] = useState(false);
  const [editingOriginalEnd, setEditingOriginalEnd] = useState<Date | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: t("player.profile.holidays.title"),
      headerTransparent: true,
      headerTintColor: TextColors.primary,
      headerStyle: { backgroundColor: "transparent" },
    });
  }, [navigation, t]);

  const { data: vacationData, isLoading } = useQuery<VacationData>({
    queryKey: ["/api/player/me/vacation"],
  });

  const resetForm = () => {
    setShowModal(false);
    setStartDate(null);
    setEndDate(null);
    setEditingId(null);
    setEditingIsActive(false);
    setEditingOriginalEnd(null);
  };

  const createMutation = useMutation({
    mutationFn: async (data: { startDate: string; endDate: string }) =>
      apiRequest("POST", "/api/player/me/vacation", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/vacation"] });
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => {
      Alert.alert(t("common.error"), err?.message || t("player.profile.holidays.saveError"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; startDate?: string; endDate: string }) =>
      apiRequest("PATCH", `/api/player/me/vacation/${data.id}`, {
        startDate: data.startDate,
        endDate: data.endDate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/vacation"] });
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => {
      Alert.alert(t("common.error"), err?.message || t("player.profile.holidays.saveError"));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/player/me/vacation/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/vacation"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleSave = () => {
    if (!startDate || !endDate) {
      Alert.alert(t("player.profile.holidays.missingDatesTitle"), t("player.profile.holidays.missingDatesBody"));
      return;
    }
    if (endDate < startDate) {
      Alert.alert(t("player.profile.holidays.invalidDatesTitle"), t("player.profile.holidays.invalidDatesBody"));
      return;
    }
    if (editingId) {
      if (editingIsActive && editingOriginalEnd && endDate < editingOriginalEnd) {
        Alert.alert(
          t("player.profile.holidays.invalidDatesTitle"),
          t("player.profile.holidays.activeShortenError"),
        );
        return;
      }
      updateMutation.mutate({
        id: editingId,
        startDate: editingIsActive ? undefined : startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      return;
    }
    createMutation.mutate({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  };

  const handleEdit = (h: { id: string; startDate: string; endDate: string }) => {
    const isActive = vacationData?.currentVacation?.id === h.id;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingId(h.id);
    setEditingIsActive(isActive);
    const start = new Date(h.startDate);
    const end = new Date(h.endDate);
    setStartDate(start);
    setEndDate(end);
    setEditingOriginalEnd(isActive ? end : null);
    setShowModal(true);
  };

  const handleCancel = (id: string) => {
    Alert.alert(
      t("player.profile.holidays.cancelConfirmTitle"),
      t("player.profile.holidays.cancelConfirmBody"),
      [
        { text: t("player.profile.holidays.cancelKeep"), style: "cancel" },
        { text: t("player.profile.holidays.cancel"), style: "destructive", onPress: () => cancelMutation.mutate(id) },
      ]
    );
  };

  const holidays = vacationData?.holidays || [];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <View style={styles.responsibilityCard}>
          <Feather name="info" size={18} color={VACATION_BLUE} />
          <Text style={styles.responsibilityText}>
            {t("player.schedule.vacationBanner.responsibility")}
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color={VACATION_BLUE} style={{ marginTop: Spacing.xl }} />
        ) : holidays.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="sun" size={28} color={VACATION_BLUE} />
            <Text style={styles.emptyTitle}>{t("player.profile.holidays.emptyTitle")}</Text>
            <Text style={styles.emptySubtitle}>
              {t("player.profile.holidays.emptyBody")}
            </Text>
          </View>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {holidays.map((h) => {
              const isActive = vacationData?.currentVacation?.id === h.id;
              return (
                <Pressable
                  key={h.id}
                  style={styles.holidayRow}
                  onPress={() => handleEdit(h)}
                  accessibilityRole="button"
                  accessibilityLabel={t("player.profile.holidays.editAccessibility")}
                >
                  <View
                    style={[
                      styles.holidayIcon,
                      { backgroundColor: VACATION_BLUE + "20" },
                    ]}
                  >
                    <Feather name="sun" size={18} color={VACATION_BLUE} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.holidayTitle}>
                      {isActive
                        ? t("player.schedule.onVacation")
                        : t("player.schedule.upcomingVacation")}
                    </Text>
                    <Text style={styles.holidayDates}>
                      {formatDate(h.startDate)} – {formatDate(h.endDate)}
                    </Text>
                  </View>
                  <Feather
                    name="edit-2"
                    size={16}
                    color={TextColors.secondary}
                    style={{ marginRight: Spacing.xs }}
                  />
                  <Pressable
                    style={styles.cancelButton}
                    onPress={() => handleCancel(h.id)}
                    disabled={cancelMutation.isPending}
                    hitSlop={8}
                  >
                    <Feather name="x" size={18} color="#FF4D4D" />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          style={styles.addButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setEditingId(null);
            setEditingIsActive(false);
            setEditingOriginalEnd(null);
            setStartDate(null);
            setEndDate(null);
            setShowModal(true);
          }}
        >
          <LinearGradient
            colors={[VACATION_BLUE, "#2196F3"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.addButtonGradient}
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.addButtonText}>{t("player.profile.holidays.addButton")}</Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>

      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={resetForm}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId
                  ? t("player.profile.holidays.modalTitleEdit")
                  : t("player.profile.holidays.modalTitle")}
              </Text>
              <Pressable onPress={resetForm}>
                <Feather name="x" size={24} color={TextColors.primary} />
              </Pressable>
            </View>

            <Text style={styles.responsibilityModal}>
              {t("player.schedule.vacationBanner.responsibility")}
            </Text>
            <Text style={styles.modalSubtitle}>
              {t("player.schedule.lessonsWillBePaused")}
            </Text>

            {editingIsActive ? (
              <Text style={styles.activeNote}>
                {t("player.profile.holidays.activeStartLockedNote")}
              </Text>
            ) : null}

            <Pressable
              style={[styles.datePickerButton, editingIsActive && { opacity: 0.5 }]}
              onPress={() => {
                if (editingIsActive) return;
                setShowStartPicker(true);
              }}
              disabled={editingIsActive}
            >
              <Feather
                name={editingIsActive ? "lock" : "calendar"}
                size={18}
                color="#00E5FF"
              />
              <Text style={styles.datePickerLabel}>{t("player.schedule.startDate")}</Text>
              <Text style={styles.datePickerValue}>
                {startDate
                  ? startDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                  : t("player.schedule.selectDate")}
              </Text>
            </Pressable>

            {showStartPicker ? (
              <DateTimePicker
                value={startDate || new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date()}
                onChange={(_e, date) => {
                  setShowStartPicker(Platform.OS === "ios");
                  if (date) setStartDate(date);
                }}
                themeVariant="dark"
              />
            ) : null}

            <Pressable style={styles.datePickerButton} onPress={() => setShowEndPicker(true)}>
              <Feather name="calendar" size={18} color="#00E5FF" />
              <Text style={styles.datePickerLabel}>{t("player.schedule.endDate")}</Text>
              <Text style={styles.datePickerValue}>
                {endDate
                  ? endDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                  : t("player.schedule.selectDate")}
              </Text>
            </Pressable>

            {showEndPicker ? (
              <DateTimePicker
                value={endDate || startDate || new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={
                  editingIsActive && editingOriginalEnd
                    ? editingOriginalEnd
                    : startDate || new Date()
                }
                onChange={(_e, date) => {
                  setShowEndPicker(Platform.OS === "ios");
                  if (date) setEndDate(date);
                }}
                themeVariant="dark"
              />
            ) : null}

            <Pressable
              style={[styles.saveButton, (!startDate || !endDate) && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={
                !startDate ||
                !endDate ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              <LinearGradient
                colors={[VACATION_BLUE, "#2196F3"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveButtonGradient}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="sun" size={18} color="#fff" />
                    <Text style={styles.saveButtonText}>
                      {editingId
                        ? t("player.profile.holidays.saveChanges")
                        : t("player.profile.holidays.save")}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  responsibilityCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: VACATION_BLUE + "15",
    borderWidth: 1,
    borderColor: VACATION_BLUE + "40",
    marginBottom: Spacing.lg,
  },
  responsibilityText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: TextColors.primary,
  },
  emptyCard: {
    alignItems: "center",
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    backgroundColor: Backgrounds.card,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TextColors.primary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: TextColors.secondary,
    textAlign: "center",
  },
  holidayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.card,
  },
  holidayIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  holidayTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TextColors.primary,
  },
  holidayDates: {
    fontSize: 13,
    color: TextColors.secondary,
    marginTop: 2,
  },
  cancelButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FF4D4D" + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: {
    marginTop: Spacing.xl,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  addButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 14,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: TextColors.primary,
  },
  responsibilityModal: {
    fontSize: 13,
    lineHeight: 18,
    color: TextColors.primary,
    backgroundColor: VACATION_BLUE + "15",
    borderWidth: 1,
    borderColor: VACATION_BLUE + "40",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  modalSubtitle: {
    fontSize: 14,
    color: TextColors.secondary,
    marginBottom: Spacing.lg,
  },
  activeNote: {
    fontSize: 13,
    lineHeight: 18,
    color: TextColors.primary,
    backgroundColor: "#FFB347" + "20",
    borderWidth: 1,
    borderColor: "#FFB347" + "60",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.elevated,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  datePickerLabel: {
    flex: 1,
    fontSize: 14,
    color: TextColors.secondary,
  },
  datePickerValue: {
    fontSize: 14,
    fontWeight: "600",
    color: TextColors.primary,
  },
  saveButton: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  saveButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 14,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
}));
