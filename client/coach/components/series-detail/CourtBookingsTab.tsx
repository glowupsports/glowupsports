import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors } from "@/constants/theme";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import { apiRequest } from "@/lib/query-client";

type ConfirmationStatus = "confirmed" | "pending" | "rejected" | "no_submission";

interface PlayerRow {
  id: string | null;
  sessionId: string;
  playerId: string;
  playerName: string;
  status: ConfirmationStatus;
  screenshotUrl?: string | null;
  screenshotKey?: string | null;
  confirmedAt?: string | null;
  rejectionNote?: string | null;
  createdAt?: string | null;
}

interface SessionWithPlayers {
  sessionId: string;
  sessionDate: string;
  sessionTime: string;
  players: PlayerRow[];
  totalEnrolled: number;
  confirmedCount: number;
  pendingCount: number;
}

interface CourtBookingsTabProps {
  seriesId: string;
  courtLocation: string | null;
}

const STATUS_CFG: Record<ConfirmationStatus, { color: string; label: string }> = {
  confirmed: { color: Colors.dark.successNeon, label: "Confirmed" },
  pending: { color: Colors.dark.accentWarning, label: "Pending Review" },
  rejected: { color: Colors.dark.error, label: "Rejected" },
  no_submission: { color: Colors.dark.textMuted, label: "Not Submitted" },
};

function StatusBadge({ status }: { status: ConfirmationStatus }) {
  const { color, label } = STATUS_CFG[status] ?? STATUS_CFG.no_submission;
  return (
    <View style={[badge.wrap, { backgroundColor: color + "18", borderColor: color + "40" }]}>
      <Text style={[badge.txt, { color }]}>{label}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  txt: { fontSize: 11, fontWeight: "600" },
});

interface RejectModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
  isPending: boolean;
}

