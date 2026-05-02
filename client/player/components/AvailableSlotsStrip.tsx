import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import type { AvailableTodaySlot } from "./PlayNowCard";

interface AvailableSlotsStripProps {
  onBookSlot: (slot: AvailableTodaySlot) => void;
  onBookNow: () => void;
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

export default function AvailableSlotsStrip({ onBookSlot, onBookNow }: AvailableSlotsStripProps) {
  const { user, isGuest } = useAuth();
  const queryClient = useQueryClient();

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
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts/available-today"] });
    }, [queryClient]),
  );

  const isFreePlayer = !user?.academyId;
  if (isGuest || isFreePlayer) return null;

  if (isLoading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="small" color={Colors.dark.textMuted} />
        <Text style={s.loadingText}>Loading available slots...</Text>
      </View>
    );
  }

  const available = slots ?? [];

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <Ionicons name="tennisball" size={13} color={GlowColors.primary} />
        <Text style={s.headerLabel}>Open Slots Today</Text>
        {available.length > 0 ? (
          <View style={s.countBadge}>
            <Text style={s.countText}>{available.length}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onBookNow();
          }}
          accessibilityLabel="Book a court"
        >
          <Text style={s.seeAllText}>Book</Text>
        </Pressable>
      </View>

      {available.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>No slots available today</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
        >
          {available.map((slot) => (
            <Pressable
              key={slot.slotId}
              style={({ pressed }) => [s.slotCard, pressed && s.slotCardPressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onBookSlot(slot);
              }}
              accessibilityLabel={`Book ${slot.courtName} at ${formatSlotTime(slot.time)}`}
            >
              <Text style={s.slotTime}>{formatSlotTime(slot.time)}</Text>
              <Text style={s.slotCourt} numberOfLines={1}>{slot.courtName}</Text>
              <Text style={s.slotAcademy} numberOfLines={1}>{slot.academyName}</Text>
              <View style={s.slotMeta}>
                <Ionicons name="time-outline" size={10} color={Colors.dark.textMuted} />
                <Text style={s.slotDuration}>{slot.durationMinutes}m</Text>
                {slot.price ? (
                  <>
                    <View style={s.dot} />
                    <Text style={s.slotPrice}>${slot.price}</Text>
                  </>
                ) : null}
              </View>
              <View style={s.bookChip}>
                <Text style={s.bookChipText}>Book</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginBottom: Spacing.sm,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.lg,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  countBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  countText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  loadingText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  emptyWrap: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: 8,
  },
  slotCard: {
    width: 130,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
    padding: Spacing.sm,
    gap: 3,
  },
  slotCardPressed: {
    opacity: 0.75,
  },
  slotTime: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.text,
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
  slotMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  slotDuration: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.dark.textMuted,
  },
  slotPrice: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  bookChip: {
    marginTop: 6,
    backgroundColor: GlowColors.primary,
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: "center",
  },
  bookChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
});
