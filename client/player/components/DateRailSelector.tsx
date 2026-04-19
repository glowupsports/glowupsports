import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DAY_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2) / 7;

interface DateRailSelectorProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  daysToShow?: number;
  disabledDates?: Date[];
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const getDayName = (date: Date): string => {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[date.getDay()];
};

const getMonthName = (date: Date): string => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[date.getMonth()];
};

const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

const isToday = (date: Date): boolean => {
  return isSameDay(date, new Date());
};

interface DayItemProps {
  date: Date;
  isSelected: boolean;
  isDisabled: boolean;
  onPress: () => void;
}

function DayItem({ date, isSelected, isDisabled, onPress }: DayItemProps) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(isSelected ? 1 : 0);

  useEffect(() => {
    glowOpacity.value = withSpring(isSelected ? 1 : 0, { damping: 15 });
  }, [isSelected]);

  const handlePress = () => {
    if (isDisabled) return;
    scale.value = withSpring(0.9, { damping: 10 }, () => {
      scale.value = withSpring(1, { damping: 10 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: glowOpacity.value * 0.8,
    shadowRadius: 12,
  }));

  const today = isToday(date);

  return (
    <AnimatedPressable
      onPress={handlePress}
      disabled={isDisabled}
      style={[styles.dayContainer, animatedStyle]}
    >
      <Animated.View
        style={[
          styles.dayInner,
          isSelected && styles.daySelected,
          isDisabled && styles.dayDisabled,
          glowStyle,
        ]}
      >
        <Text
          style={[
            styles.dayName,
            isSelected && styles.dayNameSelected,
            isDisabled && styles.dayNameDisabled,
            today && !isSelected && styles.dayNameToday,
          ]}
        >
          {today ? "Today" : getDayName(date)}
        </Text>
        <Text
          style={[
            styles.dayNumber,
            isSelected && styles.dayNumberSelected,
            isDisabled && styles.dayNumberDisabled,
          ]}
        >
          {date.getDate()}
        </Text>
        <Text
          style={[
            styles.monthName,
            isSelected && styles.monthNameSelected,
            isDisabled && styles.monthNameDisabled,
          ]}
        >
          {getMonthName(date)}
        </Text>
        {isSelected && <View style={styles.glowDot} />}
      </Animated.View>
    </AnimatedPressable>
  );
}

export function DateRailSelector({
  selectedDate,
  onDateSelect,
  daysToShow = 14,
  disabledDates = [],
}: DateRailSelectorProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const dates: Date[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < daysToShow; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date);
  }

  const isDateDisabled = (date: Date): boolean => {
    return disabledDates.some((d) => isSameDay(d, date));
  };

  useEffect(() => {
    const selectedIndex = dates.findIndex((d) => isSameDay(d, selectedDate));
    if (selectedIndex > 0 && scrollViewRef.current) {
      const scrollX = Math.max(0, (selectedIndex - 2) * DAY_WIDTH);
      scrollViewRef.current.scrollTo({ x: scrollX, animated: true });
    }
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Date</Text>
        <Text style={styles.subtitle}>Tap 1 of 3</Text>
      </View>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={DAY_WIDTH}
        decelerationRate="fast"
      >
        {dates.map((date, index) => (
          <DayItem
            key={index}
            date={date}
            isSelected={isSameDay(date, selectedDate)}
            isDisabled={isDateDisabled(date)}
            onPress={() => onDateSelect(date)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  dayContainer: {
    width: DAY_WIDTH,
    alignItems: "center",
  },
  dayInner: {
    width: DAY_WIDTH - 8,
    paddingVertical: Spacing.md,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  daySelected: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
    borderWidth: 2,
  },
  dayDisabled: {
    backgroundColor: Colors.dark.backgroundDefault,
    opacity: 0.4,
  },
  dayName: {
    fontSize: FontSizes.xs,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
    marginBottom: 2,
  },
  dayNameSelected: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  dayNameDisabled: {
    color: Colors.dark.textMuted,
  },
  dayNameToday: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  dayNumber: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dayNumberSelected: {
    color: Colors.dark.primary,
  },
  dayNumberDisabled: {
    color: Colors.dark.textMuted,
  },
  monthName: {
    fontSize: FontSizes.xs,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  monthNameSelected: {
    color: Colors.dark.primary,
  },
  monthNameDisabled: {
    color: Colors.dark.textMuted,
  },
  glowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
    marginTop: 6,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
}));

export default DateRailSelector;
