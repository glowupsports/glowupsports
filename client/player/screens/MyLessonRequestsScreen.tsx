import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  Animated,
  ViewStyle,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface BookingRequest {
  id: string;
  coachId: string | null;
  coachName?: string;
  coachPhotoUrl?: string | null;
  locationName?: string | null;
  requestedStart: string;
  requestedEnd: string;
  duration: number;
  sessionType: string;
  status: "pending" | "approved" | "declined" | "cancelled" | "awaiting_player_reply";
  playerNote?: string | null;
  coachNote?: string | null;
  responseNote?: string | null;
  declineReason?: string | null;
  coachWelcomeMessage?: string | null;
  coachPreConfirmMessage?: string | null;
  counterProposedStart?: string | null;
  counterProposedEnd?: string | null;
  counterProposedAt?: string | null;
  counterProposalStatus?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

const DECLINE_REASON_LABELS: Record<string, string> = {
  schedule_conflict: "Schedule conflict",
  skill_mismatch: "Skill level mismatch",
  court_unavailable: "Court unavailable",
  personal: "Personal reason",
  response_timeout: "Coach didn't respond in time",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "Pending", color: Colors.dark.orange || "#F97316", icon: "time" },
  awaiting_player_reply: { label: "Reply needed", color: Colors.dark.primary ?? Colors.dark.primary, icon: "chatbubble-ellipses" },
  approved: { label: "Approved", color: Colors.dark.primary, icon: "checkmark-circle" },
  declined: { label: "Declined", color: Colors.dark.error || "#EF4444", icon: "close-circle" },
  cancelled: { label: "Cancelled", color: Colors.dark.textMuted || "#6B7280", icon: "ban" },
};

