import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Platform,
  Modal,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

type TimeBlock = {
  id: string;
  startTime: string;
  endTime: string;
};

type DayAvailability = {
  weekday: number;
  isAvailable: boolean;
  timeBlocks: TimeBlock[];
};

type Exception = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_OPTIONS = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];
const SESSION_LENGTHS = [30, 45, 60, 90];
const BUFFER_OPTIONS = [0, 10, 15, 30];
const REASON_OPTIONS = ["Holiday", "Sick", "Tournament", "Personal"];

const DEFAULT_AVAILABILITY: DayAvailability[] = WEEKDAYS.map((_, i) => ({
  weekday: i,
  isAvailable: i >= 1 && i <= 5,
  timeBlocks: i >= 1 && i <= 5 ? [{ id: `default-${i}`, startTime: "09:00", endTime: "18:00" }] : [],
}));

export default function AvailabilityScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { coach } = useCoach();
  const queryClient = useQueryClient();

  const [isPaused, setIsPaused] = useState(false);
  const [availability, setAvailability] = useState<DayAvailability[]>(DEFAULT_AVAILABILITY);
  const [minSessionLength, setMinSessionLength] = useState(60);
  const [bufferTime, setBufferTime] = useState(15);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showAddException, setShowAddException] = useState(false);
  const [exceptionStartDate, setExceptionStartDate] = useState("");
  const [exceptionEndDate, setExceptionEndDate] = useState("");
  const [exceptionReason, setExceptionReason] = useState("Holiday");

  const { data: availabilityData, isLoading } = useQuery({
    queryKey: ["/api/coaches", coach?.id, "availability"],
    enabled: !!coach?.id,
  });

  const { data: settingsData } = useQuery({
    queryKey: ["/api/coaches", coach?.id, "settings"],
    enabled: !!coach?.id,
  });

  const { data: exceptionsData } = useQuery({
    queryKey: ["/api/coaches", coach?.id, "availability-exceptions"],
    enabled: !!coach?.id,
  });

  // Hydrate state from API data
  useEffect(() => {
    if (availabilityData && Array.isArray(availabilityData) && availabilityData.length > 0) {
      const hydratedAvailability = WEEKDAYS.map((_, i) => {
        const dayData = (availabilityData as any[]).find((d: any) => d.weekday === i);
        if (dayData) {
          // Respect the isAvailable flag from backend
          const isAvailable = dayData.isAvailable === true;
          // Handle both timeBlocks array format and single start/end format
          let timeBlocks: TimeBlock[] = [];
          if (dayData.timeBlocks && Array.isArray(dayData.timeBlocks) && dayData.timeBlocks.length > 0) {
            timeBlocks = dayData.timeBlocks;
          } else if (dayData.startTime && dayData.endTime && isAvailable) {
            timeBlocks = [{ id: `loaded-${i}`, startTime: dayData.startTime, endTime: dayData.endTime }];
          } else if (isAvailable) {
            timeBlocks = [{ id: `default-${i}`, startTime: "09:00", endTime: "18:00" }];
          }
          return { weekday: i, isAvailable, timeBlocks };
        }
        return DEFAULT_AVAILABILITY[i];
      });
      setAvailability(hydratedAvailability);
    }
  }, [availabilityData]);

  useEffect(() => {
    if (settingsData) {
      const settings = settingsData as any;
      if (settings.minSessionLength) setMinSessionLength(settings.minSessionLength);
      if (settings.bufferBetweenSessions !== undefined) setBufferTime(settings.bufferBetweenSessions);
      if (settings.availabilityPaused !== undefined) setIsPaused(settings.availabilityPaused);
    }
  }, [settingsData]);

  useEffect(() => {
    if (exceptionsData && Array.isArray(exceptionsData)) {
      const hydratedExceptions = (exceptionsData as any[]).map((exc: any) => ({
        id: exc.id || `exc-${exc.startDate}`,
        startDate: exc.startDate,
        endDate: exc.endDate,
        reason: exc.reason || "Personal",
      }));
      setExceptions(hydratedExceptions);
    }
  }, [exceptionsData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/coaches/${coach?.id}/availability`, {
        availability,
        settings: {
          minSessionLength,
          bufferBetweenSessions: bufferTime,
          availabilityPaused: isPaused,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", coach?.id] });
      setHasChanges(false);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert("Saved", "Your availability has been updated.");
    },
    onError: () => {
      Alert.alert("Error", "Failed to save availability. Please try again.");
    },
  });

  const toggleDayAvailability = useCallback((weekday: number) => {
    setAvailability((prev) => {
      const updated = prev.map((day) => {
        if (day.weekday === weekday) {
          const newIsAvailable = !day.isAvailable;
          return {
            ...day,
            isAvailable: newIsAvailable,
            timeBlocks: newIsAvailable && day.timeBlocks.length === 0
              ? [{ id: `new-${Date.now()}`, startTime: "09:00", endTime: "18:00" }]
              : day.timeBlocks,
          };
        }
        return day;
      });
      return updated;
    });
    setHasChanges(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const addTimeBlock = useCallback((weekday: number) => {
    setAvailability((prev) =>
      prev.map((day) => {
        if (day.weekday === weekday) {
          const lastBlock = day.timeBlocks[day.timeBlocks.length - 1];
          const newStart = lastBlock ? lastBlock.endTime : "09:00";
          const newEnd = incrementTime(newStart, 3);
          return {
            ...day,
            timeBlocks: [
              ...day.timeBlocks,
              { id: `block-${Date.now()}`, startTime: newStart, endTime: newEnd },
            ],
          };
        }
        return day;
      })
    );
    setHasChanges(true);
  }, []);

  const removeTimeBlock = useCallback((weekday: number, blockId: string) => {
    setAvailability((prev) =>
      prev.map((day) => {
        if (day.weekday === weekday) {
          return {
            ...day,
            timeBlocks: day.timeBlocks.filter((b) => b.id !== blockId),
          };
        }
        return day;
      })
    );
    setHasChanges(true);
  }, []);

  const updateTimeBlock = useCallback((weekday: number, blockId: string, field: "startTime" | "endTime", value: string) => {
    setAvailability((prev) =>
      prev.map((day) => {
        if (day.weekday === weekday) {
          return {
            ...day,
            timeBlocks: day.timeBlocks.map((b) =>
              b.id === blockId ? { ...b, [field]: value } : b
            ),
          };
        }
        return day;
      })
    );
    setHasChanges(true);
  }, []);

  const addException = useCallback((startDate: string, endDate: string, reason: string) => {
    setExceptions((prev) => [
      ...prev,
      { id: `exc-${Date.now()}`, startDate, endDate, reason },
    ]);
    setHasChanges(true);
    setShowAddException(false);
  }, []);

  const removeException = useCallback((id: string) => {
    setExceptions((prev) => prev.filter((e) => e.id !== id));
    setHasChanges(true);
  }, []);

  const incrementTime = (time: string, hours: number): string => {
    const [h, m] = time.split(":").map(Number);
    const newH = Math.min(22, h + hours);
    return `${newH.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  const renderDayCard = (day: DayAvailability) => {
    const isExpanded = selectedDay === day.weekday;

    return (
      <View key={day.weekday} style={styles.dayCard}>
        <Pressable
          style={styles.dayHeader}
          onPress={() => setSelectedDay(isExpanded ? null : day.weekday)}
        >
          <View style={styles.dayHeaderLeft}>
            <Pressable
              style={[
                styles.dayToggle,
                day.isAvailable && styles.dayToggleActive,
              ]}
              onPress={() => toggleDayAvailability(day.weekday)}
            >
              {day.isAvailable ? (
                <Feather name="check" size={14} color={Colors.dark.backgroundRoot} />
              ) : null}
            </Pressable>
            <Text style={[styles.dayName, !day.isAvailable && styles.dayNameInactive]}>
              {WEEKDAY_FULL[day.weekday]}
            </Text>
          </View>
          <View style={styles.dayHeaderRight}>
            {day.isAvailable && day.timeBlocks.length > 0 ? (
              <Text style={styles.dayTimePreview}>
                {day.timeBlocks[0].startTime} - {day.timeBlocks[day.timeBlocks.length - 1].endTime}
              </Text>
            ) : (
              <Text style={styles.dayUnavailable}>Unavailable</Text>
            )}
            <Feather
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={Colors.dark.tabIconDefault}
            />
          </View>
        </Pressable>

        {isExpanded && day.isAvailable ? (
          <View style={styles.dayContent}>
            {day.timeBlocks.map((block, index) => (
              <View key={block.id} style={styles.timeBlockRow}>
                <View style={styles.timeSelector}>
                  <Text style={styles.timeSelectorLabel}>From</Text>
                  <Pressable style={styles.timeButton}>
                    <Text style={styles.timeButtonText}>{block.startTime}</Text>
                  </Pressable>
                </View>
                <Feather name="arrow-right" size={16} color={Colors.dark.tabIconDefault} />
                <View style={styles.timeSelector}>
                  <Text style={styles.timeSelectorLabel}>To</Text>
                  <Pressable style={styles.timeButton}>
                    <Text style={styles.timeButtonText}>{block.endTime}</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={styles.removeBlockButton}
                  onPress={() => removeTimeBlock(day.weekday, block.id)}
                >
                  <Feather name="x" size={18} color={Colors.dark.error} />
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.addBlockButton} onPress={() => addTimeBlock(day.weekday)}>
              <Feather name="plus" size={16} color={Colors.dark.primary} />
              <Text style={styles.addBlockText}>Add time block</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  // Show loading state while fetching data
  if (isLoading && coach?.id) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <Feather name="clock" size={48} color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading availability...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Availability</Text>
          <Text style={styles.headerSubtitle}>Manage when you're available for sessions</Text>
        </View>
        <View style={styles.pauseToggle}>
          <Text style={[styles.pauseLabel, isPaused && styles.pauseLabelActive]}>
            {isPaused ? "Paused" : "Active"}
          </Text>
          <Switch
            value={!isPaused}
            onValueChange={(value) => {
              setIsPaused(!value);
              setHasChanges(true);
            }}
            trackColor={{ false: Colors.dark.backgroundTertiary, true: Colors.dark.primary }}
            thumbColor={Colors.dark.text}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Schedule</Text>
          {availability.map(renderDayCard)}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Smart Rules</Text>
          <View style={styles.ruleCard}>
            <View style={styles.ruleRow}>
              <Feather name="clock" size={18} color={Colors.dark.primary} />
              <Text style={styles.ruleLabel}>Minimum session length</Text>
            </View>
            <View style={styles.optionRow}>
              {SESSION_LENGTHS.map((length) => (
                <Pressable
                  key={length}
                  style={[
                    styles.optionButton,
                    minSessionLength === length && styles.optionButtonActive,
                  ]}
                  onPress={() => {
                    setMinSessionLength(length);
                    setHasChanges(true);
                  }}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      minSessionLength === length && styles.optionButtonTextActive,
                    ]}
                  >
                    {length} min
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.ruleCard}>
            <View style={styles.ruleRow}>
              <Feather name="pause-circle" size={18} color={Colors.dark.primary} />
              <Text style={styles.ruleLabel}>Buffer between sessions</Text>
            </View>
            <View style={styles.optionRow}>
              {BUFFER_OPTIONS.map((buffer) => (
                <Pressable
                  key={buffer}
                  style={[
                    styles.optionButton,
                    bufferTime === buffer && styles.optionButtonActive,
                  ]}
                  onPress={() => {
                    setBufferTime(buffer);
                    setHasChanges(true);
                  }}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      bufferTime === buffer && styles.optionButtonTextActive,
                    ]}
                  >
                    {buffer === 0 ? "None" : `${buffer} min`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Exceptions</Text>
            <Pressable
              style={styles.addExceptionButton}
              onPress={() => setShowAddException(true)}
            >
              <Feather name="plus" size={16} color={Colors.dark.primary} />
              <Text style={styles.addExceptionText}>Add</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionHint}>Exceptions override your weekly schedule</Text>

          {exceptions.length === 0 ? (
            <View style={styles.emptyExceptions}>
              <Feather name="calendar" size={32} color={Colors.dark.tabIconDefault} />
              <Text style={styles.emptyExceptionsText}>No exceptions set</Text>
            </View>
          ) : (
            exceptions.map((exc) => (
              <View key={exc.id} style={styles.exceptionCard}>
                <View style={styles.exceptionInfo}>
                  <View style={styles.exceptionReasonBadge}>
                    <Feather
                      name={exc.reason === "Holiday" ? "sun" : exc.reason === "Sick" ? "thermometer" : exc.reason === "Tournament" ? "award" : "user"}
                      size={14}
                      color={Colors.dark.primary}
                    />
                    <Text style={styles.exceptionReasonText}>{exc.reason}</Text>
                  </View>
                  <Text style={styles.exceptionDates}>
                    {exc.startDate} - {exc.endDate}
                  </Text>
                </View>
                <Pressable onPress={() => removeException(exc.id)}>
                  <Feather name="trash-2" size={18} color={Colors.dark.error} />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {hasChanges ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Pressable
            style={styles.discardButton}
            onPress={() => {
              setAvailability(DEFAULT_AVAILABILITY);
              setHasChanges(false);
            }}
          >
            <Text style={styles.discardButtonText}>Discard</Text>
          </Pressable>
          <Pressable
            style={styles.saveButton}
            onPress={() => saveMutation.mutate()}
          >
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={showAddException}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddException(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Exception</Text>
              <Pressable onPress={() => setShowAddException(false)}>
                <Feather name="x" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            <Text style={styles.modalHint}>e.g. Dec 31 - unavailable for holiday</Text>

            <View style={styles.modalFormGroup}>
              <Text style={styles.modalLabel}>Start Date</Text>
              <TextInput
                style={styles.modalInput}
                value={exceptionStartDate}
                onChangeText={setExceptionStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.dark.disabled}
              />
            </View>

            <View style={styles.modalFormGroup}>
              <Text style={styles.modalLabel}>End Date</Text>
              <TextInput
                style={styles.modalInput}
                value={exceptionEndDate}
                onChangeText={setExceptionEndDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.dark.disabled}
              />
            </View>

            <View style={styles.modalFormGroup}>
              <Text style={styles.modalLabel}>Reason</Text>
              <View style={styles.reasonOptions}>
                {REASON_OPTIONS.map((reason) => (
                  <Pressable
                    key={reason}
                    style={[
                      styles.reasonOption,
                      exceptionReason === reason && styles.reasonOptionActive,
                    ]}
                    onPress={() => setExceptionReason(reason)}
                  >
                    <Feather
                      name={reason === "Holiday" ? "sun" : reason === "Sick" ? "thermometer" : reason === "Tournament" ? "award" : "user"}
                      size={16}
                      color={exceptionReason === reason ? Colors.dark.backgroundRoot : Colors.dark.text}
                    />
                    <Text style={[
                      styles.reasonOptionText,
                      exceptionReason === reason && styles.reasonOptionTextActive,
                    ]}>
                      {reason}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable
              style={[
                styles.modalSaveButton,
                (!exceptionStartDate || !exceptionEndDate) && styles.modalSaveButtonDisabled,
              ]}
              onPress={() => {
                if (exceptionStartDate && exceptionEndDate) {
                  addException(exceptionStartDate, exceptionEndDate, exceptionReason);
                  setExceptionStartDate("");
                  setExceptionEndDate("");
                  setExceptionReason("Holiday");
                }
              }}
              disabled={!exceptionStartDate || !exceptionEndDate}
            >
              <Text style={styles.modalSaveButtonText}>Add Exception</Text>
            </Pressable>
          </View>
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
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  backButton: {
    padding: Spacing.sm,
    marginRight: Spacing.sm,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  headerSubtitle: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  pauseToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pauseLabel: {
    ...Typography.caption,
    color: Colors.dark.primary,
  },
  pauseLabelActive: {
    color: Colors.dark.orange,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  section: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  sectionHint: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginTop: -Spacing.sm,
  },
  dayCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  dayHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  dayToggle: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: Colors.dark.tabIconDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  dayToggleActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  dayName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  dayNameInactive: {
    color: Colors.dark.tabIconDefault,
  },
  dayHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dayTimePreview: {
    ...Typography.small,
    color: Colors.dark.primary,
  },
  dayUnavailable: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  dayContent: {
    padding: Spacing.lg,
    paddingTop: 0,
    gap: Spacing.md,
  },
  timeBlockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  timeSelector: {
    flex: 1,
    gap: Spacing.xs,
  },
  timeSelectorLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  timeButton: {
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  timeButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  removeBlockButton: {
    padding: Spacing.sm,
  },
  addBlockButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
    borderStyle: "dashed",
    borderRadius: BorderRadius.sm,
  },
  addBlockText: {
    ...Typography.small,
    color: Colors.dark.primary,
  },
  ruleCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  ruleLabel: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  optionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  optionButton: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  optionButtonActive: {
    backgroundColor: Colors.dark.primary,
  },
  optionButtonText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  optionButtonTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  addExceptionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
  },
  addExceptionText: {
    ...Typography.small,
    color: Colors.dark.primary,
  },
  emptyExceptions: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyExceptionsText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  exceptionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  exceptionInfo: {
    gap: Spacing.xs,
  },
  exceptionReasonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  exceptionReasonText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  exceptionDates: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
  },
  discardButton: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  discardButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  saveButton: {
    flex: 2,
    backgroundColor: Colors.dark.primary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  modalHint: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginTop: -Spacing.sm,
  },
  modalFormGroup: {
    gap: Spacing.sm,
  },
  modalLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  modalInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
  },
  reasonOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  reasonOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  reasonOptionActive: {
    backgroundColor: Colors.dark.primary,
  },
  reasonOptionText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  reasonOptionTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  modalSaveButton: {
    backgroundColor: Colors.dark.primary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  modalSaveButtonDisabled: {
    opacity: 0.5,
  },
  modalSaveButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
});
