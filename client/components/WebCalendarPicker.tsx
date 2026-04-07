import React, { useState, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface WebCalendarPickerProps {
  value: Date;
  onChange: (date: Date) => void;
  maximumDate?: Date;
  minimumDate?: Date;
}

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function WebCalendarPicker({ value, onChange, maximumDate, minimumDate }: WebCalendarPickerProps) {
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());

  useEffect(() => {
    setViewYear(value.getFullYear());
    setViewMonth(value.getMonth());
  }, [value]);

  const daysInMonth = useMemo(() => {
    const firstDay = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const lastDate = new Date(viewYear, viewMonth + 1, 0).getDate();
    
    const days: (number | null)[] = [];
    
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    for (let i = 1; i <= lastDate; i++) {
      days.push(i);
    }
    
    return days;
  }, [viewYear, viewMonth]);

  const goToPrevMonth = (event?: any) => {
    event?.stopPropagation?.();
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = (event?: any) => {
    event?.stopPropagation?.();
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const isDateDisabled = (day: number) => {
    const date = new Date(viewYear, viewMonth, day);
    if (maximumDate && date > maximumDate) return true;
    if (minimumDate && date < minimumDate) return true;
    return false;
  };

  const isDateSelected = (day: number) => {
    return (
      value.getFullYear() === viewYear &&
      value.getMonth() === viewMonth &&
      value.getDate() === day
    );
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    );
  };

  const handleDayPress = (day: number, event?: any) => {
    event?.stopPropagation?.();
    if (isDateDisabled(day)) return;
    const newDate = new Date(viewYear, viewMonth, day);
    onChange(newDate);
  };

  const canGoNext = !maximumDate || new Date(viewYear, viewMonth + 1, 1) <= maximumDate;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={(e) => goToPrevMonth(e)} style={styles.navButton}>
          <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.monthYear}>
          {MONTHS[viewMonth]} {viewYear}
        </Text>
        <Pressable 
          onPress={(e) => goToNextMonth(e)} 
          style={[styles.navButton, !canGoNext && styles.navButtonDisabled]}
          disabled={!canGoNext}
        >
          <Ionicons name="chevron-forward" size={20} color={canGoNext ? Colors.dark.text : Colors.dark.textMuted} />
        </Pressable>
      </View>

      <View style={styles.daysHeader}>
        {DAYS.map((day) => (
          <Text key={day} style={styles.dayLabel}>{day}</Text>
        ))}
      </View>

      <View style={styles.daysGrid}>
        {daysInMonth.map((day, index) => (
          <View key={index} style={styles.dayCell}>
            {day !== null ? (
              <Pressable
                onPress={(e) => handleDayPress(day, e)}
                disabled={isDateDisabled(day)}
                style={[
                  styles.dayButton,
                  isDateSelected(day) && styles.dayButtonSelected,
                  isToday(day) && !isDateSelected(day) && styles.dayButtonToday,
                  isDateDisabled(day) && styles.dayButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    isDateSelected(day) && styles.dayTextSelected,
                    isDateDisabled(day) && styles.dayTextDisabled,
                  ]}
                >
                  {day}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  navButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  monthYear: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  daysHeader: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  dayLabel: {
    flex: 1,
    textAlign: "center",
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    maxWidth: 44,
    maxHeight: 44,
    padding: 2,
    alignSelf: "center",
  },
  dayButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.full,
  },
  dayButtonSelected: {
    backgroundColor: Colors.dark.successNeon,
  },
  dayButtonToday: {
    borderWidth: 1,
    borderColor: Colors.dark.successNeon,
  },
  dayButtonDisabled: {
    opacity: 0.3,
  },
  dayText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  dayTextSelected: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  dayTextDisabled: {
    color: Colors.dark.textMuted,
  },
});