function useCountdown(expiresAt: string | null | undefined) {
  const [remaining, setRemaining] = useState<number>(0);
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, diff));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function ApprovedCard({ item }: { item: BookingRequest }) {
  const glowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const navigation = useNavigation<any>();
  const navigatedRef = useRef(false);

  const start = new Date(item.requestedStart);
  const end = new Date(item.requestedEnd);
  const dateStr = start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const timeStr = `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const goToConfirmed = () => {
    navigation.navigate("BookingConfirmed", {
      sessionType: item.sessionType,
      dateStr,
      timeStr,
      coachName: item.coachName,
      coachPhotoUrl: item.coachPhotoUrl ?? undefined,
      coachWelcomeMessage: item.coachWelcomeMessage ?? undefined,
      durationMinutes: item.duration,
      locationName: item.locationName ?? undefined,
    });
  };

  useEffect(() => {
    // Auto-navigate to cinematic screen once per status transition
    if (!navigatedRef.current) {
      navigatedRef.current = true;
      goToConfirmed();
    }
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 12 }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1800, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1800, useNativeDriver: false }),
        ])
      ),
    ]).start();
  }, []);

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.dark.primary + "40", Colors.dark.primary + "CC"],
  });

  const approvedCardStyle: ViewStyle = {
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    marginBottom: Spacing.md,
    overflow: "hidden",
  };

  return (
    <Pressable onPress={goToConfirmed}>
      <Animated.View style={[approvedCardStyle, { transform: [{ scale: scaleAnim }], borderColor }]}>
        <LinearGradient
          colors={[Colors.dark.primary + "20", Colors.dark.backgroundSecondary]}
          style={styles.approvedGradient}
        >
          <View style={styles.approvedIconRow}>
            <View style={styles.approvedIconBg}>
              <Ionicons name="checkmark-circle" size={32} color={Colors.dark.primary} />
            </View>
            <View style={styles.approvedTextBlock}>
              <Text style={styles.approvedTitle}>Booking Confirmed</Text>
              <Text style={styles.approvedSubtitle}>{item.sessionType.replace("_", " ")} · {item.duration} min</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
          </View>

          <View style={styles.approvedDetails}>
            <View style={styles.approvedDetailRow}>
              <Ionicons name="calendar" size={16} color={Colors.dark.primary} />
              <Text style={styles.approvedDetailText}>{dateStr}</Text>
            </View>
            <View style={styles.approvedDetailRow}>
              <Ionicons name="time" size={16} color={Colors.dark.primary} />
              <Text style={styles.approvedDetailText}>{timeStr}</Text>
            </View>
            {item.coachName ? (
              <View style={styles.approvedDetailRow}>
                <Ionicons name="person" size={16} color={Colors.dark.primary} />
                <Text style={styles.approvedDetailText}>{item.coachName}</Text>
              </View>
            ) : null}
          </View>

          {item.coachWelcomeMessage ? (
            <View style={styles.welcomeMsgCard}>
              <Ionicons name="chatbubble-ellipses" size={14} color={Colors.dark.primary} />
              <Text style={styles.welcomeMsgText}>{item.coachWelcomeMessage}</Text>
            </View>
          ) : null}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

function PlayerReplyCard({ item, onReplied }: { item: BookingRequest; onReplied: () => void }) {
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!reply.trim()) return;
    setLoading(true);
    try {
      await apiRequest("POST", `/api/player/booking-requests/${item.id}/reply`, { reply: reply.trim() });
      onReplied();
    } catch {
      Alert.alert("Error", "Failed to send reply");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ marginTop: Spacing.sm, gap: Spacing.xs }}>
      <TextInput
        style={[styles.noteContainer, { color: Colors.dark.text, minHeight: 60 }]}
        placeholder="Type your reply..."
        placeholderTextColor={Colors.dark.textMuted}
        value={reply}
        onChangeText={setReply}
        multiline
        maxLength={400}
      />
      <Pressable
        style={[styles.cancelButton, { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary }, (!reply.trim() || loading) ? { opacity: 0.5 } : null]}
        onPress={handleSend}
        disabled={!reply.trim() || loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <>
            <Ionicons name="send" size={16} color={Colors.dark.buttonText || "#000"} />
            <Text style={[styles.cancelButtonText, { color: Colors.dark.buttonText || "#000" }]}>Send Reply</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function CounterProposalCard({
  item,
  onAccepted,
  onDeclined,
}: {
  item: BookingRequest;
  onAccepted: () => void;
  onDeclined: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<any>();

  const origStart = new Date(item.requestedStart);
  const origEnd = new Date(item.requestedEnd);
  const altStart = new Date(item.counterProposedStart!);
  const altEnd = new Date(item.counterProposedEnd!);

  const origDateStr = origStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const origTimeStr = `${origStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${origEnd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const altDateStr = altStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const altTimeStr = `${altStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${altEnd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const handleRespond = async (accept: boolean) => {
    setLoading(true);
    try {
      await apiRequest("POST", `/api/player/booking-requests/${item.id}/counter-response`, { accept });
      if (accept) {
        // Navigate to cinematic confirmation screen
        navigation.navigate("BookingConfirmed", {
          sessionType: item.sessionType,
          dateStr: altDateStr,
          timeStr: altTimeStr,
          coachName: item.coachName,
          coachPhotoUrl: item.coachPhotoUrl ?? undefined,
          coachWelcomeMessage: item.coachWelcomeMessage,
          durationMinutes: item.duration,
          locationName: item.locationName ?? undefined,
        });
      }
      onAccepted();
    } catch {
      Alert.alert("Error", "Failed to respond to counter-proposal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.counterCard}>
      <View style={styles.counterHeader}>
        <Ionicons name="swap-horizontal" size={18} color={Colors.dark.orange || "#F97316"} />
        <Text style={styles.counterTitle}>Coach suggested a new time</Text>
      </View>

      <View style={styles.counterSlots}>
        <View style={styles.counterSlot}>
          <Text style={styles.counterSlotLabel}>Your request</Text>
          <Text style={styles.counterSlotDate}>{origDateStr}</Text>
          <Text style={styles.counterSlotTime}>{origTimeStr}</Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color={Colors.dark.textSecondary} />
        <View style={[styles.counterSlot, styles.counterSlotAlt]}>
          <Text style={styles.counterSlotLabel}>New time</Text>
          <Text style={[styles.counterSlotDate, { color: Colors.dark.primary }]}>{altDateStr}</Text>
          <Text style={[styles.counterSlotTime, { color: Colors.dark.primary }]}>{altTimeStr}</Text>
        </View>
      </View>

      <View style={styles.counterActions}>
        <Pressable
          style={[styles.counterDeclineBtn, loading ? { opacity: 0.6 } : null]}
          onPress={() => handleRespond(false)}
          disabled={loading}
        >
          <Ionicons name="close" size={16} color={Colors.dark.error || "#EF4444"} />
          <Text style={styles.counterDeclineBtnText}>Decline</Text>
        </Pressable>
        <Pressable
          style={[styles.counterAcceptBtn, loading ? { opacity: 0.6 } : null]}
          onPress={() => handleRespond(true)}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark" size={16} color="#FFF" />
              <Text style={styles.counterAcceptBtnText}>Accept new time</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function MyLessonRequestsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery<BookingRequest[]>({
    queryKey: ["/api/player/booking-requests"],
    refetchInterval: 30000, // Poll every 30s for status updates (pending → approved etc.)
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("POST", `/api/player/booking-requests/${requestId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/booking-requests"] });
      Alert.alert("Cancelled", "Your booking request has been cancelled.");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to cancel request");
    },
  });

  const handleCancel = (request: BookingRequest) => {
    Alert.alert(
      "Cancel Request?",
      "Are you sure you want to cancel this booking request?",
      [
        { text: "No", style: "cancel" },
        { text: "Yes, Cancel", style: "destructive", onPress: () => cancelMutation.mutate(request.id) },
      ]
    );
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/player/booking-requests"] });

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      time: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
    };
  };

  const renderRequest = ({ item }: { item: BookingRequest }) => {
    // Approved: cinematic card
    if (item.status === "approved") {
      return <ApprovedCard item={item} />;
    }

    // Pending with counter-proposal
    if (item.status === "pending" && item.counterProposedStart && item.counterProposalStatus === "pending") {
      return (
        <CounterProposalCard
          item={item}
          onAccepted={invalidate}
          onDeclined={invalidate}
        />
      );
    }

    const statusConfig = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
    const startDT = formatDateTime(item.requestedStart);
    const endDT = formatDateTime(item.requestedEnd);

    return (
      <View style={styles.requestCard}>
        <View style={styles.requestHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + "20" }]}>
            <Ionicons name={statusConfig.icon as keyof typeof Ionicons.glyphMap} size={14} color={statusConfig.color} />
            <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
          </View>
          <Text style={styles.sessionType}>{item.sessionType.replace("_", " ").toUpperCase()}</Text>
        </View>

        {/* Countdown for pending */}
        {item.status === "pending" && item.expiresAt ? (
          <PendingCountdown expiresAt={item.expiresAt} />
        ) : null}

        <View style={styles.requestDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={18} color={Colors.dark.textMuted} />
            <Text style={styles.detailText}>{startDT.date}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={18} color={Colors.dark.textMuted} />
            <Text style={styles.detailText}>{startDT.time} - {endDT.time}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="hourglass-outline" size={18} color={Colors.dark.textMuted} />
            <Text style={styles.detailText}>{item.duration} min</Text>
          </View>
          {item.coachName ? (
            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={18} color={Colors.dark.textMuted} />
              <Text style={styles.detailText}>{item.coachName}</Text>
            </View>
          ) : null}
        </View>

        {item.playerNote ? (
          <View style={styles.noteContainer}>
            <Text style={styles.noteLabel}>Your Note:</Text>
            <Text style={styles.noteText}>{item.playerNote}</Text>
          </View>
        ) : null}

        {/* Coach pre-confirm message */}
        {item.coachPreConfirmMessage ? (
          <View style={[styles.noteContainer, { backgroundColor: (Colors.dark.primary ?? Colors.dark.primary) + "10", borderWidth: 1, borderColor: (Colors.dark.primary ?? Colors.dark.primary) + "30" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <Ionicons name="chatbubble-ellipses" size={13} color={Colors.dark.primary ?? Colors.dark.primary} />
              <Text style={[styles.noteLabel, { color: Colors.dark.primary ?? Colors.dark.primary }]}>Message from your coach:</Text>
            </View>
            <Text style={styles.noteText}>{item.coachPreConfirmMessage}</Text>
          </View>
        ) : null}

        {/* Player reply input for awaiting_player_reply status */}
        {item.status === "awaiting_player_reply" ? (
          <PlayerReplyCard item={item} onReplied={invalidate} />
        ) : null}

        {/* Decline reason */}
        {item.status === "declined" && (item.declineReason || item.responseNote) ? (
          <View style={[styles.noteContainer, { backgroundColor: (Colors.dark.error || "#EF4444") + "10" }]}>
            <Text style={styles.noteLabel}>Reason:</Text>
            <Text style={styles.noteText}>
              {item.declineReason ? (DECLINE_REASON_LABELS[item.declineReason] ?? item.declineReason) : item.responseNote}
            </Text>
          </View>
        ) : null}

        {item.status === "pending" ? (
          <Pressable
            style={styles.cancelButton}
            onPress={() => handleCancel(item)}
            disabled={cancelMutation.isPending}
          >
            <Ionicons name="close" size={18} color={Colors.dark.error || "#EF4444"} />
            <Text style={styles.cancelButtonText}>Cancel Request</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="document-text-outline" size={64} color={Colors.dark.textMuted} />
        <Text style={styles.emptyTitle}>No Requests Yet</Text>
        <Text style={styles.emptySubtitle}>Your lesson booking requests will appear here</Text>
        <Pressable style={styles.bookButton} onPress={() => navigation.navigate("LessonBooking")}>
          <Ionicons name="add" size={20} color={Colors.dark.buttonText} />
          <Text style={styles.bookButtonText}>Book a Lesson</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={requests}
      renderItem={renderRequest}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.lg }]}
      showsVerticalScrollIndicator={false}
      style={styles.container}
    />
  );
}

function PendingCountdown({ expiresAt }: { expiresAt: string }) {
  const remaining = useCountdown(expiresAt);
  const isExpiringSoon = remaining > 0 && remaining < 30 * 60 * 1000;
  const isExpired = remaining === 0;
  return (
    <View style={[styles.countdownRow, isExpiringSoon ? styles.countdownRowUrgent : null]}>
      <Ionicons
        name="time-outline"
        size={13}
        color={isExpired ? Colors.dark.error : isExpiringSoon ? "#FF6B35" : Colors.dark.textMuted}
      />
      <Text style={[styles.countdownText, isExpiringSoon ? styles.countdownTextUrgent : null, isExpired ? styles.countdownTextExpired : null]}>
        {isExpired
          ? "Response window expired"
          : `Coach has ${formatCountdown(remaining)} to respond`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },

  // Approved card
  approvedGradient: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  approvedIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  approvedIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  approvedTextBlock: {
    flex: 1,
    gap: 3,
  },
  approvedTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  approvedSubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary || Colors.dark.textMuted,
    textTransform: "capitalize",
  },
  approvedDetails: {
    gap: Spacing.xs,
    backgroundColor: Colors.dark.background + "60",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  approvedDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  approvedDetailText: {
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  welcomeMsgCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.dark.primary + "10",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "25",
  },
  welcomeMsgText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.text,
    lineHeight: 18,
    fontStyle: "italic",
  },

  // Counter proposal
  counterCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1.5,
    borderColor: (Colors.dark.orange || "#F97316") + "50",
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  counterHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  counterTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  counterSlots: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  counterSlot: {
    flex: 1,
    backgroundColor: Colors.dark.background + "80",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 2,
  },
  counterSlotAlt: {
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    backgroundColor: Colors.dark.primary + "10",
  },
  counterSlotLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  counterSlotDate: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  counterSlotTime: {
    fontSize: 12,
    color: Colors.dark.textSecondary || Colors.dark.textMuted,
  },
  counterActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  counterDeclineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: (Colors.dark.error || "#EF4444") + "50",
    backgroundColor: (Colors.dark.error || "#EF4444") + "10",
  },
  counterDeclineBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.error || "#EF4444",
  },
  counterAcceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 2,
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary,
  },
  counterAcceptBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },

  // Standard card
  requestCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border || Colors.dark.primary + "20",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  sessionType: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.dark.background + "60",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  countdownRowUrgent: {
    backgroundColor: "#FF6B3510",
  },
  countdownText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  countdownTextUrgent: {
    color: "#FF6B35",
    fontWeight: "700",
  },
  countdownTextExpired: {
    color: Colors.dark.error || "#EF4444",
    fontWeight: "700",
  },
  requestDetails: {
    gap: Spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  detailText: {
    fontSize: 14,
    color: Colors.dark.text,
    flex: 1,
  },
  noteContainer: {
    backgroundColor: Colors.dark.background + "60",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 2,
  },
  noteLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  noteText: {
    fontSize: 13,
    color: Colors.dark.text,
    lineHeight: 18,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: (Colors.dark.error || "#EF4444") + "50",
    backgroundColor: (Colors.dark.error || "#EF4444") + "08",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.error || "#EF4444",
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  emptySubtitle: {
    fontSize: 15,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  bookButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  bookButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.dark.buttonText || "#000",
  },
});
