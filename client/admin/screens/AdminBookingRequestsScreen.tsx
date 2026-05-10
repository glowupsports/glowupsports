import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

interface AdminBookingRequest {
  id: string;
  playerId: string;
  playerName: string;
  playerPhotoUrl: string | null;
  coachId: string | null;
  coachName: string;
  coachPhotoUrl: string | null;
  requestedStart: string;
  requestedEnd: string;
  duration: number;
  sessionType: string;
  playerNote: string | null;
  status: string;
  createdAt: string;
  waitingLabel: string;
}

const DECLINE_REASONS = [
  { value: "schedule_conflict", label: "Schedule conflict" },
  { value: "skill_mismatch", label: "Skill level mismatch" },
  { value: "court_unavailable", label: "Court unavailable" },
  { value: "personal", label: "Personal reason" },
  { value: "response_timeout", label: "Response timeout" },
] as const;

type DeclineReason = typeof DECLINE_REASONS[number]["value"];

function formatSessionTime(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const dayStr = s.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startStr = s.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  const endStr = e.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${dayStr} · ${startStr} – ${endStr}`;
}

function sessionTypeLabel(type: string): string {
  switch (type) {
    case "private": return "Private";
    case "semi_private": return "Semi-Private";
    case "group": return "Group";
    default: return type;
  }
}

function AvatarInitial({ name, size = 44 }: { name: string; size?: number }) {
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarText}>{initial}</Text>
    </View>
  );
}

function RequestCard({
  request,
  onApprove,
  onDecline,
}: {
  request: AdminBookingRequest;
  onApprove: (id: string) => void;
  onDecline: (request: AdminBookingRequest) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <AvatarInitial name={request.playerName} />
        <View style={styles.cardHeaderInfo}>
          <Text style={styles.playerName}>{request.playerName}</Text>
          <Text style={styles.coachName}>with {request.coachName}</Text>
        </View>
        <View style={styles.waitingBadge}>
          <Text style={styles.waitingText}>{request.waitingLabel}</Text>
        </View>
      </View>

      <View style={styles.cardMeta}>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.metaText}>{formatSessionTime(request.requestedStart, request.requestedEnd)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="tennisball-outline" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.metaText}>{sessionTypeLabel(request.sessionType)} · {request.duration} min</Text>
        </View>
        {!!request.playerNote && (
          <View style={styles.metaRow}>
            <Ionicons name="chatbubble-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.metaNote} numberOfLines={2}>{request.playerNote}</Text>
          </View>
        )}
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.actionBtn, styles.declineBtn]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onDecline(request);
          }}
        >
          <Ionicons name="close" size={16} color="#E74C3C" />
          <Text style={[styles.actionBtnText, { color: "#E74C3C" }]}>Decline</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.approveBtn]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onApprove(request.id);
          }}
        >
          <Ionicons name="checkmark" size={16} color={Colors.dark.buttonText} />
          <Text style={[styles.actionBtnText, { color: Colors.dark.buttonText }]}>Approve</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DeclineModal({
  request,
  visible,
  onClose,
  onConfirm,
}: {
  request: AdminBookingRequest | null;
  visible: boolean;
  onClose: () => void;
  onConfirm: (id: string, declineReason: DeclineReason | null) => void;
}) {
  const [selected, setSelected] = useState<DeclineReason | null>(null);

  const handleConfirm = useCallback(() => {
    if (!request) return;
    onConfirm(request.id, selected);
    setSelected(null);
  }, [request, selected, onConfirm]);

  const handleClose = useCallback(() => {
    setSelected(null);
    onClose();
  }, [onClose]);

  if (!request) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>Decline Request</Text>
          <Text style={styles.modalSubtitle}>
            Declining {request.playerName}&apos;s lesson request with {request.coachName}.
          </Text>
          <Text style={styles.modalSectionLabel}>Reason (optional)</Text>
          {DECLINE_REASONS.map((r) => (
            <Pressable
              key={r.value}
              style={[styles.reasonRow, selected === r.value && styles.reasonRowSelected]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelected(selected === r.value ? null : r.value);
              }}
            >
              <View style={[styles.reasonRadio, selected === r.value && styles.reasonRadioSelected]}>
                {selected === r.value && <View style={styles.reasonRadioDot} />}
              </View>
              <Text style={[styles.reasonLabel, selected === r.value && styles.reasonLabelSelected]}>
                {r.label}
              </Text>
            </Pressable>
          ))}
          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancelBtn} onPress={handleClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.modalDeclineBtn} onPress={handleConfirm}>
              <Text style={styles.modalDeclineText}>Decline</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function AdminBookingRequestsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<AdminBookingRequest | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: requests = [], isLoading, refetch } = useQuery<AdminBookingRequest[]>({
    queryKey: ["/api/admin/booking-requests"],
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleApprove = useCallback(async (id: string) => {
    setActionLoading(id);
    try {
      await apiRequest("POST", `/api/admin/booking-requests/${id}/approve`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/admin/booking-requests"] });
    } catch (err) {
      console.error("[AdminBookingRequests] Approve error:", err);
    } finally {
      setActionLoading(null);
    }
  }, [queryClient]);

  const handleDeclineConfirm = useCallback(async (id: string, declineReason: DeclineReason | null) => {
    setDeclineTarget(null);
    setActionLoading(id);
    try {
      await apiRequest("POST", `/api/admin/booking-requests/${id}/decline`, {
        declineReason: declineReason || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/booking-requests"] });
    } catch (err) {
      console.error("[AdminBookingRequests] Decline error:", err);
    } finally {
      setActionLoading(null);
    }
  }, [queryClient]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <TennisBallSpinner size="large" color={Colors.dark.orange} />
        <Text style={styles.loadingText}>Loading booking requests...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Booking Requests</Text>
          {requests.length > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{requests.length}</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.orange} />
        }
      >
        {requests.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="checkmark-circle-outline" size={56} color={Colors.dark.primary} />
            </View>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptySubtitle}>
              No pending booking requests right now. Pull down to refresh.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.listSubtitle}>
              {requests.length} pending {requests.length === 1 ? "request" : "requests"} across all coaches
            </Text>
            {requests.map((r) =>
              actionLoading === r.id ? (
                <View key={r.id} style={[styles.card, styles.cardLoading]}>
                  <TennisBallSpinner size="small" color={Colors.dark.orange} />
                  <Text style={styles.loadingText}>Processing...</Text>
                </View>
              ) : (
                <RequestCard
                  key={r.id}
                  request={r}
                  onApprove={handleApprove}
                  onDecline={setDeclineTarget}
                />
              )
            )}
          </>
        )}
      </ScrollView>

      <DeclineModal
        request={declineTarget}
        visible={!!declineTarget}
        onClose={() => setDeclineTarget(null)}
        onConfirm={handleDeclineConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  headerBadge: {
    backgroundColor: Colors.dark.orange,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: "center",
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#000",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    flexGrow: 1,
  },
  listSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    justifyContent: "center",
    minHeight: 80,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  avatar: {
    backgroundColor: Colors.dark.orange + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.orange,
  },
  cardHeaderInfo: {
    flex: 1,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  coachName: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  waitingBadge: {
    backgroundColor: Colors.dark.orange + "18",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.orange + "35",
  },
  waitingText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.orange,
  },
  cardMeta: {
    gap: 6,
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  metaText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  metaNote: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  declineBtn: {
    backgroundColor: "#E74C3C15",
    borderWidth: 1,
    borderColor: "#E74C3C35",
  },
  approveBtn: {
    backgroundColor: Colors.dark.primary,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: Spacing.xl,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  modalSectionLabel: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  reasonRowSelected: {
    borderBottomColor: Colors.dark.primary + "40",
  },
  reasonRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  reasonRadioSelected: {
    borderColor: Colors.dark.primary,
  },
  reasonRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.primary,
  },
  reasonLabel: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  reasonLabelSelected: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
  },
  modalCancelText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  modalDeclineBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    backgroundColor: "#E74C3C",
    alignItems: "center",
  },
  modalDeclineText: {
    ...Typography.body,
    color: "#fff",
    fontWeight: "700",
  },
});
