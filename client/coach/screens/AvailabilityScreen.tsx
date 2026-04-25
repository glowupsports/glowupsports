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
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
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
const TIME_GRID = [
  ["06:00", "06:30", "07:00", "07:30"],
  ["08:00", "08:30", "09:00", "09:30"],
  ["10:00", "10:30", "11:00", "11:30"],
  ["12:00", "12:30", "13:00", "13:30"],
  ["14:00", "14:30", "15:00", "15:30"],
  ["16:00", "16:30", "17:00", "17:30"],
  ["18:00", "18:30", "19:00", "19:30"],
  ["20:00", "20:30", "21:00", "21:30"],
  ["22:00", "22:30", "23:00", "23:30"],
];
const SESSION_LENGTHS = [30, 45, 60, 90];
const BUFFER_OPTIONS = [0, 10, 15, 30];
const REASON_OPTIONS = ["Holiday", "Sick", "Tournament", "Personal"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function generateCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

function formatDateISO(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const DEFAULT_AVAILABILITY: DayAvailability[] = WEEKDAYS.map((_, i) => ({
  weekday: i,
  isAvailable: i >= 1 && i <= 5,
  timeBlocks: i >= 1 && i <= 5 ? [{ id: `default-${i}`, startTime: "09:00", endTime: "18:00" }] : [],
}));

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function OptionButton({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.95, { damping: 15 });
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 15 });
    }, 100);
    onPress();
  };

  return (
    <AnimatedPressable style={[styles.optionButton, animatedStyle]} onPress={handlePress}>
      {isActive ? (
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.optionButtonGradient}
        >
          <Text style={styles.optionButtonTextActive}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={styles.optionButtonInactive}>
          <Text style={styles.optionButtonText}>{label}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

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
  
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerContext, setTimePickerContext] = useState<{ weekday: number; blockId: string; field: "startTime" | "endTime" } | null>(null);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarField, setCalendarField] = useState<"start" | "end">("start");
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());

  const saveScale = useSharedValue(1);

  const saveAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: saveScale.value }],
  }));

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

  useEffect(() => {
    if (availabilityData && Array.isArray(availabilityData) && availabilityData.length > 0) {
      const hydratedAvailability = WEEKDAYS.map((_, i) => {
        const dayData = (availabilityData as any[]).find((d: any) => d.weekday === i);
        if (dayData) {
          const isAvailable = dayData.isActive === true || dayData.isAvailable === true;
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

  const handleSavePress = () => {
    saveScale.value = withSpring(0.95, { damping: 15 });
    setTimeout(() => {
      saveScale.value = withSpring(1, { damping: 15 });
      saveMutation.mutate();
    }, 100);
  };

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

  const openTimePicker = (weekday: number, blockId: string, field: "startTime" | "endTime") => {
    setTimePickerContext({ weekday, blockId, field });
    setShowTimePicker(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const selectTime = (time: string) => {
    if (timePickerContext) {
      updateTimeBlock(timePickerContext.weekday, timePickerContext.blockId, timePickerContext.field, time);
      setShowTimePicker(false);
      setTimePickerContext(null);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  };

  const openCalendarPicker = (field: "start" | "end") => {
    setCalendarField(field);
    const today = new Date();
    setCalendarYear(today.getFullYear());
    setCalendarMonth(today.getMonth());
    setShowCalendarPicker(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const selectDate = (day: number) => {
    const dateStr = formatDateISO(calendarYear, calendarMonth, day);
    if (calendarField === "start") {
      setExceptionStartDate(dateStr);
      if (!exceptionEndDate || dateStr > exceptionEndDate) {
        setExceptionEndDate(dateStr);
      }
    } else {
      setExceptionEndDate(dateStr);
    }
    setShowCalendarPicker(false);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const calendarDays = useMemo(() => generateCalendarDays(calendarYear, calendarMonth), [calendarYear, calendarMonth]);

  const renderDayCard = (day: DayAvailability) => {
    const isExpanded = selectedDay === day.weekday;

    return (
      <View key={day.weekday} style={styles.dayCard}>
        <Pressable
          style={styles.dayHeader}
          onPress={() => setSelectedDay(isExpanded ? null : day.weekday)}
        >
          <View style={styles.dayCardInner}>
            <View style={styles.dayHeaderLeft}>
              <Pressable
                style={[
                  styles.dayToggle,
                  day.isAvailable && styles.dayToggleActive,
                ]}
                onPress={() => toggleDayAvailability(day.weekday)}
              >
                {day.isAvailable ? (
                  <LinearGradient
                    colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.dayToggleGradient}
                  >
                    <Feather name="check" size={14} color={Colors.dark.buttonText} />
                  </LinearGradient>
                ) : null}
              </Pressable>
              <Text style={[styles.dayName, !day.isAvailable && styles.dayNameInactive]}>
                {WEEKDAY_FULL[day.weekday]}
              </Text>
            </View>
            <View style={styles.dayHeaderRight}>
              {day.isAvailable && day.timeBlocks.length > 0 ? (
                <View style={styles.timePreviewBadge}>
                  <Text style={styles.dayTimePreview}>
                    {day.timeBlocks[0].startTime} - {day.timeBlocks[day.timeBlocks.length - 1].endTime}
                  </Text>
                </View>
              ) : (
                <Text style={styles.dayUnavailable}>Unavailable</Text>
              )}
              <View style={styles.chevronContainer}>
                <Feather
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={Colors.dark.xpCyan}
                />
              </View>
            </View>
          </View>
        </Pressable>

        {isExpanded && day.isAvailable ? (
          <View style={styles.dayContent}>
            {day.timeBlocks.map((block, index) => (
              <View key={block.id} style={styles.timeBlockRow}>
                <View style={styles.timeSelector}>
                  <Text style={styles.timeSelectorLabel}>From</Text>
                  <Pressable 
                    style={styles.timeButton}
                    onPress={() => openTimePicker(day.weekday, block.id, "startTime")}
                  >
                    <Text style={styles.timeButtonText}>{block.startTime}</Text>
                    <Feather name="chevron-down" size={14} color={Colors.dark.xpCyan} />
                  </Pressable>
                </View>
                <View style={styles.arrowContainer}>
                  <Feather name="arrow-right" size={16} color={Colors.dark.xpCyan} />
                </View>
                <View style={styles.timeSelector}>
                  <Text style={styles.timeSelectorLabel}>To</Text>
                  <Pressable 
                    style={styles.timeButton}
                    onPress={() => openTimePicker(day.weekday, block.id, "endTime")}
                  >
                    <Text style={styles.timeButtonText}>{block.endTime}</Text>
                    <Feather name="chevron-down" size={14} color={Colors.dark.xpCyan} />
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
              <LinearGradient
                colors={[Colors.dark.primary + "30", Colors.dark.xpCyan + "30"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addBlockButtonGradient}
              >
                <Feather name="plus" size={16} color={Colors.dark.xpCyan} />
                <Text style={styles.addBlockText}>Add time block</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  if (isLoading && coach?.id) {
    return (
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}
      >
        <View style={styles.loadingIconContainer}>
          <Feather name="clock" size={48} color={Colors.dark.xpCyan} />
        </View>
        <Text style={styles.loadingText}>Loading availability...</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerGradientLine}
        />
        <View style={styles.headerContent}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>AVAILABILITY</Text>
            <Text style={styles.headerSubtitle}>Manage when you&apos;re available</Text>
          </View>
          <View style={styles.pauseToggle}>
            <View style={[styles.statusBadge, isPaused ? styles.statusBadgePaused : styles.statusBadgeActive]}>
              <Text style={[styles.pauseLabel, isPaused && styles.pauseLabelPaused]}>
                {isPaused ? "Paused" : "Active"}
              </Text>
            </View>
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
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WEEKLY SCHEDULE</Text>
          {availability.map(renderDayCard)}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SMART RULES</Text>
          <View style={styles.ruleCard}>
            <View style={styles.ruleCardInner}>
              <View style={styles.ruleRow}>
                <View style={styles.ruleIconBadge}>
                  <Feather name="clock" size={18} color={Colors.dark.xpCyan} />
                </View>
                <Text style={styles.ruleLabel}>Minimum session length</Text>
              </View>
              <View style={styles.optionRow}>
                {SESSION_LENGTHS.map((length) => (
                  <OptionButton
                    key={length}
                    label={`${length} min`}
                    isActive={minSessionLength === length}
                    onPress={() => {
                      setMinSessionLength(length);
                      setHasChanges(true);
                    }}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.ruleCard}>
            <View style={styles.ruleCardInner}>
              <View style={styles.ruleRow}>
                <View style={[styles.ruleIconBadge, { backgroundColor: Colors.dark.gold + "20" }]}>
                  <Feather name="pause-circle" size={18} color={Colors.dark.gold} />
                </View>
                <Text style={styles.ruleLabel}>Buffer between sessions</Text>
              </View>
              <View style={styles.optionRow}>
                {BUFFER_OPTIONS.map((buffer) => (
                  <OptionButton
                    key={buffer}
                    label={buffer === 0 ? "None" : `${buffer} min`}
                    isActive={bufferTime === buffer}
                    onPress={() => {
                      setBufferTime(buffer);
                      setHasChanges(true);
                    }}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>EXCEPTIONS</Text>
            <Pressable
              style={styles.addExceptionButton}
              onPress={() => setShowAddException(true)}
            >
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addExceptionGradient}
              >
                <Feather name="plus" size={14} color={Colors.dark.buttonText} />
                <Text style={styles.addExceptionText}>Add</Text>
              </LinearGradient>
            </Pressable>
          </View>
          <Text style={styles.sectionHint}>Exceptions override your weekly schedule</Text>

          {exceptions.length === 0 ? (
            <View style={styles.emptyExceptions}>
              <View style={styles.emptyIconContainer}>
                <Feather name="calendar" size={32} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.emptyExceptionsText}>No exceptions set</Text>
            </View>
          ) : (
            exceptions.map((exc) => (
              <View key={exc.id} style={styles.exceptionCard}>
                <View style={styles.exceptionCardInner}>
                  <View style={styles.exceptionInfo}>
                    <View style={styles.exceptionReasonBadge}>
                      <Feather
                        name={exc.reason === "Holiday" ? "sun" : exc.reason === "Sick" ? "thermometer" : exc.reason === "Tournament" ? "award" : "user"}
                        size={14}
                        color={Colors.dark.gold}
                      />
                      <Text style={styles.exceptionReasonText}>{exc.reason}</Text>
                    </View>
                    <Text style={styles.exceptionDates}>
                      {exc.startDate} - {exc.endDate}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeException(exc.id)} style={styles.deleteButton}>
                    <Feather name="trash-2" size={18} color={Colors.dark.error} />
                  </Pressable>
                </View>
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
          <AnimatedPressable style={saveAnimatedStyle} onPress={handleSavePress}>
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveButton}
            >
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </LinearGradient>
          </AnimatedPressable>
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
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalGradientLine}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ADD EXCEPTION</Text>
              <Pressable onPress={() => setShowAddException(false)}>
                <Feather name="x" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            <Text style={styles.modalHint}>e.g. Dec 31 - unavailable for holiday</Text>

            <View style={styles.modalFormGroup}>
              <Text style={styles.modalLabel}>START DATE</Text>
              <Pressable 
                style={styles.datePickerButton}
                onPress={() => openCalendarPicker("start")}
              >
                <Feather name="calendar" size={18} color={Colors.dark.xpCyan} />
                <Text style={exceptionStartDate ? styles.datePickerText : styles.datePickerPlaceholder}>
                  {exceptionStartDate || "Select start date"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.modalFormGroup}>
              <Text style={styles.modalLabel}>END DATE</Text>
              <Pressable 
                style={styles.datePickerButton}
                onPress={() => openCalendarPicker("end")}
              >
                <Feather name="calendar" size={18} color={Colors.dark.xpCyan} />
                <Text style={exceptionEndDate ? styles.datePickerText : styles.datePickerPlaceholder}>
                  {exceptionEndDate || "Select end date"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.modalFormGroup}>
              <Text style={styles.modalLabel}>REASON</Text>
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
                    {exceptionReason === reason ? (
                      <LinearGradient
                        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.reasonOptionGradient}
                      >
                        <Feather
                          name={reason === "Holiday" ? "sun" : reason === "Sick" ? "thermometer" : reason === "Tournament" ? "award" : "user"}
                          size={16}
                          color={Colors.dark.buttonText}
                        />
                        <Text style={styles.reasonOptionTextActive}>{reason}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={styles.reasonOptionInner}>
                        <Feather
                          name={reason === "Holiday" ? "sun" : reason === "Sick" ? "thermometer" : reason === "Tournament" ? "award" : "user"}
                          size={16}
                          color={Colors.dark.tabIconDefault}
                        />
                        <Text style={styles.reasonOptionText}>{reason}</Text>
                      </View>
                    )}
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
              <LinearGradient
                colors={!exceptionStartDate || !exceptionEndDate ? [Colors.dark.disabled, Colors.dark.disabled] : [Colors.dark.primary, Colors.dark.xpCyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.modalSaveButtonGradient}
              >
                <Text style={styles.modalSaveButtonText}>Add Exception</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showTimePicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.timePickerContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalGradientLine}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {timePickerContext?.field === "startTime" ? "START TIME" : "END TIME"}
              </Text>
              <Pressable onPress={() => setShowTimePicker(false)}>
                <Feather name="x" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            <Text style={styles.modalHint}>Tap to select a time</Text>
            <ScrollView style={styles.timeGridScroll} showsVerticalScrollIndicator={false}>
              {TIME_GRID.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.timeGridRow}>
                  {row.map((time) => {
                    const currentBlock = timePickerContext 
                      ? availability[timePickerContext.weekday]?.timeBlocks.find(b => b.id === timePickerContext.blockId)
                      : null;
                    const isSelected = currentBlock?.[timePickerContext?.field || "startTime"] === time;
                    return (
                      <Pressable
                        key={time}
                        style={[styles.timeGridCell, isSelected && styles.timeGridCellSelected]}
                        onPress={() => selectTime(time)}
                      >
                        {isSelected ? (
                          <LinearGradient
                            colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.timeGridCellGradient}
                          >
                            <Text style={styles.timeGridTextSelected}>{time}</Text>
                          </LinearGradient>
                        ) : (
                          <Text style={styles.timeGridText}>{time}</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCalendarPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCalendarPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.calendarContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalGradientLine}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {calendarField === "start" ? "START DATE" : "END DATE"}
              </Text>
              <Pressable onPress={() => setShowCalendarPicker(false)}>
                <Feather name="x" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            
            <View style={styles.calendarNav}>
              <Pressable 
                style={styles.calendarNavButton}
                onPress={() => {
                  if (calendarMonth === 0) {
                    setCalendarMonth(11);
                    setCalendarYear(y => y - 1);
                  } else {
                    setCalendarMonth(m => m - 1);
                  }
                }}
              >
                <Feather name="chevron-left" size={24} color={Colors.dark.xpCyan} />
              </Pressable>
              <Text style={styles.calendarMonthYear}>
                {MONTHS[calendarMonth]} {calendarYear}
              </Text>
              <Pressable 
                style={styles.calendarNavButton}
                onPress={() => {
                  if (calendarMonth === 11) {
                    setCalendarMonth(0);
                    setCalendarYear(y => y + 1);
                  } else {
                    setCalendarMonth(m => m + 1);
                  }
                }}
              >
                <Feather name="chevron-right" size={24} color={Colors.dark.xpCyan} />
              </Pressable>
            </View>

            <View style={styles.calendarWeekdays}>
              {WEEKDAYS.map(d => (
                <Text key={d} style={styles.calendarWeekday}>{d}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.map((day, i) => {
                if (day === null) {
                  return <View key={`empty-${i}`} style={styles.calendarDayEmpty} />;
                }
                const dateStr = formatDateISO(calendarYear, calendarMonth, day);
                const isStart = exceptionStartDate === dateStr;
                const isEnd = exceptionEndDate === dateStr;
                const isInRange = exceptionStartDate && exceptionEndDate && dateStr > exceptionStartDate && dateStr < exceptionEndDate;
                const today = new Date();
                const todayStr = formatDateISO(today.getFullYear(), today.getMonth(), today.getDate());
                const isToday = dateStr === todayStr;
                const isPast = dateStr < todayStr;
                
                return (
                  <Pressable
                    key={day}
                    style={[
                      styles.calendarDay,
                      (isStart || isEnd) && styles.calendarDaySelected,
                      isInRange && styles.calendarDayInRange,
                      isToday && styles.calendarDayToday,
                    ]}
                    onPress={() => !isPast && selectDate(day)}
                    disabled={isPast}
                  >
                    {isStart || isEnd ? (
                      <LinearGradient
                        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                        style={styles.calendarDayGradient}
                      >
                        <Text style={styles.calendarDayTextSelected}>{day}</Text>
                      </LinearGradient>
                    ) : (
                      <Text style={[
                        styles.calendarDayText,
                        isPast && styles.calendarDayTextPast,
                        isInRange && styles.calendarDayTextInRange,
                      ]}>{day}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
  },
  loadingIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  header: {
    marginBottom: Spacing.sm,
  },
  headerGradientLine: {
    height: 3,
    width: "100%",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.sm,
    marginRight: Spacing.sm,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  headerSubtitle: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    marginTop: 2,
  },
  pauseToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  statusBadgeActive: {
    backgroundColor: Colors.dark.primary + "30",
  },
  statusBadgePaused: {
    backgroundColor: Colors.dark.error + "30",
  },
  pauseLabel: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  pauseLabelPaused: {
    color: Colors.dark.error,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xl,
  },
  section: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  sectionHint: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    marginTop: -Spacing.sm,
  },
  dayCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
    overflow: "hidden",
  },
  dayHeader: {
    borderRadius: BorderRadius.md,
  },
  dayCardInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    padding: Spacing.md,
  },
  dayHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  dayToggle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.dark.tabIconDefault,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  dayToggleActive: {
    borderWidth: 0,
  },
  dayToggleGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  dayName: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  dayNameInactive: {
    color: Colors.dark.tabIconDefault,
  },
  dayHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  timePreviewBadge: {
    backgroundColor: Colors.dark.xpCyan + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  dayTimePreview: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontWeight: "500",
  },
  dayUnavailable: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  chevronContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  dayContent: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.primary + "20",
    backgroundColor: "rgba(18, 18, 22, 0.95)",
    gap: Spacing.md,
  },
  timeBlockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  timeSelector: {
    flex: 1,
  },
  timeSelectorLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  timeButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  arrowContainer: {
    paddingTop: Spacing.lg,
  },
  removeBlockButton: {
    paddingTop: Spacing.lg,
    padding: Spacing.sm,
  },
  addBlockButton: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  addBlockButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
  },
  addBlockText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontWeight: "500",
  },
  ruleCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
    overflow: "hidden",
  },
  ruleCardInner: {
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  ruleIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.xpCyan + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  ruleLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  optionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  optionButton: {
    flex: 1,
    minWidth: 70,
  },
  optionButtonGradient: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  optionButtonInactive: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
  },
  optionButtonText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500",
  },
  optionButtonTextActive: {
    ...Typography.small,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  addExceptionButton: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  addExceptionGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  addExceptionText: {
    ...Typography.small,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  emptyExceptions: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  emptyExceptionsText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  exceptionCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
    overflow: "hidden",
  },
  exceptionCardInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    padding: Spacing.md,
  },
  exceptionInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  exceptionReasonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    alignSelf: "flex-start",
  },
  exceptionReasonText: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "500",
  },
  exceptionDates: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  deleteButton: {
    padding: Spacing.sm,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: "rgba(18, 18, 22, 0.98)",
    borderTopWidth: 1,
    borderTopColor: Colors.dark.primary + "30",
  },
  discardButton: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
  },
  discardButtonText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500",
  },
  saveButton: {
    flex: 2,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalGradientLine: {
    height: 3,
    width: "100%",
    marginBottom: Spacing.md,
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  modalHint: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  modalFormGroup: {
    gap: Spacing.xs,
  },
  modalLabel: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  modalInputWrapper: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
    overflow: "hidden",
  },
  modalInput: {
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    padding: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
  },
  reasonOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  reasonOption: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  reasonOptionActive: {},
  reasonOptionGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  reasonOptionInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.sm,
  },
  reasonOptionText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  reasonOptionTextActive: {
    ...Typography.small,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  modalSaveButton: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  modalSaveButtonDisabled: {},
  modalSaveButtonGradient: {
    padding: Spacing.md,
    alignItems: "center",
  },
  modalSaveButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  datePickerText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  datePickerPlaceholder: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  timePickerContent: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: "70%",
  },
  timeGridScroll: {
    maxHeight: 350,
  },
  timeGridRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  timeGridCell: {
    flex: 1,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
  },
  timeGridCellSelected: {
    borderWidth: 0,
  },
  timeGridCellGradient: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  timeGridText: {
    ...Typography.small,
    color: Colors.dark.text,
    textAlign: "center",
    paddingVertical: Spacing.sm,
  },
  timeGridTextSelected: {
    ...Typography.small,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  calendarContent: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  calendarNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  calendarNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthYear: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  calendarWeekdays: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  calendarWeekday: {
    flex: 1,
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    textAlign: "center",
    fontWeight: "600",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarDay: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  calendarDayEmpty: {
    width: "14.28%",
    aspectRatio: 1,
  },
  calendarDaySelected: {},
  calendarDayInRange: {
    backgroundColor: Colors.dark.xpCyan + "15",
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan,
  },
  calendarDayGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  calendarDayTextPast: {
    color: Colors.dark.tabIconDefault + "60",
  },
  calendarDayTextInRange: {
    color: Colors.dark.xpCyan,
  },
  calendarDayTextSelected: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});
