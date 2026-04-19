import React, { useEffect } from "react";
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
  withSequence,
  withDelay,
  FadeIn,
  FadeInUp,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SLOT_WIDTH = 70;
const SLOT_HEIGHT = 56;

export interface TimeSlot {
  time: string;
  available: boolean;
  price?: string;
  currency?: string;
  courtId?: string;
  courtName?: string;
}

export interface CourtRow {
  courtId: string;
  courtName: string;
  slots: TimeSlot[];
}

interface TimeSlotGridProps {
  courts: CourtRow[];
  selectedSlot: TimeSlot | null;
  onSlotSelect: (slot: TimeSlot, courtId: string, courtName: string) => void;
  isLoading?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface SlotItemProps {
  slot: TimeSlot;
  courtId: string;
  courtName: string;
  isSelected: boolean;
  onPress: () => void;
  index: number;
}

function SlotItem({ slot, courtId, courtName, isSelected, onPress, index }: SlotItemProps) {
  const scale = useSharedValue(1);
  const glowIntensity = useSharedValue(isSelected ? 1 : 0);

  useEffect(() => {
    glowIntensity.value = withSpring(isSelected ? 1 : 0, { damping: 12 });
  }, [isSelected]);

  const handlePress = () => {
    if (!slot.available) return;
    scale.value = withSequence(
      withSpring(0.9, { damping: 10 }),
      withSpring(1.05, { damping: 10 }),
      withSpring(1, { damping: 10 })
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: glowIntensity.value * 0.9,
    shadowRadius: glowIntensity.value * 16,
  }));

  if (!slot.available) {
    return (
      <Animated.View
        entering={FadeIn.delay(index * 20).duration(200)}
        style={styles.slotContainer}
      >
        <View style={[styles.slot, styles.slotUnavailable]}>
          <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.slotTimeUnavailable}>{slot.time}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeIn.delay(index * 20).duration(200)}
      style={styles.slotContainer}
    >
      <AnimatedPressable onPress={handlePress} style={animatedStyle}>
        <Animated.View style={glowStyle}>
          {isSelected ? (
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primary + "CC"]}
              style={[styles.slot, styles.slotSelected]}
            >
              <Ionicons name="checkmark-circle" size={18} color={Colors.dark.text} />
              <Text style={styles.slotTimeSelected}>{slot.time}</Text>
            </LinearGradient>
          ) : (
            <View style={[styles.slot, styles.slotAvailable]}>
              <Text style={styles.slotTime}>{slot.time}</Text>
              {slot.price && (
                <Text style={styles.slotPrice}>
                  {slot.currency || "€"}{slot.price}
                </Text>
              )}
            </View>
          )}
        </Animated.View>
      </AnimatedPressable>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.loadingContainer}>
      {[1, 2, 3].map((row) => (
        <Animated.View
          key={row}
          entering={FadeInUp.delay(row * 100).duration(300)}
          style={styles.loadingRow}
        >
          <View style={styles.loadingCourtName} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.loadingSlots}>
              {[1, 2, 3, 4, 5, 6].map((slot) => (
                <View key={slot} style={styles.loadingSlot} />
              ))}
            </View>
          </ScrollView>
        </Animated.View>
      ))}
    </View>
  );
}

export function TimeSlotGrid({
  courts,
  selectedSlot,
  onSlotSelect,
  isLoading = false,
}: TimeSlotGridProps) {
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (courts.length === 0) {
    return (
      <Animated.View entering={FadeInUp.duration(400)} style={styles.emptyContainer}>
        <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
        <Text style={styles.emptyTitle}>No Courts Available</Text>
        <Text style={styles.emptyText}>Try selecting a different date</Text>
      </Animated.View>
    );
  }

  const hasAvailableSlots = courts.some((court) =>
    court.slots.some((slot) => slot.available)
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Time</Text>
        <Text style={styles.subtitle}>Tap 2 of 3</Text>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendAvailable]} />
          <Text style={styles.legendText}>Available</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendUnavailable]} />
          <Text style={styles.legendText}>Booked</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendSelected]} />
          <Text style={styles.legendText}>Selected</Text>
        </View>
      </View>

      {!hasAvailableSlots ? (
        <Animated.View entering={FadeInUp.duration(400)} style={styles.noSlotsContainer}>
          <Ionicons name="sad-outline" size={40} color={Colors.dark.textMuted} />
          <Text style={styles.noSlotsText}>All slots are booked for this date</Text>
        </Animated.View>
      ) : (
        <ScrollView style={styles.gridContainer} showsVerticalScrollIndicator={false}>
          {courts.map((court, courtIndex) => (
            <Animated.View
              key={court.courtId}
              entering={FadeInUp.delay(courtIndex * 80).duration(300)}
              style={styles.courtRow}
            >
              <View style={styles.courtHeader}>
                <Ionicons name="tennisball" size={16} color={Colors.dark.primary} />
                <Text style={styles.courtName}>{court.courtName}</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.slotsRow}
              >
                {court.slots.map((slot, slotIndex) => (
                  <SlotItem
                    key={`${court.courtId}-${slot.time}`}
                    slot={slot}
                    courtId={court.courtId}
                    courtName={court.courtName}
                    isSelected={
                      selectedSlot?.time === slot.time &&
                      selectedSlot?.courtId === court.courtId
                    }
                    onPress={() => onSlotSelect(
                      { ...slot, courtId: court.courtId, courtName: court.courtName },
                      court.courtId,
                      court.courtName
                    )}
                    index={slotIndex}
                  />
                ))}
              </ScrollView>
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendAvailable: {
    backgroundColor: Colors.dark.primary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  legendUnavailable: {
    backgroundColor: Colors.dark.textMuted,
  },
  legendSelected: {
    backgroundColor: Colors.dark.primary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  legendText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
  },
  gridContainer: {
    flex: 1,
  },
  courtRow: {
    marginBottom: Spacing.md,
  },
  courtHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  courtName: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  slotsRow: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  slotContainer: {
    marginHorizontal: 2,
  },
  slot: {
    width: SLOT_WIDTH,
    height: SLOT_HEIGHT,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  slotAvailable: {
    backgroundColor: Colors.dark.primary + "15",
    borderColor: Colors.dark.primary + "40",
  },
  slotUnavailable: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderColor: Colors.dark.border,
  },
  slotSelected: {
    borderColor: Colors.dark.primary,
    borderWidth: 2,
  },
  slotTime: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  slotTimeSelected: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: 2,
  },
  slotTimeUnavailable: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  slotPrice: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textSecondary,
  },
  noSlotsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  noSlotsText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  loadingContainer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  loadingRow: {
    gap: Spacing.sm,
  },
  loadingCourtName: {
    width: 100,
    height: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 6,
  },
  loadingSlots: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  loadingSlot: {
    width: SLOT_WIDTH,
    height: SLOT_HEIGHT,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
  },
});

export default TimeSlotGrid;
