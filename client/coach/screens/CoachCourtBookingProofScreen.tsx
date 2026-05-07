import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Modal,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import { CoachStackParamList } from "@/coach/navigation/CoachNavigator";

type RouteParams = RouteProp<CoachStackParamList, "CoachCourtBookingProof">;

type ConfirmationStatus = "confirmed" | "pending" | "rejected" | "no_submission";

interface PlayerConfirmation {
  id: string | null;
  sessionId: string;
  playerId: string;
  playerName: string;
  status: ConfirmationStatus;
  screenshotUrl: string | null;
  confirmedAt: string | null;
  rejectionNote: string | null;
  createdAt: string | null;
}

interface SessionGroup {
  sessionId: string;
  sessionDate: string;
  sessionTime: string;
  confirmedCount: number;
  pendingCount: number;
  totalEnrolled: number;
  players: PlayerConfirmation[];
}

const STATUS_CONFIG: Record<ConfirmationStatus, { color: string; label: string }> = {
  confirmed:     { color: Colors.dark.successNeon, label: "Confirmed" },
  pending:       { color: Colors.dark.accentWarning, label: "Pending" },
  rejected:      { color: Colors.dark.error, label: "Rejected" },
  no_submission: { color: Colors.dark.textMuted, label: "No Submission" },
};

function RejectModal({
  visible,
  onClose,
  onConfirm,
  isPending,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
  isPending: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={rm.backdrop}>
        <View style={rm.sheet}>
          <Text style={rm.title}>Reject Screenshot</Text>
          <Text style={rm.subtitle}>Optionally explain what needs to be resubmitted.</Text>
          <TextInput
            style={rm.input}
            placeholder="Rejection reason (optional)"
            placeholderTextColor={Colors.dark.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={200}
          />
          <View style={rm.row}>
            <Pressable style={rm.cancelBtn} onPress={onClose}>
              <Text style={rm.cancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[rm.rejectBtn, isPending && rm.disabled]}
              disabled={isPending}
              onPress={() => onConfirm(note)}
            >
              {isPending ? (
                <TennisBallSpinner size="small" color={Colors.dark.error} />
              ) : (
                <Text style={rm.rejectTxt}>Reject</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const rm = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  title: { fontSize: 17, fontWeight: "700", color: Colors.dark.text },
  subtitle: { fontSize: 13, color: Colors.dark.textMuted },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: Colors.dark.text,
    padding: 12,
    minHeight: 80,
    fontSize: 14,
    textAlignVertical: "top",
  },
  row: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    padding: 13,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  cancelTxt: { fontSize: 15, fontWeight: "600", color: Colors.dark.textMuted },
  rejectBtn: {
    flex: 1,
    alignItems: "center",
    padding: 13,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
  },
  disabled: { opacity: 0.5 },
  rejectTxt: { fontSize: 14, fontWeight: "600", color: Colors.dark.error },
});

function ActionButtons({
  confirmationId,
  seriesId,
  sessionId,
}: {
  confirmationId: string;
  seriesId?: string;
  sessionId: string;
}) {
  const queryClient = useQueryClient();
  const [rejectModalVisible, setRejectModalVisible] = useState(false);

  const invalidate = () => {
    if (seriesId) {
      queryClient.invalidateQueries({
        queryKey: [`/api/coach/series/${seriesId}/court-booking-confirmations`],
      });
    }
    queryClient.invalidateQueries({
      queryKey: [`/api/coach/sessions/${sessionId}/court-booking-proofs`],
    });
  };

  const actionMutation = useMutation({
    mutationFn: ({
      action,
      rejectionNote,
    }: {
      action: "approve" | "reject";
      rejectionNote?: string;
    }) =>
      apiRequest("PATCH", `/api/coach/court-booking-confirmations/${confirmationId}`, {
        action,
        rejectionNote,
      }),
    onSuccess: () => {
      invalidate();
      setRejectModalVisible(false);
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message || "Action failed. Please try again.");
    },
  });

  return (
    <>
      <View style={actionStyles.row}>
        <Pressable
          style={[actionStyles.approveBtn, actionMutation.isPending && actionStyles.disabled]}
          disabled={actionMutation.isPending}
          onPress={() => actionMutation.mutate({ action: "approve" })}
        >
          <Ionicons name="checkmark-circle-outline" size={16} color={Colors.dark.successNeon} />
          <Text style={actionStyles.approveTxt}>Approve</Text>
        </Pressable>
        <Pressable
          style={[actionStyles.rejectBtn, actionMutation.isPending && actionStyles.disabled]}
          disabled={actionMutation.isPending}
          onPress={() => setRejectModalVisible(true)}
        >
          <Ionicons name="close-circle-outline" size={16} color={Colors.dark.error} />
          <Text style={actionStyles.rejectTxt}>Reject</Text>
        </Pressable>
      </View>
      <RejectModal
        visible={rejectModalVisible}
        onClose={() => setRejectModalVisible(false)}
        onConfirm={(note) => actionMutation.mutate({ action: "reject", rejectionNote: note })}
        isPending={actionMutation.isPending}
      />
    </>
  );
}

const actionStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, marginTop: 10 },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(0, 255, 135, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 255, 135, 0.3)",
  },
  approveTxt: { fontSize: 14, fontWeight: "600", color: Colors.dark.successNeon },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  rejectTxt: { fontSize: 14, fontWeight: "600", color: Colors.dark.error },
  disabled: { opacity: 0.5 },
});

