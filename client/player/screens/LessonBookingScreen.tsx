import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface AvailableSlot {
  id: string;
  coachId: string;
  coachName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  locationName?: string;
  courtName?: string;
}

const SESSION_TYPES = [
  { id: "private", label: "Private", icon: "person" },
  { id: "group", label: "Group", icon: "people" },
  { id: "hitting", label: "Hitting", icon: "tennisball" },
];

const DURATION_OPTIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hrs" },
  { value: 120, label: "2 hrs" },
];

export default function LessonBookingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [selectedSessionType, setSelectedSessionType] = useState("private");
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [playerNote, setPlayerNote] = useState("");
  
  const startDate = useMemo(() => {
    const date = new Date(selectedDate);
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  }, [selectedDate]);
  
  const endDate = useMemo(() => {
    const date = new Date(selectedDate);
    date.setHours(23, 59, 59, 999);
    return date.toISOString();
  }, [selectedDate]);

  const { data: slots, isLoading: slotsLoading } = useQuery<AvailableSlot[]>({
    queryKey: ["/api/player/availability", startDate, endDate, selectedDuration],
    queryFn: async () => {
      const url = new URL("/api/player/availability", getApiUrl());
      url.searchParams.set("startDate", startDate);
      url.searchParams.set("endDate", endDate);
      url.searchParams.set("duration", selectedDuration.toString());
      const response = await fetch(url.toString(), {
        credentials: "include",
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const bookingMutation = useMutation({
    mutationFn: async (slot: AvailableSlot) => {
      const requestedStart = new Date(`${slot.date}T${slot.startTime}`);
      const requestedEnd = new Date(`${slot.date}T${slot.endTime}`);
      
      return apiRequest("POST", "/api/player/booking-requests", {
        coachId: slot.coachId,
        requestedStart: requestedStart.toISOString(),
        requestedEnd: requestedEnd.toISOString(),
        duration: selectedDuration,
        sessionType: selectedSessionType,
        playerNote: playerNote.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/booking-requests"] });
      Alert.alert(
        "Request Sent!",
        "Your lesson request has been sent to the coach. You'll be notified when they respond.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to submit booking request");
    },
  });

  const handleSubmit = () => {
    if (!selectedSlot) {
      Alert.alert("Select a Time", "Please select an available time slot");
      return;
    }
    bookingMutation.mutate(selectedSlot);
  };

  const getNextDays = () => {
    const days = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const formatDate = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return {
      day: days[date.getDay()],
      date: date.getDate(),
      month: date.toLocaleDateString("en-US", { month: "short" }),
    };
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSameDay = (d1: Date, d2: Date) => d1.toDateString() === d2.toDateString();

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollViewCompat 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Session Type</Text>
          <View style={styles.sessionTypes}>
            {SESSION_TYPES.map((type) => (
              <Pressable
                key={type.id}
                style={[
                  styles.sessionTypeCard,
                  selectedSessionType === type.id && styles.sessionTypeCardActive,
                ]}
                onPress={() => setSelectedSessionType(type.id)}
              >
                <Ionicons
                  name={type.icon as any}
                  size={24}
                  color={selectedSessionType === type.id ? Colors.dark.primary : Colors.dark.textMuted}
                />
                <Text
                  style={[
                    styles.sessionTypeLabel,
                    selectedSessionType === type.id && styles.sessionTypeLabelActive,
                  ]}
                >
                  {type.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Duration</Text>
          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.durationChip,
                  selectedDuration === option.value && styles.durationChipActive,
                ]}
                onPress={() => setSelectedDuration(option.value)}
              >
                <Text
                  style={[
                    styles.durationText,
                    selectedDuration === option.value && styles.durationTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
            {getNextDays().map((date, index) => {
              const formatted = formatDate(date);
              const isSelected = isSameDay(date, selectedDate);
              return (
                <Pressable
                  key={index}
                  style={[styles.dateCard, isSelected && styles.dateCardActive]}
                  onPress={() => {
                    setSelectedDate(date);
                    setSelectedSlot(null);
                  }}
                >
                  <Text style={[styles.dateDay, isSelected && styles.dateDayActive]}>
                    {isToday(date) ? "Today" : formatted.day}
                  </Text>
                  <Text style={[styles.dateNumber, isSelected && styles.dateNumberActive]}>
                    {formatted.date}
                  </Text>
                  <Text style={[styles.dateMonth, isSelected && styles.dateMonthActive]}>
                    {formatted.month}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Slots</Text>
          {slotsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.dark.primary} />
              <Text style={styles.loadingText}>Finding available slots...</Text>
            </View>
          ) : slots && slots.length > 0 ? (
            <View style={styles.slotsGrid}>
              {slots.map((slot) => (
                <Pressable
                  key={slot.id}
                  style={[
                    styles.slotCard,
                    selectedSlot?.id === slot.id && styles.slotCardActive,
                  ]}
                  onPress={() => setSelectedSlot(slot)}
                >
                  <View style={styles.slotTime}>
                    <Ionicons name="time-outline" size={16} color={selectedSlot?.id === slot.id ? Colors.dark.primary : Colors.dark.textMuted} />
                    <Text style={[styles.slotTimeText, selectedSlot?.id === slot.id && styles.slotTimeTextActive]}>
                      {slot.startTime} - {slot.endTime}
                    </Text>
                  </View>
                  {slot.coachName ? (
                    <View style={styles.slotCoach}>
                      <Ionicons name="person-outline" size={14} color={Colors.dark.textMuted} />
                      <Text style={styles.slotCoachText}>{slot.coachName}</Text>
                    </View>
                  ) : null}
                  {slot.courtName ? (
                    <View style={styles.slotLocation}>
                      <Ionicons name="location-outline" size={14} color={Colors.dark.textMuted} />
                      <Text style={styles.slotLocationText}>{slot.courtName}</Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.noSlotsContainer}>
              <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.noSlotsTitle}>No Available Slots</Text>
              <Text style={styles.noSlotsSubtitle}>
                Try selecting a different date or duration
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Note for Coach (Optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Any special requests or things your coach should know..."
            placeholderTextColor={Colors.dark.textMuted}
            value={playerNote}
            onChangeText={setPlayerNote}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={[styles.footerInline, { paddingBottom: insets.bottom + Spacing.lg }]}>
          {selectedSlot ? (
            <View style={styles.selectedSlotPreview}>
              <Text style={styles.selectedSlotLabel}>Selected:</Text>
              <Text style={styles.selectedSlotValue}>
                {formatDate(selectedDate).day}, {formatDate(selectedDate).month} {formatDate(selectedDate).date} at {selectedSlot.startTime}
              </Text>
            </View>
          ) : null}
          <Pressable
            style={[styles.submitButton, !selectedSlot && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!selectedSlot || bookingMutation.isPending}
          >
            {bookingMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
            ) : (
              <>
                <Ionicons name="send" size={20} color={Colors.dark.backgroundRoot} />
                <Text style={styles.submitButtonText}>Send Request</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  sessionTypes: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  sessionTypeCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    gap: Spacing.xs,
  },
  sessionTypeCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  sessionTypeLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  sessionTypeLabelActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  durationRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  durationChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.dark.border,
  },
  durationChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  durationText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  durationTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  dateScroll: {
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  dateCard: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.sm,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    minWidth: 60,
  },
  dateCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  dateDay: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "500",
    fontSize: 10,
  },
  dateDayActive: {
    color: Colors.dark.primary,
  },
  dateNumber: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  dateNumberActive: {
    color: Colors.dark.primary,
  },
  dateMonth: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  dateMonthActive: {
    color: Colors.dark.primary,
  },
  loadingContainer: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  slotsGrid: {
    gap: Spacing.sm,
  },
  slotCard: {
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    gap: Spacing.xs,
  },
  slotCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  slotTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  slotTimeText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  slotTimeTextActive: {
    color: Colors.dark.primary,
  },
  slotCoach: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  slotCoachText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  slotLocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  slotLocationText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  noSlotsContainer: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
  },
  noSlotsTitle: {
    ...Typography.h4,
    color: Colors.dark.textMuted,
  },
  noSlotsSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  noteInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
    minHeight: 80,
  },
  footerInline: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  selectedSlotPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  selectedSlotLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  selectedSlotValue: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.dark.border,
  },
  submitButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
});
