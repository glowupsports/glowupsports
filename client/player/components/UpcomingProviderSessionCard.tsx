import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Spacing, GlowColors, BorderRadius, Backgrounds } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/coach/context/AuthContext";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface ProviderBooking {
  id: string;
  orderNumber: string;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  assignedProviderId: string | null;
  playerRating: number | null;
  playerRatingAt: string | null;
  notes: string | null;
  serviceName: string | null;
  serviceId: string | null;
  provider: {
    id: string;
    displayName: string;
    profilePhotoUrl: string | null;
    specializations: string[];
    serviceTypes: string[];
  } | null;
}

export function useProviderBookings(enabled: boolean) {
  return useQuery<ProviderBooking[]>({
    queryKey: ["/api/player/shop/provider-bookings"],
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

type CardState = "days_out" | "today_morning" | "urgent" | "rating" | "rebook";

function getSpecializationConfig(specializations: string[], serviceTypes: string[]): {
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  label: string;
} {
  const combined = [...(specializations ?? []), ...(serviceTypes ?? [])].map((s) => s.toLowerCase());

  if (combined.some((s) => s.includes("string") || s.includes("racket"))) {
    return { icon: "construct", accentColor: "#FF9800", label: "Stringing" };
  }
  if (combined.some((s) => s.includes("physio") || s.includes("physiother"))) {
    return { icon: "fitness", accentColor: "#4CAF50", label: "Physiotherapy" };
  }
  if (combined.some((s) => s.includes("massage") || s.includes("recovery"))) {
    return { icon: "body", accentColor: "#9C27B0", label: "Massage" };
  }
  if (combined.some((s) => s.includes("nutri") || s.includes("diet"))) {
    return { icon: "leaf", accentColor: "#2ECC40", label: "Nutrition" };
  }
  if (combined.some((s) => s.includes("mental") || s.includes("psych"))) {
    return { icon: "bulb", accentColor: "#00BCD4", label: "Mental Coaching" };
  }
  if (combined.some((s) => s.includes("fitness") || s.includes("strength"))) {
    return { icon: "barbell", accentColor: "#FF5722", label: "Fitness" };
  }
  return { icon: "medkit", accentColor: GlowColors.primary, label: "Service" };
}

function getCardState(booking: ProviderBooking): CardState {
  if (booking.status === "completed") {
    if (booking.playerRating !== null) return "rebook";
    return "rating";
  }

  if (!booking.scheduledAt) return "days_out";

  const sessionDate = new Date(booking.scheduledAt);
  const now = new Date();
  const diffMs = sessionDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours <= 1 && diffHours > -1) return "urgent";

  const isToday =
    sessionDate.getDate() === now.getDate() &&
    sessionDate.getMonth() === now.getMonth() &&
    sessionDate.getFullYear() === now.getFullYear();

  if (isToday) return "today_morning";

  return "days_out";
}

function formatSmartTime(scheduledAt: string): string {
  const sessionDate = new Date(scheduledAt);
  const now = new Date();
  const diffMs = sessionDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.floor(diffHours / 24);

  const timeStr = sessionDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffHours <= 0 && diffHours > -2) return `Now`;
  if (diffHours <= 1) {
    const mins = Math.round(diffHours * 60);
    return `Starting soon · ${mins}m`;
  }
  if (diffHours <= 3) {
    const h = Math.floor(diffHours);
    const m = Math.round((diffHours - h) * 60);
    return `Today · In ${h}h${m > 0 ? ` ${m}m` : ""}`;
  }

  const isToday =
    sessionDate.getDate() === now.getDate() &&
    sessionDate.getMonth() === now.getMonth() &&
    sessionDate.getFullYear() === now.getFullYear();
  if (isToday) return `Today · ${timeStr}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    sessionDate.getDate() === tomorrow.getDate() &&
    sessionDate.getMonth() === tomorrow.getMonth() &&
    sessionDate.getFullYear() === tomorrow.getFullYear();
  if (isTomorrow) return `Tomorrow · ${timeStr}`;

  if (diffDays < 7) {
    const dayName = sessionDate.toLocaleDateString([], { weekday: "long" });
    return `${dayName} · ${timeStr}`;
  }

  return `${sessionDate.toLocaleDateString([], { month: "short", day: "numeric" })} · ${timeStr}`;
}

function UrgentPulse({ color }: { color: string }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(withTiming(1.15, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      false
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: 0.7,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
}

function StarRating({
  value,
  onSelect,
  readonly = false,
  size = 28,
}: {
  value: number;
  onSelect?: (v: number) => void;
  readonly?: boolean;
  size?: number;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((s) => {
        const filled = s <= (hovered || value);
        return (
          <Pressable
            key={s}
            onPress={() => {
              if (!readonly && onSelect) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(s);
              }
            }}
            onPressIn={() => !readonly && setHovered(s)}
            onPressOut={() => setHovered(0)}
            disabled={readonly}
          >
            <Ionicons
              name={filled ? "star" : "star-outline"}
              size={size}
              color={filled ? "#FFD700" : Colors.dark.textSubtle}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

type PlayerNav = NativeStackNavigationProp<PlayerStackParamList>;

function SingleProviderCard({
  booking,
  onRated,
  othersCount = 0,
}: {
  booking: ProviderBooking;
  onRated: (orderId: string, rating: number) => void;
  othersCount?: number;
}) {
  const navigation = useNavigation<PlayerNav>();
  const queryClient = useQueryClient();
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  // Optimistic local rating to immediately show rebook state without waiting for refetch
  const [localRating, setLocalRating] = useState<number | null>(null);

  const effectiveRating = localRating ?? booking.playerRating;
  const effectiveState: CardState =
    localRating !== null && booking.status === "completed" ? "rebook" : getCardState(booking);
  const state = effectiveState;

  const specConfig = getSpecializationConfig(
    booking.provider?.specializations ?? [],
    booking.provider?.serviceTypes ?? []
  );
  const accent = specConfig.accentColor;

  const ratingMutation = useMutation({
    mutationFn: async (rating: number) => {
      return apiRequest("POST", `/api/player/shop/orders/${booking.id}/rate`, { rating });
    },
    onSuccess: (_, rating) => {
      setLocalRating(rating);
      queryClient.invalidateQueries({ queryKey: ["/api/player/shop/provider-bookings"] });
      setRatingSubmitted(true);
      onRated(booking.id, rating);
    },
  });

  const handleRatingSelect = useCallback(
    (rating: number) => {
      // Guard: prevent re-entrancy if mutation is already in flight
      if (ratingMutation.isPending || ratingSubmitted) return;
      setSelectedRating(rating);
      // Submit immediately — visual feedback from selectedRating state is sufficient
      ratingMutation.mutate(rating);
    },
    [ratingMutation, ratingSubmitted]
  );

  const handleRebook = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (booking.serviceId) {
      navigation.navigate("ServiceDetail", { serviceId: booking.serviceId });
    } else {
      navigation.navigate("Shop" as keyof PlayerStackParamList);
    }
  }, [navigation, booking.serviceId]);

  const handleCardPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerBookingChat", { orderId: booking.id });
  }, [navigation, booking.id]);

  const handleChatPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerBookingChat", { orderId: booking.id });
  }, [navigation, booking.id]);

  const stateColor =
    state === "urgent"
      ? "#FF5722"
      : state === "today_morning"
      ? "#FF9800"
      : accent;

  const isUpcoming = state === "days_out" || state === "today_morning" || state === "urgent";

  return (
    <Animated.View entering={FadeIn.duration(350)}>
      <Pressable
        style={[
          cardStyles.card,
          { borderColor: stateColor + "30" },
          state === "urgent" && cardStyles.urgentCard,
        ]}
        onPress={isUpcoming ? handleCardPress : undefined}
      >
        {/* Accent top bar */}
        <View style={[cardStyles.topBar, { backgroundColor: stateColor }]} />

        {/* Main content */}
        <View style={cardStyles.body}>
          {/* Provider photo + info */}
          <View style={cardStyles.providerRow}>
            <View style={[cardStyles.photoContainer, { borderColor: stateColor + "60" }]}>
              {booking.provider?.profilePhotoUrl ? (
                <Image
                  source={{ uri: booking.provider.profilePhotoUrl }}
                  style={cardStyles.photo}
                  contentFit="cover"
                />
              ) : (
                <View style={[cardStyles.photoPlaceholder, { backgroundColor: stateColor + "20" }]}>
                  <Ionicons name={specConfig.icon} size={22} color={stateColor} />
                </View>
              )}
            </View>

            <View style={cardStyles.providerInfo}>
              <Text style={cardStyles.providerName} numberOfLines={1}>
                {booking.provider?.displayName ?? "Provider"}
              </Text>
              <View style={cardStyles.serviceRow}>
                <Ionicons name={specConfig.icon} size={12} color={stateColor} />
                <Text style={[cardStyles.serviceLabel, { color: stateColor }]}>
                  {booking.serviceName ?? specConfig.label}
                </Text>
              </View>
            </View>

            {/* State-specific right content */}
            {isUpcoming && booking.scheduledAt ? (
              <View style={cardStyles.timeBlock}>
                {state === "urgent" && (
                  <View style={cardStyles.urgentDotContainer}>
                    <UrgentPulse color={stateColor} />
                    <View style={[cardStyles.urgentDot, { backgroundColor: stateColor }]} />
                  </View>
                )}
                <Text
                  style={[
                    cardStyles.timeText,
                    { color: stateColor },
                    state === "urgent" && cardStyles.urgentTimeText,
                  ]}
                  numberOfLines={2}
                >
                  {formatSmartTime(booking.scheduledAt)}
                </Text>
              </View>
            ) : null}

            {state === "rebook" && (
              <View style={[cardStyles.ratedBadge, { backgroundColor: "#FFD70020" }]}>
                <Ionicons name="star" size={12} color="#FFD700" />
                <Text style={cardStyles.ratedBadgeText}>{effectiveRating}</Text>
              </View>
            )}
          </View>

          {/* Rating state */}
          {state === "rating" && !ratingSubmitted && (
            <Animated.View entering={FadeIn.duration(300)} style={cardStyles.ratingSection}>
              <Text style={cardStyles.ratingPrompt}>How was your session?</Text>
              <StarRating
                value={selectedRating}
                onSelect={handleRatingSelect}
                readonly={ratingMutation.isPending}
              />
              {ratingMutation.isPending && (
                <Text style={cardStyles.ratingHint}>Submitting...</Text>
              )}
            </Animated.View>
          )}

          {state === "rating" && ratingSubmitted && (
            <Animated.View entering={FadeIn.duration(300)} style={cardStyles.ratingSection}>
              <View style={cardStyles.ratingThanks}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.dark.accentText} />
                <Text style={cardStyles.ratingThanksText}>Thanks for your feedback!</Text>
              </View>
            </Animated.View>
          )}

          {/* Rebook nudge */}
          {state === "rebook" && (
            <Animated.View entering={FadeIn.duration(300)} style={cardStyles.rebookSection}>
              <Text style={cardStyles.rebookPrompt}>
                Book again with {booking.provider?.displayName ?? "this provider"}?
              </Text>
              <Pressable
                style={[cardStyles.rebookBtn, { backgroundColor: accent + "20", borderColor: accent + "40" }]}
                onPress={handleRebook}
              >
                <Ionicons name="calendar" size={14} color={accent} />
                <Text style={[cardStyles.rebookBtnText, { color: accent }]}>Book Again</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Footer row for upcoming bookings: status badge + Chat button */}
          {isUpcoming ? (
            <View style={cardStyles.footerRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs, flex: 1 }}>
                {state === "today_morning" ? (
                  <View style={[cardStyles.warmBadge, { backgroundColor: stateColor + "15", borderColor: stateColor + "30" }]}>
                    <Text style={[cardStyles.warmBadgeText, { color: stateColor }]}>Today — get ready</Text>
                  </View>
                ) : state === "urgent" ? (
                  <View style={[cardStyles.warmBadge, { backgroundColor: stateColor + "15", borderColor: stateColor + "30" }]}>
                    <Text style={[cardStyles.warmBadgeText, { color: stateColor }]}>Starting soon</Text>
                  </View>
                ) : othersCount > 0 ? (
                  <View style={[cardStyles.warmBadge, { backgroundColor: Colors.dark.chipBackground, borderColor: Colors.dark.chipBackgroundStrong }]}>
                    <Text style={[cardStyles.warmBadgeText, { color: Colors.dark.textSubtle }]}>+{othersCount} more</Text>
                  </View>
                ) : null}
              </View>
              <Pressable
                style={[cardStyles.chatBtn, { backgroundColor: stateColor + "20", borderColor: stateColor + "40" }]}
                onPress={handleChatPress}
              >
                <Ionicons name="chatbubble-outline" size={13} color={stateColor} />
                <Text style={[cardStyles.chatBtnText, { color: stateColor }]}>Chat</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function UpcomingProviderSessionCard() {
  const { user, isGuest } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const queryClient = useQueryClient();

  const { data: bookings = [] } = useProviderBookings(!!user?.playerId && !isGuest);

  const handleRated = useCallback(
    (_orderId: string, _rating: number) => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/shop/provider-bookings"] });
    },
    [queryClient]
  );

  if (!bookings || bookings.length === 0) return null;

  if (bookings.length === 1) {
    return (
      <View style={wrapStyles.container}>
        <SingleProviderCard booking={bookings[0]} onRated={handleRated} />
      </View>
    );
  }

  return (
    <View style={wrapStyles.container}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          // Divisor must match snapToInterval (card width + gap between cards)
          const itemStride = SCREEN_WIDTH - Spacing.lg * 2 + Spacing.md;
          const idx = Math.round(e.nativeEvent.contentOffset.x / itemStride);
          setActiveIndex(idx);
        }}
        style={{ marginHorizontal: -Spacing.lg }}
        contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}
        decelerationRate="fast"
        snapToInterval={SCREEN_WIDTH - Spacing.lg * 2 + Spacing.md}
        snapToAlignment="start"
      >
        {bookings.map((b, i) => (
          <View key={b.id} style={{ width: SCREEN_WIDTH - Spacing.lg * 2 }}>
            <SingleProviderCard
              booking={b}
              onRated={handleRated}
              othersCount={i === 0 ? bookings.length - 1 : 0}
            />
          </View>
        ))}
      </ScrollView>

      {/* Page dots */}
      <View style={wrapStyles.dotsRow}>
        {bookings.map((_, i) => (
          <View
            key={i}
            style={[
              wrapStyles.dot,
              i === activeIndex && wrapStyles.dotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const cardStyles = makeReactiveStyles(() => StyleSheet.create({
  card: {
    backgroundColor: Backgrounds.root,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  urgentCard: {
    borderColor: "#FF572230",
  },
  topBar: {
    height: 3,
    borderRadius: 3,
  },
  body: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  photoContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    overflow: "hidden",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  providerInfo: {
    flex: 1,
    gap: 3,
  },
  providerName: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  serviceLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  timeBlock: {
    alignItems: "flex-end",
    gap: 4,
  },
  urgentDotContainer: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
  },
  urgentDot: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    maxWidth: 120,
  },
  urgentTimeText: {
    fontWeight: "800",
    fontSize: 13,
  },
  ratedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  ratedBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFD700",
  },
  ratingSection: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.chipBackground,
  },
  ratingPrompt: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  ratingHint: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  ratingThanks: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  ratingThanksText: {
    fontSize: 14,
    color: Colors.dark.accentText,
    fontWeight: "600",
  },
  rebookSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.chipBackground,
    gap: Spacing.sm,
  },
  rebookPrompt: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.textSubtle,
    fontWeight: "500",
  },
  rebookBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  rebookBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  warmBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  warmBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.chipBackground,
    gap: Spacing.sm,
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chatBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
}));

const wrapStyles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  dotActive: {
    width: 14,
    backgroundColor: GlowColors.primary,
  },
}));
