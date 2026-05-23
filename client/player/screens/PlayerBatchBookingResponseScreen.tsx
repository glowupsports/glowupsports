import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from "react-native";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import { PlayerV2StackParamList } from "@/navigation/PlayerV2Navigator";

type BatchRouteProps = RouteProp<PlayerV2StackParamList, "BatchBookingResponse">;

interface BatchRequest {
  id: string;
  requestedStart: string;
  requestedEnd: string;
  duration: number;
  sessionType: string;
  status: string;
  playerNote?: string | null;
  playerConfirmed: boolean | null;
}

interface BatchData {
  batchId: string;
  coachName: string | null;
  coachPhotoUrl: string | null;
  requests: BatchRequest[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type ConfirmMap = Record<string, boolean | null>;

export default function PlayerBatchBookingResponseScreen() {
  const route = useRoute<BatchRouteProps>();
  const navigation = useNavigation();
  const { batchId } = route.params;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<BatchData>({
    queryKey: ["/api/player/booking-batches", batchId],
    queryFn: () => apiRequest("GET", `/api/player/booking-batches/${batchId}`).then((r) => r.json() as Promise<BatchData>),
    staleTime: 30_000,
  });

  const [localConfirm, setLocalConfirm] = useState<ConfirmMap>({});
  const [saving, setSaving] = useState(false);

  const getConfirmed = (req: BatchRequest): boolean | null =>
    req.id in localConfirm ? localConfirm[req.id] : req.playerConfirmed;

  const toggleWeek = (id: string, value: boolean) => {
    setLocalConfirm((prev) => ({
      ...prev,
      [id]: prev[id] === value ? null : value,
    }));
  };

  const isDirty = data?.requests.some((r) => r.id in localConfirm) ?? false;

  const handleSave = useCallback(async () => {
    if (!data) return;
    const toUpdate = data.requests.filter((r) => r.id in localConfirm);
    if (toUpdate.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        toUpdate.map((r) =>
          apiRequest("PATCH", `/api/player/booking-requests/${r.id}/player-confirm`, {
            confirmed: localConfirm[r.id] ?? false,
          }),
        ),
      );
      await refetch();
      setLocalConfirm({});
      Alert.alert("Saved", "Your availability has been sent to the coach.");
    } catch {
      Alert.alert("Error", "Could not save your availability. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [data, localConfirm, refetch]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <TennisBallSpinner size="large" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={40} color={Colors.dark.error || "#EF4444"} />
        <Text style={styles.errorText}>Could not load batch</Text>
        <Pressable onPress={() => refetch()} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const confirmedCount = data.requests.filter((r) => getConfirmed(r) === true).length;
  const declinedCount = data.requests.filter((r) => getConfirmed(r) === false).length;
  const pendingCount = data.requests.length - confirmedCount - declinedCount;

  const sessionTypeLabel =
    data.requests[0]?.sessionType === "private"
      ? "Private Lesson"
      : data.requests[0]?.sessionType === "semi_private"
        ? "Semi-Private Lesson"
        : "Group Session";

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header info */}
      <View style={styles.headerCard}>
        <View style={styles.batchBadge}>
          <Ionicons name="repeat" size={12} color={Colors.dark.primary} />
          <Text style={styles.batchBadgeText}>
            {data.requests.length} week multi-booking · {data.requests[0]?.duration} min
          </Text>
        </View>
        <Text style={styles.sessionTypeText}>{sessionTypeLabel}</Text>
        {data.coachName ? (
          <Text style={styles.coachText}>With {data.coachName}</Text>
        ) : null}
        <Text style={styles.instructionText}>
          Mark each week you are available. Your coach will only approve the weeks you confirm.
        </Text>

        {/* Summary pills */}
        <View style={styles.summaryRow}>
          <View style={[styles.pill, { backgroundColor: Colors.dark.primary + "20" }]}>
            <Ionicons name="checkmark-circle" size={12} color={Colors.dark.primary} />
            <Text style={[styles.pillText, { color: Colors.dark.primary }]}>{confirmedCount} available</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: "#EF4444" + "20" }]}>
            <Ionicons name="close-circle" size={12} color="#EF4444" />
            <Text style={[styles.pillText, { color: "#EF4444" }]}>{declinedCount} unavailable</Text>
          </View>
          {pendingCount > 0 ? (
            <View style={[styles.pill, { backgroundColor: Colors.dark.cardAlt + "80" }]}>
              <Ionicons name="time" size={12} color={Colors.dark.textMuted} />
              <Text style={[styles.pillText, { color: Colors.dark.textMuted }]}>{pendingCount} pending</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Week-by-week toggles */}
      <Text style={styles.sectionLabel}>Your availability</Text>
      {data.requests.map((req, i) => {
        const confirmed = getConfirmed(req);
        const isConfirmed = confirmed === true;
        const isDeclined = confirmed === false;
        return (
          <View key={req.id} style={styles.weekCard}>
            <View style={styles.weekLeft}>
              <View style={styles.weekNumber}>
                <Text style={styles.weekNumberText}>{i + 1}</Text>
              </View>
              <View>
                <Text style={styles.weekDate}>{formatDate(req.requestedStart)}</Text>
                <Text style={styles.weekTime}>
                  {formatTime(req.requestedStart)} – {formatTime(req.requestedEnd)}
                </Text>
                {req.status !== "pending" ? (
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>
                      {req.status === "approved" ? "Approved" :
                       req.status === "declined" ? "Declined" :
                       req.status === "cancelled" ? "Cancelled" : req.status}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.toggleBtn, isConfirmed && styles.toggleBtnActive]}
                onPress={() => toggleWeek(req.id, true)}
              >
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={isConfirmed ? "#000" : Colors.dark.textMuted}
                />
              </Pressable>
              <Pressable
                style={[styles.toggleBtn, isDeclined && styles.toggleBtnDecline]}
                onPress={() => toggleWeek(req.id, false)}
              >
                <Ionicons
                  name="close"
                  size={16}
                  color={isDeclined ? "#fff" : Colors.dark.textMuted}
                />
              </Pressable>
            </View>
          </View>
        );
      })}

      {/* Save button */}
      {isDirty ? (
        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <TennisBallSpinner size="small" color="#000" />
          ) : (
            <>
              <Ionicons name="send" size={16} color="#000" />
              <Text style={styles.saveBtnText}>Send availability to coach</Text>
            </>
          )}
        </Pressable>
      ) : (
        <View style={styles.savedNote}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.dark.primary} />
          <Text style={styles.savedNoteText}>
            {data.requests.every((r) => r.playerConfirmed !== null)
              ? "Availability sent — waiting for coach approval"
              : "Tap the green/red buttons to mark each week"}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  content: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  errorText: {
    color: Colors.dark.textSecondary,
    fontSize: 15,
  },
  retryBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.full,
  },
  retryBtnText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 14,
  },
  headerCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  batchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "18",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: Spacing.xs,
  },
  batchBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  sessionTypeText: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  coachText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  instructionText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    lineHeight: 18,
    marginTop: Spacing.xs,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: Spacing.xs,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 2,
    marginTop: Spacing.xs,
  },
  weekCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  weekLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  weekNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  weekNumberText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  weekDate: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  weekTime: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 1,
  },
  statusPill: {
    marginTop: 4,
    backgroundColor: Colors.dark.cardAlt,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "capitalize",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  toggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  toggleBtnActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  toggleBtnDecline: {
    backgroundColor: "#EF4444",
    borderColor: "#EF4444",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
  savedNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  savedNoteText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
});
