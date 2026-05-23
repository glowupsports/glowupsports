import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { WebCalendarPicker } from "@/components/WebCalendarPicker";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import { useTabNavigation } from "@/components/TabNavigationContext";

interface CourtPricingOption {
  durationMinutes: number;
  price: number;
  credits: number;
}

interface RentalCourt {
  id: string;
  name: string;
  surface: string | null;
  indoor: boolean | null;
  description: string | null;
  locationId: string | null;
  currency: string;
  pricePerHour: number;
  creditsPerHour: number;
  pricingOptions: CourtPricingOption[];
  xpRewardPerHour: number;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
  price?: number;
  credits?: number;
  currency?: string;
}

const DURATION_LABELS: Record<number, string> = {
  60: "1 hour",
  90: "1.5 hours",
  120: "2 hours",
};

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMoney(amount: number, currency: string): string {
  if (amount === 0) return "Free";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

const STEPS = ["Duration", "Date & Time", "Court", "Confirm"];
const TOTAL_STEPS = 4;

export default function CourtRentalWizardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { navigateToTab } = useTabNavigation();

  const [step, setStep] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState<number>(60);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [selectedCourt, setSelectedCourt] = useState<RentalCourt | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"credits" | "pay_later">("pay_later");
  const [showSuccess, setShowSuccess] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d;
  }, []);

  const dateParam = useMemo(() => formatDateParam(selectedDate), [selectedDate]);

  const { data: pricingData, isLoading: pricingLoading } = useQuery<{
    courts: RentalCourt[];
    durations: number[];
  }>({
    queryKey: ["/api/player/courts/pricing"],
    enabled: step >= 0,
    staleTime: 5 * 60 * 1000,
  });

  const availableDurations = pricingData?.durations ?? [60, 90, 120];
  const courts = pricingData?.courts ?? [];

  // Step 2: fetch live slot availability across ALL courts (no courtId) for the selected date + duration
  const multiSlotKey = `/api/player/courts/slots?date=${dateParam}&duration=${selectedDuration}`;
  const { data: slotsData, isLoading: slotsLoading } = useQuery<{ slots: TimeSlot[] }>({
    queryKey: [multiSlotKey],
    enabled: step >= 1 && courts.length > 0,
    staleTime: 30 * 1000,
  });

  const slots: TimeSlot[] = slotsData?.slots ?? [];

  const selectedPricing = useMemo(() => {
    if (!selectedCourt) return null;
    return selectedCourt.pricingOptions.find((p) => p.durationMinutes === selectedDuration) ?? null;
  }, [selectedCourt, selectedDuration]);

  const canUseCredits = (selectedPricing?.credits ?? 0) > 0;

  const bookingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCourt || !selectedSlot) throw new Error("Missing booking details");
      const result = await apiRequest("POST", "/api/player/court-rental", {
        courtId: selectedCourt.id,
        date: dateParam,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        durationMinutes: selectedDuration,
        paymentMethod,
        notes: null,
      });
      return result.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/schedule-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/courts/pricing"] });
    },
    onError: (err: any) => {
      Alert.alert("Booking Failed", err?.message || "Please try again.");
    },
  });

  const goBack = useCallback(() => {
    if (step === 0) {
      navigation.goBack();
    } else {
      setStep((s) => s - 1);
      if (step === 1) setSelectedSlot(null);
      if (step === 2) setSelectedCourt(null);
    }
  }, [step, navigation]);

  const goNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, []);

  const canGoNext = useMemo(() => {
    if (step === 0) return selectedDuration != null;
    if (step === 1) return selectedSlot != null;
    if (step === 2) return selectedCourt != null;
    return false;
  }, [step, selectedDuration, selectedSlot, selectedCourt]);

  if (showSuccess) {
    return (
      <View style={[styles.successContainer, { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.lg }]}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.successContent}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={72} color={Colors.dark.successNeon} />
          </View>
          <Text style={styles.successTitle}>Court Booked!</Text>
          <Text style={styles.successSubtitle}>
            {selectedCourt?.name} — {formatDate(selectedDate)}
          </Text>
          <Text style={styles.successTime}>
            {selectedSlot ? `${formatTime(selectedSlot.startTime)} – ${formatTime(selectedSlot.endTime)}` : ""}
          </Text>
          {selectedPricing && selectedPricing.price > 0 ? (
            <View style={styles.successPill}>
              <Text style={styles.successPillText}>
                {paymentMethod === "credits"
                  ? `${selectedPricing.credits} credits deducted`
                  : `${formatMoney(selectedPricing.price, selectedCourt?.currency ?? "AED")} — pay at venue`}
              </Text>
            </View>
          ) : null}
          <Pressable
            style={styles.successBtn}
            onPress={() => {
              navigation.goBack();
              navigateToTab("Growth", { screen: "ScheduleMain" });
            }}
          >
            <Text style={styles.successBtnText}>View My Schedule</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={goBack}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Rent a Court</Text>
          <Text style={styles.headerStep}>{STEPS[step]}</Text>
        </View>
        <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
        </Pressable>
      </View>

      <View style={styles.progressBar}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressSegment,
              i <= step ? styles.progressSegmentActive : styles.progressSegmentInactive,
            ]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <StepDuration
            durations={availableDurations}
            selectedDuration={selectedDuration}
            onSelect={setSelectedDuration}
            courts={courts}
            isLoading={pricingLoading}
          />
        )}
        {step === 1 && (
          <StepDateTime
            selectedDate={selectedDate}
            onDateChange={(d) => {
              setSelectedDate(d);
              setSelectedSlot(null);
            }}
            selectedSlot={selectedSlot}
            onSlotSelect={setSelectedSlot}
            slots={slots}
            slotsLoading={slotsLoading}
            today={today}
            maxDate={maxDate}
          />
        )}
        {step === 2 && (
          <StepCourt
            courts={courts}
            selectedCourt={selectedCourt}
            onSelect={setSelectedCourt}
            selectedDate={selectedDate}
            selectedSlot={selectedSlot}
            selectedDuration={selectedDuration}
            isLoading={pricingLoading}
          />
        )}
        {step === 3 && selectedCourt && selectedSlot && selectedPricing && (
          <StepConfirm
            court={selectedCourt}
            date={selectedDate}
            slot={selectedSlot}
            pricing={selectedPricing}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            canUseCredits={canUseCredits}
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        {step < TOTAL_STEPS - 1 ? (
          <Pressable
            style={[styles.nextBtn, !canGoNext && styles.nextBtnDisabled]}
            onPress={() => {
              if (!canGoNext) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              goNext();
            }}
            disabled={!canGoNext}
          >
            <Text style={[styles.nextBtnText, !canGoNext && styles.nextBtnTextDisabled]}>
              Continue
            </Text>
            <Ionicons
              name="arrow-forward"
              size={18}
              color={canGoNext ? "#000" : Colors.dark.textMuted}
            />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.nextBtn, bookingMutation.isPending && styles.nextBtnDisabled]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              bookingMutation.mutate();
            }}
            disabled={bookingMutation.isPending}
          >
            {bookingMutation.isPending ? (
              <TennisBallSpinner size="small" color="#000" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#000" />
                <Text style={styles.nextBtnText}>Confirm Booking</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

function StepDuration({
  durations,
  selectedDuration,
  onSelect,
  courts,
  isLoading,
}: {
  durations: number[];
  selectedDuration: number;
  onSelect: (d: number) => void;
  courts: RentalCourt[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <TennisBallSpinner size="large" color={Colors.dark.successNeon} />
      </View>
    );
  }

  if (courts.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="tennisball-outline" size={48} color={Colors.dark.textMuted} />
        <Text style={styles.emptyTitle}>No courts available</Text>
        <Text style={styles.emptySubtitle}>
          Your academy has not set up bookable courts yet. Ask your coach to enable court rentals.
        </Text>
      </View>
    );
  }

  const allCurrencies = [...new Set(courts.map((c) => c.currency))];
  const currency = allCurrencies[0] ?? "AED";

  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <Text style={styles.stepTitle}>How long do you want to play?</Text>
      <Text style={styles.stepSubtitle}>Select a duration to see pricing</Text>

      <View style={styles.durationGrid}>
        {durations.map((dur) => {
          const isSelected = selectedDuration === dur;
          const minPrice = courts.length > 0
            ? Math.min(...courts.map((c) => {
                const opt = c.pricingOptions.find((p) => p.durationMinutes === dur);
                return opt?.price ?? 0;
              }))
            : 0;
          const maxPrice = courts.length > 0
            ? Math.max(...courts.map((c) => {
                const opt = c.pricingOptions.find((p) => p.durationMinutes === dur);
                return opt?.price ?? 0;
              }))
            : 0;

          const priceLabel =
            minPrice === 0 && maxPrice === 0
              ? "Free"
              : minPrice === maxPrice
              ? formatMoney(minPrice, currency)
              : `${formatMoney(minPrice, currency)} – ${formatMoney(maxPrice, currency)}`;

          return (
            <Pressable
              key={dur}
              style={[styles.durationCard, isSelected && styles.durationCardSelected]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(dur);
              }}
            >
              <View style={[styles.durationIconWrap, isSelected && styles.durationIconWrapSelected]}>
                <Ionicons
                  name="time-outline"
                  size={22}
                  color={isSelected ? "#000" : Colors.dark.primary}
                />
              </View>
              <Text style={[styles.durationLabel, isSelected && styles.durationLabelSelected]}>
                {DURATION_LABELS[dur] ?? `${dur} min`}
              </Text>
              <Text style={[styles.durationPrice, isSelected && styles.durationPriceSelected]}>
                {priceLabel}
              </Text>
              {isSelected ? (
                <View style={styles.durationSelectedBadge}>
                  <Ionicons name="checkmark" size={14} color="#000" />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Available Courts</Text>
      {courts.map((court) => {
        const opt = court.pricingOptions.find((p) => p.durationMinutes === selectedDuration);
        return (
          <View key={court.id} style={styles.courtPreviewCard}>
            <View style={styles.courtPreviewLeft}>
              <View style={styles.courtPreviewIconWrap}>
                <Ionicons name="tennisball-outline" size={18} color={Colors.dark.primary} />
              </View>
              <View>
                <Text style={styles.courtPreviewName}>{court.name}</Text>
                <View style={styles.courtPreviewMeta}>
                  {court.surface ? (
                    <Text style={styles.courtPreviewTag}>
                      {court.surface.charAt(0).toUpperCase() + court.surface.slice(1)}
                    </Text>
                  ) : null}
                  {court.indoor ? (
                    <Text style={styles.courtPreviewTag}>Indoor</Text>
                  ) : null}
                </View>
              </View>
            </View>
            <Text style={styles.courtPreviewPrice}>
              {opt
                ? opt.price === 0
                  ? "Free"
                  : formatMoney(opt.price, court.currency)
                : "—"}
            </Text>
          </View>
        );
      })}
    </Animated.View>
  );
}

function StepDateTime({
  selectedDate,
  onDateChange,
  selectedSlot,
  onSlotSelect,
  slots,
  slotsLoading,
  today,
  maxDate,
}: {
  selectedDate: Date;
  onDateChange: (d: Date) => void;
  selectedSlot: TimeSlot | null;
  onSlotSelect: (s: TimeSlot) => void;
  slots: TimeSlot[];
  slotsLoading: boolean;
  today: Date;
  maxDate: Date;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <Text style={styles.stepTitle}>When do you want to play?</Text>
      <Text style={styles.stepSubtitle}>Pick a date and time slot</Text>

      <WebCalendarPicker
        value={selectedDate}
        onChange={onDateChange}
        minimumDate={today}
        maximumDate={maxDate}
      />

      <Text style={styles.sectionLabel}>Available Times</Text>

      {slotsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.primary} />
          <Text style={styles.loadingLabel}>Checking availability...</Text>
        </View>
      ) : slots.length === 0 ? (
        <View style={styles.emptySlots}>
          <Text style={styles.emptySlotsText}>No time slots available for this day.</Text>
        </View>
      ) : (
        <View style={styles.slotsGrid}>
          {slots.map((slot) => {
            const isSelected =
              selectedSlot?.startTime === slot.startTime &&
              selectedSlot?.endTime === slot.endTime;
            const priceLabel =
              slot.price !== undefined && slot.price > 0
                ? formatMoney(slot.price, slot.currency ?? "AED")
                : slot.price === 0
                ? "Free"
                : null;
            return (
              <Pressable
                key={`${slot.startTime}-${slot.endTime}`}
                style={[
                  styles.slotChip,
                  isSelected && styles.slotChipSelected,
                  !slot.available && styles.slotChipUnavailable,
                ]}
                onPress={() => {
                  if (!slot.available) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSlotSelect(slot);
                }}
                disabled={!slot.available}
              >
                <Text
                  style={[
                    styles.slotChipText,
                    isSelected && styles.slotChipTextSelected,
                    !slot.available && styles.slotChipTextUnavailable,
                  ]}
                >
                  {formatTime(slot.startTime)}
                </Text>
                {priceLabel && slot.available ? (
                  <Text style={[styles.slotPriceLabel, isSelected && styles.slotPriceLabelSelected]}>
                    {priceLabel}
                  </Text>
                ) : null}
                {!slot.available ? (
                  <Text style={styles.slotBusyLabel}>Taken</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {selectedSlot ? (
        <View style={styles.selectedSlotBanner}>
          <Ionicons name="time-outline" size={16} color={Colors.dark.successNeon} />
          <Text style={styles.selectedSlotBannerText}>
            {formatTime(selectedSlot.startTime)} – {formatTime(selectedSlot.endTime)}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

function StepCourt({
  courts,
  selectedCourt,
  onSelect,
  selectedDate,
  selectedSlot,
  selectedDuration,
  isLoading,
}: {
  courts: RentalCourt[];
  selectedCourt: RentalCourt | null;
  onSelect: (c: RentalCourt) => void;
  selectedDate: Date;
  selectedSlot: TimeSlot | null;
  selectedDuration: number;
  isLoading: boolean;
}) {
  const dateParam = formatDateParam(selectedDate);

  const courtAvailability = courts.map((court) => {
    const slotsKey = selectedSlot
      ? `/api/player/courts/slots?courtId=${court.id}&date=${dateParam}&duration=${selectedDuration}`
      : null;
    return { court, slotsKey };
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <TennisBallSpinner size="large" color={Colors.dark.successNeon} />
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <Text style={styles.stepTitle}>Choose a court</Text>
      <Text style={styles.stepSubtitle}>
        {selectedSlot
          ? `${formatTime(selectedSlot.startTime)} — ${formatDate(selectedDate)}`
          : formatDate(selectedDate)}
      </Text>

      {courtAvailability.map(({ court }) => (
        <CourtAvailabilityCard
          key={court.id}
          court={court}
          isSelected={selectedCourt?.id === court.id}
          onSelect={onSelect}
          dateParam={dateParam}
          selectedSlot={selectedSlot}
          selectedDuration={selectedDuration}
        />
      ))}
    </Animated.View>
  );
}

function CourtAvailabilityCard({
  court,
  isSelected,
  onSelect,
  dateParam,
  selectedSlot,
  selectedDuration,
}: {
  court: RentalCourt;
  isSelected: boolean;
  onSelect: (c: RentalCourt) => void;
  dateParam: string;
  selectedSlot: TimeSlot | null;
  selectedDuration: number;
}) {
  const slotsKey = `/api/player/courts/slots?courtId=${court.id}&date=${dateParam}&duration=${selectedDuration}`;
  const { data: slotsData, isLoading } = useQuery<{ slots: TimeSlot[] }>({
    queryKey: [slotsKey],
    staleTime: 30 * 1000,
  });

  const slots = slotsData?.slots ?? [];
  const isAvailableAtTime = selectedSlot
    ? slots.find((s) => s.startTime === selectedSlot.startTime && s.available) != null
    : slots.some((s) => s.available);

  const opt = court.pricingOptions.find((p) => p.durationMinutes === selectedDuration);
  const priceLabel = opt
    ? opt.price === 0
      ? "Free"
      : formatMoney(opt.price, court.currency)
    : "—";

  return (
    <Pressable
      style={[
        styles.courtCard,
        isSelected && styles.courtCardSelected,
        !isAvailableAtTime && !isLoading && styles.courtCardUnavailable,
      ]}
      onPress={() => {
        if (!isAvailableAtTime && !isLoading) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSelect(court);
      }}
      disabled={!isAvailableAtTime && !isLoading}
    >
      <View style={styles.courtCardLeft}>
        <View style={[styles.courtCardIcon, isSelected && styles.courtCardIconSelected]}>
          <Ionicons
            name="tennisball-outline"
            size={20}
            color={isSelected ? "#000" : Colors.dark.primary}
          />
        </View>
        <View style={styles.courtCardInfo}>
          <Text style={[styles.courtCardName, isSelected && styles.courtCardNameSelected]}>
            {court.name}
          </Text>
          <View style={styles.courtCardMeta}>
            {court.surface ? (
              <Text style={styles.courtCardTag}>
                {court.surface.charAt(0).toUpperCase() + court.surface.slice(1)}
              </Text>
            ) : null}
            {court.indoor ? <Text style={styles.courtCardTag}>Indoor</Text> : null}
          </View>
        </View>
      </View>

      <View style={styles.courtCardRight}>
        <Text style={[styles.courtCardPrice, isSelected && styles.courtCardPriceSelected]}>
          {priceLabel}
        </Text>
        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.dark.textMuted} />
        ) : (
          <View
            style={[
              styles.availBadge,
              isAvailableAtTime ? styles.availBadgeAvailable : styles.availBadgeUnavailable,
            ]}
          >
            <Text
              style={[
                styles.availBadgeText,
                isAvailableAtTime ? styles.availBadgeTextAvailable : styles.availBadgeTextUnavailable,
              ]}
            >
              {isAvailableAtTime ? "Available" : "Unavailable"}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function StepConfirm({
  court,
  date,
  slot,
  pricing,
  paymentMethod,
  onPaymentMethodChange,
  canUseCredits,
}: {
  court: RentalCourt;
  date: Date;
  slot: TimeSlot;
  pricing: CourtPricingOption;
  paymentMethod: "credits" | "pay_later";
  onPaymentMethodChange: (m: "credits" | "pay_later") => void;
  canUseCredits: boolean;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <Text style={styles.stepTitle}>Confirm your booking</Text>
      <Text style={styles.stepSubtitle}>Review the details before confirming</Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Ionicons name="tennisball-outline" size={18} color={Colors.dark.textMuted} />
          <View style={styles.summaryRowContent}>
            <Text style={styles.summaryLabel}>Court</Text>
            <Text style={styles.summaryValue}>{court.name}</Text>
          </View>
        </View>
        {court.surface ? (
          <View style={styles.summaryRow}>
            <Ionicons name="layers-outline" size={18} color={Colors.dark.textMuted} />
            <View style={styles.summaryRowContent}>
              <Text style={styles.summaryLabel}>Surface</Text>
              <Text style={styles.summaryValue}>
                {court.surface.charAt(0).toUpperCase() + court.surface.slice(1)}
                {court.indoor ? " · Indoor" : " · Outdoor"}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={styles.summaryRow}>
          <Ionicons name="calendar-outline" size={18} color={Colors.dark.textMuted} />
          <View style={styles.summaryRowContent}>
            <Text style={styles.summaryLabel}>Date</Text>
            <Text style={styles.summaryValue}>{formatDate(date)}</Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <Ionicons name="time-outline" size={18} color={Colors.dark.textMuted} />
          <View style={styles.summaryRowContent}>
            <Text style={styles.summaryLabel}>Time</Text>
            <Text style={styles.summaryValue}>
              {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
            </Text>
          </View>
        </View>
        <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
          <Ionicons name="pricetag-outline" size={18} color={Colors.dark.textMuted} />
          <View style={styles.summaryRowContent}>
            <Text style={styles.summaryLabel}>Price</Text>
            <Text style={styles.summaryValueHighlight}>
              {pricing.price === 0 ? "Free" : formatMoney(pricing.price, court.currency)}
            </Text>
          </View>
        </View>
      </View>

      {pricing.price > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Payment Method</Text>
          <View style={styles.paymentOptions}>
            <Pressable
              style={[
                styles.paymentOption,
                paymentMethod === "pay_later" && styles.paymentOptionSelected,
              ]}
              onPress={() => onPaymentMethodChange("pay_later")}
            >
              <View style={styles.paymentOptionLeft}>
                <Ionicons
                  name="cash-outline"
                  size={20}
                  color={paymentMethod === "pay_later" ? Colors.dark.primary : Colors.dark.textMuted}
                />
                <View>
                  <Text
                    style={[
                      styles.paymentOptionLabel,
                      paymentMethod === "pay_later" && styles.paymentOptionLabelSelected,
                    ]}
                  >
                    Pay Later
                  </Text>
                  <Text style={styles.paymentOptionSub}>Pay at the venue</Text>
                </View>
              </View>
              {paymentMethod === "pay_later" ? (
                <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
              ) : null}
            </Pressable>

            {canUseCredits ? (
              <Pressable
                style={[
                  styles.paymentOption,
                  paymentMethod === "credits" && styles.paymentOptionSelected,
                  { borderBottomWidth: 0 },
                ]}
                onPress={() => onPaymentMethodChange("credits")}
              >
                <View style={styles.paymentOptionLeft}>
                  <Ionicons
                    name="star-outline"
                    size={20}
                    color={paymentMethod === "credits" ? Colors.dark.primary : Colors.dark.textMuted}
                  />
                  <View>
                    <Text
                      style={[
                        styles.paymentOptionLabel,
                        paymentMethod === "credits" && styles.paymentOptionLabelSelected,
                      ]}
                    >
                      Court Credits
                    </Text>
                    <Text style={styles.paymentOptionSub}>{pricing.credits} credits</Text>
                  </View>
                </View>
                {paymentMethod === "credits" ? (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
                ) : null}
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}

      <View style={styles.xpBanner}>
        <Ionicons name="flash" size={16} color={Colors.dark.accentWarning} />
        <Text style={styles.xpBannerText}>
          +{Math.round(court.xpRewardPerHour * (pricing.durationMinutes / 60))} XP for this booking
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.sm,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  headerStep: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBar: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  progressSegmentActive: {
    backgroundColor: Colors.dark.successNeon,
  },
  progressSegmentInactive: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  footer: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.successNeon,
    borderRadius: BorderRadius.md,
    paddingVertical: 16,
  },
  nextBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  nextBtnTextDisabled: {
    color: Colors.dark.textMuted,
  },
  stepTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: Spacing.md,
  },
  emptyTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    textAlign: "center",
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  durationGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  durationCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: Spacing.md,
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  durationCardSelected: {
    backgroundColor: Colors.dark.successNeon,
    borderColor: Colors.dark.successNeon,
  },
  durationIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,255,135,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  durationIconWrapSelected: {
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  durationLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  durationLabelSelected: {
    color: "#000",
  },
  durationPrice: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  durationPriceSelected: {
    color: "rgba(0,0,0,0.7)",
  },
  durationSelectedBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  courtPreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  courtPreviewLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  courtPreviewIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,255,135,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  courtPreviewName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  courtPreviewMeta: {
    flexDirection: "row",
    gap: 4,
    marginTop: 2,
  },
  courtPreviewTag: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  courtPreviewPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: "rgba(251,191,36,0.08)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.2)",
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  infoBoxText: {
    fontSize: 12,
    color: Colors.dark.accentWarning,
    flex: 1,
    lineHeight: 16,
  },
  courtChip: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
    backgroundColor: "rgba(0,255,135,0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(0,255,135,0.2)",
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  slotChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    minWidth: 80,
  },
  slotChipSelected: {
    backgroundColor: Colors.dark.successNeon,
    borderColor: Colors.dark.successNeon,
  },
  slotChipUnavailable: {
    opacity: 0.35,
  },
  slotChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  slotChipTextSelected: {
    color: "#000",
  },
  slotChipTextUnavailable: {
    color: Colors.dark.textMuted,
  },
  slotBusyLabel: {
    fontSize: 9,
    color: Colors.dark.error,
    fontWeight: "600",
    marginTop: 2,
  },
  slotPriceLabel: {
    fontSize: 9,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  slotPriceLabelSelected: {
    color: "rgba(0,0,0,0.6)",
  },
  loadingLabel: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  emptySlots: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },
  emptySlotsText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  selectedSlotBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    backgroundColor: "rgba(0,255,135,0.08)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(0,255,135,0.2)",
  },
  selectedSlotBannerText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.successNeon,
  },
  courtCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  courtCardSelected: {
    backgroundColor: Colors.dark.successNeon,
    borderColor: Colors.dark.successNeon,
  },
  courtCardUnavailable: {
    opacity: 0.4,
  },
  courtCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  courtCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,255,135,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  courtCardIconSelected: {
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  courtCardInfo: {
    flex: 1,
  },
  courtCardName: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  courtCardNameSelected: {
    color: "#000",
  },
  courtCardMeta: {
    flexDirection: "row",
    gap: 4,
    marginTop: 3,
  },
  courtCardTag: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  courtCardRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  courtCardPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  courtCardPriceSelected: {
    color: "#000",
  },
  availBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  availBadgeAvailable: {
    backgroundColor: "rgba(0,255,135,0.15)",
  },
  availBadgeUnavailable: {
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  availBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  availBadgeTextAvailable: {
    color: Colors.dark.successNeon,
  },
  availBadgeTextUnavailable: {
    color: Colors.dark.error,
  },
  summaryCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  summaryRowContent: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  summaryValueHighlight: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  paymentOptions: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  paymentOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  paymentOptionSelected: {
    backgroundColor: "rgba(0,255,135,0.06)",
  },
  paymentOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  paymentOptionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  paymentOptionLabelSelected: {
    color: Colors.dark.primary,
  },
  paymentOptionSub: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  xpBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(251,191,36,0.08)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.15)",
  },
  xpBannerText: {
    fontSize: 13,
    color: Colors.dark.accentWarning,
    fontWeight: "600",
  },
  successContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  successContent: {
    alignItems: "center",
    width: "100%",
  },
  successIcon: {
    marginBottom: Spacing.lg,
  },
  successTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  successSubtitle: {
    fontSize: 16,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: 4,
  },
  successTime: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.successNeon,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  successPill: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  successPillText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  successBtn: {
    backgroundColor: Colors.dark.successNeon,
    borderRadius: BorderRadius.md,
    paddingVertical: 16,
    paddingHorizontal: Spacing.xl,
    width: "100%",
    alignItems: "center",
  },
  successBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
});
