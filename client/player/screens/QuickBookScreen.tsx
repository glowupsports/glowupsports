import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Modal,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeIn, FadeInDown, SlideInUp, ZoomIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { LockedScreen } from "../components/LockedScreen";
import { DateRailSelector } from "../components/DateRailSelector";
import { TimeSlotGrid, CourtRow, TimeSlot } from "../components/TimeSlotGrid";
import { BookingConfirmationCard } from "../components/BookingConfirmationCard";
import FriendSelector from "../components/FriendSelector";
import { apiRequest, getApiUrl, getStaticAssetsUrl } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface SelectedFriend {
  id: string;
  name: string;
  photoUrl: string | null;
  level: number;
  ballLevel: string | null;
}

type NavigationProp = NativeStackNavigationProp<PlayerStackParamList>;

interface AvailabilitySlot {
  courtId: string;
  courtName: string;
  time: string;
  available: boolean;
  price?: string;
  currency?: string;
}

interface AvailabilityResponse {
  courts: {
    id: string;
    name: string;
    surface?: string;
    pricePerHour?: string;
    currency?: string;
  }[];
  slots: AvailabilitySlot[];
}

const formatDateForAPI = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

export default function QuickBookScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const track = useTrackFeature();

  useFocusEffect(useCallback(() => { track("screen:quick_book"); }, [track]));

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFriendSelector, setShowFriendSelector] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<SelectedFriend[]>([]);
  const [bookWithFriends, setBookWithFriends] = useState(false);
  const [createOpenMatch, setCreateOpenMatch] = useState(false);
  const [openMatchType, setOpenMatchType] = useState<"singles" | "doubles">("singles");

  const dateStr = formatDateForAPI(selectedDate);

  const { data: availability, isLoading } = useQuery<AvailabilityResponse>({
    queryKey: ["/api/courts/availability", dateStr],
    queryFn: async () => {
      const response = await fetch(`${getApiUrl()}/api/courts/availability?date=${dateStr}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch availability");
      return response.json();
    },
  });

  const bookMutation = useMutation({
    mutationFn: async (data: { courtId: string; date: string; time: string; inviteFriends?: string[]; openMatch?: boolean; matchType?: "singles" | "doubles" }) => {
      const response = await apiRequest(`${getApiUrl()}/api/courts/${data.courtId}/book`, {
        method: "POST",
        body: JSON.stringify({
          date: data.date,
          startTime: data.time,
          endTime: calculateEndTime(data.time),
          inviteFriendIds: data.inviteFriends,
          createOpenMatch: data.openMatch,
          matchType: data.matchType,
        }),
      });
      return response;
    },
    onSuccess: () => {
      setShowSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/courts/availability", dateStr] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/reservations"] });
      
      setTimeout(() => {
        navigation.goBack();
      }, 2000);
    },
    onError: (error: any) => {
      Alert.alert(
        "Booking Failed",
        error.message || "Could not complete your booking. Please try again."
      );
    },
  });

  const calculateEndTime = (startTime: string): string => {
    const [hours, minutes] = startTime.split(":").map(Number);
    const endHours = hours + 1;
    return `${endHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };

  const courts: CourtRow[] = React.useMemo(() => {
    if (!availability?.courts || !availability?.slots) return [];

    return availability.courts.map((court) => {
      const courtSlots = availability.slots
        .filter((slot) => slot.courtId === court.id)
        .map((slot) => ({
          time: slot.time,
          available: slot.available,
          price: court.pricePerHour,
          currency: court.currency,
          courtId: court.id,
          courtName: court.name,
        }));

      return {
        courtId: court.id,
        courtName: court.name,
        slots: courtSlots,
      };
    });
  }, [availability]);

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    setBookingStep(1);
  }, []);

  const handleSlotSelect = useCallback((slot: TimeSlot, courtId: string, courtName: string) => {
    setSelectedSlot({ ...slot, courtId, courtName });
    setBookingStep(3);
  }, []);

  const handleConfirmBooking = () => {
    if (!selectedSlot?.courtId) return;

    const friendIds = bookWithFriends && selectedFriends.length > 0 
      ? selectedFriends.map(f => f.id) 
      : undefined;

    bookMutation.mutate({
      courtId: selectedSlot.courtId,
      date: dateStr,
      time: selectedSlot.time,
      inviteFriends: friendIds,
      openMatch: createOpenMatch && !bookWithFriends,
      matchType: createOpenMatch ? openMatchType : undefined,
    });
  };

  const totalPrice = selectedSlot?.price ? parseFloat(selectedSlot.price) : 0;
  const splitPrice = bookWithFriends && selectedFriends.length > 0 
    ? totalPrice / (selectedFriends.length + 1) 
    : totalPrice;
  const currency = selectedSlot?.currency || "AED";

  const handleToggleBookWithFriends = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBookWithFriends(!bookWithFriends);
    if (!bookWithFriends) {
      setShowFriendSelector(true);
      setCreateOpenMatch(false);
    }
  };

  const handleToggleCreateOpenMatch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newValue = !createOpenMatch;
    setCreateOpenMatch(newValue);
    if (newValue) {
      setBookWithFriends(false);
      setSelectedFriends([]);
    }
  };

  const handleCancelBooking = () => {
    setSelectedSlot(null);
    setBookingStep(2);
  };

  if (showSuccess) {
    return (
      <View style={[styles.container, styles.successContainer, { paddingTop: insets.top }]}>
        <Animated.View entering={SlideInUp.duration(500)} style={styles.successContent}>
          <LinearGradient
            colors={[Colors.dark.primary + "30", Colors.dark.backgroundSecondary]}
            style={styles.successCard}
          >
            <Animated.View entering={FadeIn.delay(200).duration(400)}>
              <View style={styles.successIconContainer}>
                <Ionicons name="checkmark-circle" size={80} color={Colors.dark.primary} />
              </View>
            </Animated.View>
            <Text style={styles.successTitle}>BOOM!</Text>
            <Text style={styles.successSubtitle}>Session Confirmed</Text>
            <View style={styles.xpRewardBig}>
              <Ionicons name="flash" size={24} color={Colors.dark.primary} />
              <Text style={styles.xpRewardText}>+50 XP</Text>
            </View>
            <Text style={styles.successDetail}>
              {selectedSlot?.courtName} • {selectedSlot?.time}
            </Text>
          </LinearGradient>
        </Animated.View>
      </View>
    );
  }

  return (
    <LockedScreen featureKey="court_booking">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Quick Book</Text>
            <Text style={styles.headerSubtitle}>3-tap booking experience</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate("CourtBooking" as any)}
            style={styles.browseButton}
          >
            <Ionicons name="grid-outline" size={22} color={Colors.dark.text} />
          </Pressable>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${(bookingStep / 3) * 100}%` },
              ]}
            />
          </View>
          <View style={styles.progressSteps}>
            <View style={[styles.progressStep, bookingStep >= 1 && styles.progressStepActive]}>
              <Ionicons name="calendar" size={14} color={bookingStep >= 1 ? Colors.dark.text : Colors.dark.textMuted} />
            </View>
            <View style={[styles.progressStep, bookingStep >= 2 && styles.progressStepActive]}>
              <Ionicons name="time" size={14} color={bookingStep >= 2 ? Colors.dark.text : Colors.dark.textMuted} />
            </View>
            <View style={[styles.progressStep, bookingStep >= 3 && styles.progressStepActive]}>
              <Ionicons name="checkmark" size={14} color={bookingStep >= 3 ? Colors.dark.text : Colors.dark.textMuted} />
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: insets.bottom + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <DateRailSelector
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            daysToShow={14}
          />

          {selectedDate ? (
            <Animated.View entering={FadeInDown.delay(100).duration(300)}>
              <TimeSlotGrid
                courts={courts}
                selectedSlot={selectedSlot}
                onSlotSelect={handleSlotSelect}
                isLoading={isLoading}
              />
            </Animated.View>
          ) : null}

          {selectedSlot && bookingStep === 3 ? (
            <BookingConfirmationCard
              selectedDate={selectedDate}
              selectedSlot={selectedSlot}
              xpReward={createOpenMatch ? 75 : 50}
              onConfirm={handleConfirmBooking}
              onCancel={handleCancelBooking}
              isLoading={bookMutation.isPending}
              bookWithFriends={bookWithFriends}
              selectedFriends={selectedFriends}
              splitPrice={splitPrice}
              onToggleBookWithFriends={handleToggleBookWithFriends}
              onEditFriends={() => setShowFriendSelector(true)}
              createOpenMatch={createOpenMatch}
              onToggleCreateOpenMatch={handleToggleCreateOpenMatch}
              openMatchType={openMatchType}
              onChangeMatchType={setOpenMatchType}
            />
          ) : null}
        </ScrollView>

        <Modal
          visible={showFriendSelector}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowFriendSelector(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setShowFriendSelector(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
              <Text style={styles.modalTitle}>Select Friends</Text>
              <Pressable 
                onPress={() => {
                  setShowFriendSelector(false);
                  if (selectedFriends.length === 0) {
                    setBookWithFriends(false);
                  }
                }} 
                style={styles.modalDoneButton}
              >
                <Text style={styles.modalDoneText}>Done</Text>
              </Pressable>
            </View>
            <View style={styles.modalContent}>
              <FriendSelector
                selectedFriends={selectedFriends}
                onSelectionChange={setSelectedFriends}
                maxSelection={3}
              />
            </View>
          </View>
        </Modal>
      </View>
    </LockedScreen>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  browseButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
  },
  progressContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 2,
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  progressSteps: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressStep: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  progressStepActive: {
    backgroundColor: Colors.dark.primary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: Spacing.md,
  },
  successContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  successContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  successCard: {
    borderRadius: 24,
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  successIconContainer: {
    marginBottom: Spacing.md,
  },
  successTitle: {
    fontSize: 36,
    fontWeight: "800",
    color: Colors.dark.primary,
    marginBottom: Spacing.xs,
  },
  successSubtitle: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  xpRewardBig: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary + "20",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: 20,
    marginBottom: Spacing.lg,
  },
  xpRewardText: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  successDetail: {
    fontSize: FontSizes.md,
    color: Colors.dark.textSecondary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  modalDoneButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  modalDoneText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  modalContent: {
    flex: 1,
    padding: Spacing.lg,
  },
}));
