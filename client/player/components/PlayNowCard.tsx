import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { useWebSocket } from "@/lib/useWebSocket";

export interface AvailableTodaySlot {
  slotId: string;
  time: string;
  courtName: string;
  academyName: string;
  durationMinutes: number;
  price?: number | null;
  coachId: string;
  coachName: string;
  date: string;
}

interface PlayNowCardProps {
  hasTodaySession?: boolean;
  onBookNow: (slot?: AvailableTodaySlot) => void;
  onBrowseAll: () => void;
}

function formatSlotTime(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function isWithinActiveHours(): boolean {
  const now = new Date();
  const hours = now.getHours();
  return hours >= 6 && hours < 22;
}

const EXPANDED_HEIGHT = 200;

export default function PlayNowCard({ hasTodaySession, onBookNow, onBrowseAll }: PlayNowCardProps) {
  const { user, isGuest } = useAuth();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useSharedValue(0);

  const { data: slots, isLoading } = useQuery<AvailableTodaySlot[]>({
    queryKey: ["/api/courts/available-today"],
    queryFn: async () => {
      const url = new URL("/api/courts/available-today", getApiUrl());
      const r = await fetch(url.toString(), {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!user?.playerId && !isGuest,
    staleTime: Infinity,
  });

  useWebSocket({
    onCourtAvailabilityUpdated: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts/available-today"] });
    }, [queryClient]),
  });

  const isFreePlayer = !user?.academyId;
  const withinHours = isWithinActiveHours();

  const toggleExpand = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    const next = !expanded;
    setExpanded(next);
    expandAnim.value = withTiming(next ? 1 : 0, {
      duration: 280,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [expanded, expandAnim]);

  const expandedStyle = useAnimatedStyle(() => ({
    maxHeight: expandAnim.value * EXPANDED_HEIGHT,
    opacity: expandAnim.value,
    overflow: "hidden",
  }));

  if (isGuest || isLoading) return null;

  if (isFreePlayer) {
    return (
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.iconWrap}>
            <Ionicons name="tennisball-outline" size={16} color={GlowColors.primary} />
          </View>
          <View style={s.textWrap}>
            <Text style={s.label}>Play Now</Text>
            <Text style={s.sub}>Join an academy to see and book available courts</Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={Colors.dark.textMuted} />
        </View>
      </View>
    );
  }

  if (!withinHours || hasTodaySession) return null;

  const available = slots ?? [];
  const topSlots = available.slice(0, 3);

  if (available.length === 0) {
    return (
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.iconWrap}>
            <Ionicons name="tennisball-outline" size={16} color={Colors.dark.textMuted} />
          </View>
          <View style={s.textWrap}>
            <Text style={s.label}>Courts Available Today</Text>
            <Text style={s.sub}>Nothing available today — see tomorrow</Text>
          </View>
          <Pressable
            style={s.browseBtn}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onBrowseAll();
            }}
            accessibilityLabel="Browse full schedule"
          >
            <Text style={s.browseBtnText}>Browse</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      style={s.card}
      onPress={toggleExpand}
      accessibilityLabel={`${available.length} court slots available today. Tap to expand.`}
      accessibilityRole="button"
    >
      <View style={s.row}>
        <View style={s.iconWrap}>
          <Ionicons name="tennisball" size={16} color={GlowColors.primary} />
        </View>
        <View style={s.textWrap}>
          <Text style={s.label}>Courts Available Today</Text>
        </View>
        <View style={s.badge}>
          <Text style={s.badgeText}>{available.length} open</Text>
        </View>
        <Pressable
          style={s.bookBtn}
          onPress={(e) => {
            e.stopPropagation?.();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onBookNow();
          }}
          accessibilityLabel="Book Now"
        >
          <Text style={s.bookBtnText}>Book Now</Text>
          <Ionicons name="arrow-forward" size={13} color="#fff" />
        </Pressable>
      </View>

      <Animated.View style={expandedStyle}>
        <View style={s.slotsContainer}>
          {topSlots.map((slot) => (
            <View key={slot.slotId} style={s.slotRow}>
              <View style={s.slotTimeWrap}>
                <Text style={s.slotTime}>{formatSlotTime(slot.time)}</Text>
                <Text style={s.slotDuration}>{slot.durationMinutes}m</Text>
              </View>
              <View style={s.slotInfo}>
                <Text style={s.slotCourt} numberOfLines={1}>{slot.courtName}</Text>
                <Text style={s.slotAcademy} numberOfLines={1}>{slot.academyName}</Text>
              </View>
              <Pressable
                style={s.slotBookBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onBookNow(slot);
                }}
                accessibilityLabel={`Book slot at ${formatSlotTime(slot.time)}`}
              >
                <Text style={s.slotBookBtnText}>Book</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(76,217,100,0.06)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(76,217,100,0.2)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(76,217,100,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  textWrap: { flex: 1 },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  sub: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  badge: {
    backgroundColor: "rgba(76,217,100,0.15)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(76,217,100,0.3)",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4CD964",
  },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bookBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  browseBtn: {
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  browseBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  slotsContainer: {
    gap: 6,
    paddingTop: 8,
    paddingBottom: 4,
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  slotTimeWrap: {
    minWidth: 56,
  },
  slotTime: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  slotDuration: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  slotInfo: {
    flex: 1,
  },
  slotCourt: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  slotAcademy: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  slotBookBtn: {
    backgroundColor: GlowColors.primary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  slotBookBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
});