function RejectModal({ visible, onClose, onConfirm, isPending }: RejectModalProps) {
  const [note, setNote] = useState("");

  const handleConfirm = () => {
    onConfirm(note.trim());
    setNote("");
  };

  const handleClose = () => {
    setNote("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={rm.backdrop} onPress={handleClose}>
        <Pressable style={rm.sheet} onPress={() => {}}>
          <Text style={rm.title}>Reject Submission</Text>
          <Text style={rm.subtitle}>Optionally leave a note for the player explaining what to fix.</Text>
          <TextInput
            style={rm.input}
            placeholder="e.g. Screenshot is blurry, please re-upload"
            placeholderTextColor={Colors.dark.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            maxLength={200}
          />
          <View style={rm.buttons}>
            <Pressable style={rm.cancelBtn} onPress={handleClose}>
              <Text style={rm.cancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[rm.rejectBtn, isPending && rm.disabled]}
              onPress={handleConfirm}
              disabled={isPending}
            >
              <Text style={rm.rejectTxt}>Reject</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const rm = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundCard,
    borderRadius: 14,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  title: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  subtitle: { fontSize: 13, color: Colors.dark.textMuted, lineHeight: 18 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 10,
    color: Colors.dark.text,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: "top",
  },
  buttons: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  cancelTxt: { fontSize: 14, color: Colors.dark.textMuted },
  rejectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
  },
  rejectTxt: { fontSize: 14, fontWeight: "600", color: Colors.dark.error },
  disabled: { opacity: 0.5 },
});

interface ActionButtonsProps {
  confirmationId: string | null;
  seriesId: string;
  status: ConfirmationStatus;
}

function ActionButtons({ confirmationId, seriesId, status }: ActionButtonsProps) {
  const queryClient = useQueryClient();
  const [showRejectModal, setShowRejectModal] = useState(false);

  const actionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
      rejectionNote,
    }: {
      id: string;
      action: "approve" | "reject";
      rejectionNote?: string;
    }) => {
      return apiRequest("PATCH", `/api/coach/court-booking-confirmations/${id}`, {
        action,
        rejectionNote,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/coach/series/${seriesId}/court-booking-confirmations`],
      });
    },
    onError: (err: Error) => {
      Alert.alert("Action Failed", err.message || "Please try again.");
    },
  });

  if (!confirmationId || status === "confirmed" || status === "no_submission") {
    return null;
  }

  return (
    <>
      <View style={actionStyles.row}>
        <Pressable
          style={[
            actionStyles.btn,
            actionStyles.approveBtn,
            actionMutation.isPending && actionStyles.disabled,
          ]}
          onPress={() => actionMutation.mutate({ id: confirmationId, action: "approve" })}
          disabled={actionMutation.isPending}
        >
          <Ionicons name="checkmark" size={13} color="#000" />
          <Text style={actionStyles.approveTxt}>Approve</Text>
        </Pressable>
        <Pressable
          style={[
            actionStyles.btn,
            actionStyles.rejectBtn,
            actionMutation.isPending && actionStyles.disabled,
          ]}
          onPress={() => setShowRejectModal(true)}
          disabled={actionMutation.isPending}
        >
          <Ionicons name="close" size={13} color={Colors.dark.error} />
          <Text style={actionStyles.rejectTxt}>Reject</Text>
        </Pressable>
      </View>

      <RejectModal
        visible={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        isPending={actionMutation.isPending}
        onConfirm={(note: string) => {
          setShowRejectModal(false);
          actionMutation.mutate({
            id: confirmationId,
            action: "reject",
            rejectionNote: note || undefined,
          });
        }}
      />
    </>
  );
}

const actionStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6, marginTop: 4 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  approveBtn: {
    backgroundColor: Colors.dark.successNeon,
    borderColor: Colors.dark.successNeon,
  },
  rejectBtn: {
    backgroundColor: "rgba(239,68,68,0.10)",
    borderColor: "rgba(239,68,68,0.35)",
  },
  approveTxt: { fontSize: 12, fontWeight: "700", color: "#000" },
  rejectTxt: { fontSize: 12, fontWeight: "600", color: Colors.dark.error },
  disabled: { opacity: 0.5 },
});

export function CourtBookingsTab({ seriesId, courtLocation }: CourtBookingsTabProps) {
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const { data: sessionRows, isLoading } = useQuery<SessionWithPlayers[]>({
    queryKey: [`/api/coach/series/${seriesId}/court-booking-confirmations`],
  });

  if (!courtLocation) {
    return (
      <View style={tab.empty}>
        <Ionicons name="shield-outline" size={40} color={Colors.dark.textMuted} />
        <Text style={tab.emptyTitle}>Court Booking Not Configured</Text>
        <Text style={tab.emptySub}>
          Set a court location in the Overview tab to enable booking confirmation
          reminders and tracking for this class.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={tab.loading}>
        <TennisBallSpinner size="small" color={Colors.dark.successNeon} />
      </View>
    );
  }

  if (!sessionRows || sessionRows.length === 0) {
    return (
      <View style={tab.empty}>
        <Ionicons name="shield-checkmark-outline" size={40} color={Colors.dark.textMuted} />
        <Text style={tab.emptyTitle}>No Upcoming Sessions</Text>
        <Text style={tab.emptySub}>
          Court booking confirmations will appear here once sessions are scheduled
          and players are enrolled.
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={tab.root} showsVerticalScrollIndicator={false}>
        <View style={tab.courtHeader}>
          <Ionicons name="location-outline" size={16} color={Colors.dark.accentCyan} />
          <Text style={tab.courtLabel} numberOfLines={1}>
            {courtLocation}
          </Text>
        </View>

        {sessionRows.map((session) => {
          const isExpanded = expandedSessionId === session.sessionId;
          return (
            <View key={session.sessionId} style={tab.card}>
              <Pressable
                style={tab.cardHeader}
                onPress={() =>
                  setExpandedSessionId(isExpanded ? null : session.sessionId)
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={tab.sessionDate}>
                    {session.sessionDate} — {session.sessionTime}
                  </Text>
                  <View style={tab.statsRow}>
                    <View style={tab.chip}>
                      <Ionicons
                        name="checkmark-circle"
                        size={12}
                        color={Colors.dark.successNeon}
                      />
                      <Text style={[tab.chipTxt, { color: Colors.dark.successNeon }]}>
                        {session.confirmedCount} confirmed
                      </Text>
                    </View>
                    <View style={tab.chip}>
                      <Ionicons name="time-outline" size={12} color={Colors.dark.accentWarning} />
                      <Text style={[tab.chipTxt, { color: Colors.dark.accentWarning }]}>
                        {session.pendingCount} pending
                      </Text>
                    </View>
                    <Text style={tab.totalTxt}>/ {session.totalEnrolled} enrolled</Text>
                  </View>
                </View>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={Colors.dark.textMuted}
                />
              </Pressable>

              {isExpanded ? (
                <View style={tab.playerList}>
                  {session.players.length === 0 ? (
                    <Text style={tab.noPlayersTxt}>No players enrolled yet.</Text>
                  ) : (
                    session.players.map((player) => (
                      <View key={player.playerId} style={tab.playerRow}>
                        <View style={tab.playerLeft}>
                          <Ionicons
                            name="person-circle-outline"
                            size={20}
                            color={Colors.dark.textMuted}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={tab.playerName} numberOfLines={1}>
                              {player.playerName}
                            </Text>
                            {player.rejectionNote ? (
                              <Text style={tab.rejectionNote} numberOfLines={2}>
                                {player.rejectionNote}
                              </Text>
                            ) : null}
                            <ActionButtons
                              confirmationId={player.id}
                              seriesId={seriesId}
                              status={player.status}
                            />
                          </View>
                        </View>
                        <View style={tab.playerRight}>
                          {player.screenshotUrl ? (
                            <Pressable onPress={() => setLightboxUri(player.screenshotUrl!)}>
                              <Image
                                source={{ uri: player.screenshotUrl }}
                                style={tab.thumbnail}
                                resizeMode="cover"
                              />
                            </Pressable>
                          ) : null}
                          <StatusBadge status={player.status} />
                        </View>
                      </View>
                    ))
                  )}
                </View>
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
        <Pressable style={lb.backdrop} onPress={() => setLightboxUri(null)}>
          <Image
            source={{ uri: lightboxUri ?? undefined }}
            style={lb.image}
            resizeMode="contain"
          />
          <Pressable style={lb.close} onPress={() => setLightboxUri(null)}>
            <Ionicons name="close-circle" size={32} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const tab = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: Colors.dark.text, textAlign: "center" },
  emptySub: { fontSize: 13, color: Colors.dark.textMuted, textAlign: "center", lineHeight: 20 },
  courtHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,229,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.2)",
  },
  courtLabel: { fontSize: 13, color: Colors.dark.accentCyan, fontWeight: "600", flex: 1 },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
    overflow: "hidden",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  sessionDate: { fontSize: 14, fontWeight: "600", color: Colors.dark.text, marginBottom: 4 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4 },
  chipTxt: { fontSize: 12 },
  totalTxt: { fontSize: 12, color: Colors.dark.textMuted },
  playerList: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    padding: 12,
    gap: 12,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  playerLeft: { flexDirection: "row", alignItems: "flex-start", gap: 6, flex: 1 },
  playerRight: { alignItems: "flex-end", gap: 6 },
  playerName: { fontSize: 14, color: Colors.dark.text },
  rejectionNote: { fontSize: 11, color: Colors.dark.error, marginTop: 2, lineHeight: 15 },
  noPlayersTxt: { fontSize: 12, color: Colors.dark.textMuted },
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
});

const lb = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: "90%", height: "80%" },
  close: { position: "absolute", top: 52, right: 20 },
});
