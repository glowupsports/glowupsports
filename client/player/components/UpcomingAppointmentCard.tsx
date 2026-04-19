import React, { useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn } from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Spacing, GlowColors, BorderRadius, Backgrounds } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/coach/context/AuthContext";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface UpcomingAppointment {
  id: string;
  orderNumber: string;
  status: string;
  scheduledAt: string;
  assignedProviderId: string;
  serviceName: string | null;
  serviceId: string | null;
  provider: {
    id: string;
    displayName: string;
    profilePhotoUrl: string | null;
    specializations: string[] | null;
    serviceTypes: string[] | null;
  } | null;
}

function formatAppointmentTime(scheduledAt: string): string {
  const date = new Date(scheduledAt);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.floor(diffHours / 24);

  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (diffHours <= 1) {
    const mins = Math.max(1, Math.round(diffHours * 60));
    return `Starting in ${mins}m`;
  }
  if (diffHours <= 3) {
    const h = Math.floor(diffHours);
    const m = Math.round((diffHours - h) * 60);
    return `Today · In ${h}h${m > 0 ? ` ${m}m` : ""}`;
  }

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) return `Today · ${timeStr}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    date.getDate() === tomorrow.getDate() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getFullYear() === tomorrow.getFullYear();
  if (isTomorrow) return `Tomorrow · ${timeStr}`;

  if (diffDays < 7) {
    const dayName = date.toLocaleDateString([], { weekday: "long" });
    return `${dayName} · ${timeStr}`;
  }

  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} · ${timeStr}`;
}

function getServiceIcon(
  specializations: string[] | null,
  serviceTypes: string[] | null
): keyof typeof Ionicons.glyphMap {
  const combined = [
    ...((specializations ?? []) as string[]),
    ...((serviceTypes ?? []) as string[]),
  ].map((s) => s.toLowerCase());

  if (combined.some((s) => s.includes("string") || s.includes("racket"))) return "construct";
  if (combined.some((s) => s.includes("physio"))) return "fitness";
  if (combined.some((s) => s.includes("massage") || s.includes("recovery"))) return "body";
  if (combined.some((s) => s.includes("nutri") || s.includes("diet"))) return "leaf";
  if (combined.some((s) => s.includes("mental") || s.includes("psych"))) return "bulb";
  if (combined.some((s) => s.includes("fitness") || s.includes("strength"))) return "barbell";
  return "medkit";
}

type PlayerNav = NativeStackNavigationProp<PlayerStackParamList>;

export function UpcomingAppointmentCard() {
  const { user, isGuest } = useAuth();
  const navigation = useNavigation<PlayerNav>();

  const { data: appointments = [] } = useQuery<UpcomingAppointment[]>({
    queryKey: ["/api/player/shop/upcoming-appointments"],
    enabled: !!user?.playerId && !isGuest,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const handleChat = useCallback(
    (orderId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate("PlayerBookingChat", { orderId });
    },
    [navigation]
  );

  const handleCardPress = useCallback(
    (orderId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate("PlayerBookingChat", { orderId });
    },
    [navigation]
  );

  if (!appointments || appointments.length === 0) return null;

  const soonest = appointments[0];
  const othersCount = appointments.length - 1;
  const icon = getServiceIcon(
    soonest.provider?.specializations ?? null,
    soonest.provider?.serviceTypes ?? null
  );

  const isUrgent = (() => {
    const diffHours = (new Date(soonest.scheduledAt).getTime() - Date.now()) / (1000 * 60 * 60);
    return diffHours <= 2;
  })();

  const isToday = (() => {
    const d = new Date(soonest.scheduledAt);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  })();

  const accentColor = isUrgent ? "#FF5722" : isToday ? "#FF9800" : GlowColors.primary;

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      <Pressable
        style={[styles.card, { borderColor: accentColor + "30" }]}
        onPress={() => handleCardPress(soonest.id)}
        accessibilityLabel="Upcoming service appointment"
      >
        {/* Accent bar */}
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

        <View style={styles.body}>
          {/* Header row: label + "+" others badge */}
          <View style={styles.headerRow}>
            <View style={styles.labelPill}>
              <Ionicons name="calendar-outline" size={11} color={accentColor} />
              <Text style={[styles.labelText, { color: accentColor }]}>UPCOMING APPOINTMENT</Text>
            </View>
            {othersCount > 0 ? (
              <View style={styles.othersBadge}>
                <Text style={styles.othersBadgeText}>+{othersCount} more</Text>
              </View>
            ) : null}
          </View>

          {/* Provider + service row */}
          <View style={styles.providerRow}>
            <View style={[styles.photoContainer, { borderColor: accentColor + "60" }]}>
              {soonest.provider?.profilePhotoUrl ? (
                <Image
                  source={{ uri: soonest.provider.profilePhotoUrl }}
                  style={styles.photo}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.photoPlaceholder, { backgroundColor: accentColor + "20" }]}>
                  <Ionicons name={icon} size={20} color={accentColor} />
                </View>
              )}
            </View>

            <View style={styles.info}>
              <Text style={styles.providerName} numberOfLines={1}>
                {soonest.provider?.displayName ?? "Provider"}
              </Text>
              <View style={styles.serviceRow}>
                <Ionicons name={icon} size={12} color={accentColor} />
                <Text style={[styles.serviceText, { color: accentColor }]} numberOfLines={1}>
                  {soonest.serviceName ?? "Service"}
                </Text>
              </View>
            </View>

            {/* Time block */}
            <View style={styles.timeBlock}>
              {isUrgent ? (
                <View style={styles.urgentDot}>
                  <View style={[styles.urgentDotInner, { backgroundColor: accentColor }]} />
                </View>
              ) : null}
              <Text style={[styles.timeText, { color: accentColor }]} numberOfLines={2}>
                {formatAppointmentTime(soonest.scheduledAt)}
              </Text>
            </View>
          </View>

          {/* Footer: status hint + Chat button */}
          <View style={styles.footerRow}>
            <Text style={styles.footerHint}>
              {isUrgent
                ? "Starting soon — prepare now"
                : isToday
                ? "Session today — get ready"
                : "Confirmed appointment"}
            </Text>
            <Pressable
              style={[styles.chatBtn, { backgroundColor: accentColor + "20", borderColor: accentColor + "40" }]}
              onPress={() => handleChat(soonest.id)}
              accessibilityLabel="Open chat with provider"
            >
              <Ionicons name="chatbubble-outline" size={13} color={accentColor} />
              <Text style={[styles.chatBtnText, { color: accentColor }]}>Chat</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  card: {
    backgroundColor: Backgrounds.root,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  accentBar: {
    height: 3,
  },
  body: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  labelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  labelText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  othersBadge: {
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
  },
  othersBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textSubtle,
  },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  photoContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
  info: {
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
  serviceText: {
    fontSize: 12,
    fontWeight: "600",
  },
  timeBlock: {
    alignItems: "flex-end",
    gap: 3,
  },
  urgentDot: {
    width: 12,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
  },
  urgentDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    maxWidth: 110,
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
  footerHint: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textSubtle,
    fontWeight: "500",
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