export default function CoachCourtBookingProofScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteParams>();
  const { sessionId, seriesId } = route.params;

  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const { data: sessions, isLoading } = useQuery<SessionGroup[]>({
    queryKey: seriesId
      ? [`/api/coach/series/${seriesId}/court-booking-confirmations`]
      : [`/api/coach/sessions/${sessionId}/court-booking-proofs`],
    enabled: !!seriesId,
  });

  const sessionData = sessions?.find((s) => s.sessionId === sessionId) ?? null;

  if (!seriesId) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={40} color={Colors.dark.textMuted} />
        <Text style={styles.emptyText}>
          Court booking details are only available for class series.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <TennisBallSpinner size="large" color={Colors.dark.successNeon} />
      </View>
    );
  }

  if (!sessionData) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="calendar-outline" size={40} color={Colors.dark.textMuted} />
        <Text style={styles.emptyText}>No court booking data found for this session.</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Session header */}
        <View style={styles.sessionHeader}>
          <Text style={styles.sessionDate}>{sessionData.sessionDate}</Text>
          <Text style={styles.sessionTime}>{sessionData.sessionTime}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryChip}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.dark.successNeon} />
              <Text style={[styles.summaryChipText, { color: Colors.dark.successNeon }]}>
                {sessionData.confirmedCount} confirmed
              </Text>
            </View>
            <View style={styles.summaryChip}>
              <Ionicons name="time-outline" size={14} color={Colors.dark.accentWarning} />
              <Text style={[styles.summaryChipText, { color: Colors.dark.accentWarning }]}>
                {sessionData.pendingCount} pending
              </Text>
            </View>
            <View style={styles.summaryChip}>
              <Ionicons name="people-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.summaryChipText}>{sessionData.totalEnrolled} enrolled</Text>
            </View>
          </View>
        </View>

        {/* Player cards */}
        {sessionData.players.map((player) => {
          const cfg = STATUS_CONFIG[player.status];
          return (
            <View key={player.playerId} style={styles.playerCard}>
              <View style={styles.playerRow}>
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerInitial}>
                    {player.playerName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>{player.playerName}</Text>
                  <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>

              {player.screenshotUrl ? (
                <Pressable
                  onPress={() => setLightboxUri(player.screenshotUrl!)}
                  style={styles.thumbnailWrapper}
                >
                  <Image
                    source={{ uri: player.screenshotUrl }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                  <View style={styles.thumbnailOverlay}>
                    <Ionicons name="expand-outline" size={18} color="#fff" />
                  </View>
                </Pressable>
              ) : null}

              {player.rejectionNote ? (
                <View style={styles.rejectionNote}>
                  <Text style={styles.rejectionNoteText}>{player.rejectionNote}</Text>
                </View>
              ) : null}

              {player.id && player.status === "pending" ? (
                <ActionButtons
                  confirmationId={player.id}
                  seriesId={seriesId}
                  sessionId={sessionId}
                />
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {/* Screenshot lightbox */}
      <Modal
        visible={!!lightboxUri}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUri(null)}
      >
        <Pressable style={styles.lightboxBackdrop} onPress={() => setLightboxUri(null)}>
          {lightboxUri ? (
            <Image
              source={{ uri: lightboxUri }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          ) : null}
          <Pressable style={styles.lightboxClose} onPress={() => setLightboxUri(null)}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  content: { padding: Spacing.md, gap: 12 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: Spacing.xl,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  sessionHeader: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 6,
    marginBottom: 4,
  },
  sessionDate: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  sessionTime: { fontSize: 13, color: Colors.dark.textMuted },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  summaryChipText: { fontSize: 12, fontWeight: "600", color: Colors.dark.textMuted },
  playerCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    gap: 8,
  },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  playerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  playerInitial: { fontSize: 16, fontWeight: "700", color: Colors.dark.primary },
  playerName: { fontSize: 15, fontWeight: "600", color: Colors.dark.text },
  statusText: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  thumbnailWrapper: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    position: "relative",
  },
  thumbnail: { width: "100%", height: 140, backgroundColor: "rgba(0,0,0,0.2)" },
  thumbnailOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 8,
    padding: 4,
  },
  rejectionNote: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
    padding: 10,
  },
  rejectionNoteText: { fontSize: 13, color: Colors.dark.error, lineHeight: 18 },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  lightboxImage: { width: "95%", height: "80%" },
  lightboxClose: {
    position: "absolute",
    top: 50,
    right: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    padding: 8,
  },
});
