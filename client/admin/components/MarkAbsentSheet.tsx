import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import ReassignCoachModal from "./ReassignCoachModal";

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  sessionType?: string;
  status?: string;
  coachId?: string;
}

interface Coach {
  id: string;
  name: string;
  role?: string;
}

interface MarkAbsentSheetProps {
  visible: boolean;
  coachId: string | null;
  coachName: string;
  onClose: () => void;
}

export default function MarkAbsentSheet({
  visible,
  coachId: propCoachId,
  coachName: propCoachName,
  onClose,
}: MarkAbsentSheetProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(propCoachId);
  const [selectedCoachName, setSelectedCoachName] = useState<string>(propCoachName);
  const [reassignSessionId, setReassignSessionId] = useState<string | null>(null);
  const [reassignLabel, setReassignLabel] = useState<string>("");
  const [reassignBatchIds, setReassignBatchIds] = useState<string[]>([]);
  const [reassignedSessions, setReassignedSessions] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);

  const coachId = selectedCoachId;
  const coachName = selectedCoachName;

  // Fetch coaches for picker (only needed when no coachId pre-supplied)
  const { data: coachList = [] } = useQuery<Coach[]>({
    queryKey: ["/api/admin/coaches"],
    queryFn: () => apiRequest("GET", "/api/admin/coaches").then((r) => r.json()),
    enabled: visible && !propCoachId,
  });

  const markAbsentMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/coaches/${coachId}/mark-absent`).then((r) => r.json()),
    onSuccess: () => {
      setConfirmed(true);
      queryClient.invalidateQueries({ queryKey: [`/api/admin/coaches/${coachId}/sessions-today`] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    },
    onError: () => {
      Alert.alert("Error", "Failed to mark coach as unavailable. Please try again.");
    },
  });

  useEffect(() => {
    if (visible) {
      setSelectedCoachId(propCoachId);
      setSelectedCoachName(propCoachName);
    } else {
      setConfirmed(false);
      setSelectedCoachId(null);
      setSelectedCoachName("");
      setReassignSessionId(null);
      setReassignBatchIds([]);
      setReassignedSessions(new Set());
    }
  }, [visible, propCoachId, propCoachName]);

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: [`/api/admin/coaches/${coachId}/sessions-today`],
    queryFn: () =>
      apiRequest("GET", `/api/admin/coaches/${coachId}/sessions-today`).then((r) => r.json()),
    enabled: !!coachId && visible,
  });

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const unreassignedSessions = sessions.filter((s) => !reassignedSessions.has(s.id));

  const handleReassignSingle = (session: Session) => {
    setReassignLabel(`${session.sessionType || "Session"} at ${formatTime(session.startTime)}`);
    setReassignSessionId(session.id);
    setReassignBatchIds([session.id]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleReassignAll = () => {
    if (unreassignedSessions.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ids = unreassignedSessions.map((s) => s.id);
    setReassignLabel(`All ${ids.length} session${ids.length !== 1 ? "s" : ""} today`);
    setReassignSessionId(unreassignedSessions[0].id);
    setReassignBatchIds(ids);
  };

  const handleModalSuccess = (_newCoachId: string) => {
    setReassignedSessions((prev) => {
      const next = new Set(prev);
      reassignBatchIds.forEach((id) => next.add(id));
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
    const count = reassignBatchIds.length;
    if (count > 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "All Sessions Reassigned",
        `${count} sessions have been reassigned. Players and coaches have been notified.`,
        [{ text: "Done" }],
      );
    }
    setReassignSessionId(null);
    setReassignBatchIds([]);
  };

  const handleClose = () => {
    setReassignedSessions(new Set());
    setReassignSessionId(null);
    setReassignBatchIds([]);
    onClose();
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClose}
      >
        <View style={[styles.container, { paddingTop: insets.top + Spacing.md }]}>
          <LinearGradient
            colors={["rgba(239,68,68,0.1)", "transparent"]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.header}>
            <View style={styles.dragHandle} />
            <Pressable onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <View style={styles.titleSection}>
            <View style={styles.titleIcon}>
              <Ionicons name="person-remove" size={22} color={Colors.dark.error} />
            </View>
            <Text style={styles.title}>Mark Unavailable Today</Text>
            {coachName ? <Text style={styles.subtitle}>{coachName}</Text> : null}
            {coachId ? (
              <Text style={styles.notice}>
                The sessions below need to be reassigned. Players will be notified automatically.
              </Text>
            ) : null}
          </View>

          {/* Coach picker — shown only when no coachId was pre-supplied */}
          {!propCoachId && !selectedCoachId ? (
            <View style={styles.coachPickerSection}>
              <Text style={styles.coachPickerLabel}>Select a coach to mark unavailable:</Text>
              {coachList.length === 0 ? (
                <View style={styles.centered}>
                  <TennisBallSpinner size="small" color={Colors.dark.primary} />
                </View>
              ) : (
                <FlatList
                  data={coachList}
                  keyExtractor={(c) => c.id}
                  contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.lg }}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.coachPickerRow}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedCoachId(item.id);
                        setSelectedCoachName(item.name);
                      }}
                    >
                      <View style={styles.coachPickerAvatar}>
                        <Ionicons name="person-outline" size={18} color={Colors.dark.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.coachPickerName}>{item.name}</Text>
                        {item.role ? (
                          <Text style={styles.coachPickerRole}>{item.role.replace("_", " ")}</Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
                    </Pressable>
                  )}
                />
              )}
            </View>
          ) : null}

          {selectedCoachId && !confirmed ? (
            <View style={styles.confirmPhase}>
              <View style={styles.confirmWarningBox}>
                <Ionicons name="warning-outline" size={40} color={Colors.dark.error} />
                <Text style={styles.confirmTitle}>Mark Unavailable Today?</Text>
                <Text style={styles.confirmDescription}>
                  {coachName} will be flagged as absent. All of their sessions today will need reassignment and players will be notified automatically.
                </Text>
                {!isLoading && sessions.length > 0 ? (
                  <View style={styles.confirmSessionPill}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.dark.orange} />
                    <Text style={styles.confirmSessionPillText}>
                      {sessions.length} session{sessions.length !== 1 ? "s" : ""} affected today
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.confirmActions}>
                <Pressable style={styles.confirmCancelBtn} onPress={handleClose}>
                  <Text style={styles.confirmCancelText}>Keep Available</Text>
                </Pressable>
                <Pressable
                  style={[styles.confirmAbsentBtn, markAbsentMutation.isPending && { opacity: 0.6 }]}
                  onPress={() => markAbsentMutation.mutate()}
                  disabled={markAbsentMutation.isPending}
                >
                  {markAbsentMutation.isPending ? (
                    <TennisBallSpinner size="small" color="#fff" />
                  ) : (
                    <Ionicons name="person-remove-outline" size={16} color="#fff" />
                  )}
                  <Text style={styles.confirmAbsentText}>
                    {markAbsentMutation.isPending ? "Marking..." : "Confirm Absence"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : selectedCoachId && isLoading ? (
            <View style={styles.centered}>
              <TennisBallSpinner size="large" color={Colors.dark.error} />
              <Text style={styles.loadingText}>{"Loading today's sessions..."}</Text>
            </View>
          ) : selectedCoachId && sessions.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="calendar-outline" size={52} color={Colors.dark.textMuted} />
              <Text style={styles.emptyTitle}>No sessions today</Text>
              <Text style={styles.emptyText}>{coachName} has no sessions scheduled for today.</Text>
            </View>
          ) : selectedCoachId ? (
            <>
              <ScrollView
                style={styles.list}
                contentContainerStyle={[
                  styles.listContent,
                  { paddingBottom: insets.bottom + 120 },
                ]}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sectionLabel}>
                  {sessions.length} session{sessions.length !== 1 ? "s" : ""} today
                </Text>

                {sessions.map((session) => {
                  const isDone = reassignedSessions.has(session.id);
                  return (
                    <View
                      key={session.id}
                      style={[
                        styles.sessionRow,
                        CardStyles.elevated,
                        isDone && styles.sessionRowDone,
                      ]}
                    >
                      <View style={styles.sessionIcon}>
                        {isDone ? (
                          <Ionicons name="checkmark-circle" size={22} color={Colors.dark.successNeon} />
                        ) : (
                          <Ionicons name="time-outline" size={22} color={Colors.dark.orange} />
                        )}
                      </View>
                      <View style={styles.sessionInfo}>
                        <Text style={styles.sessionType}>
                          {session.sessionType || "Session"}
                        </Text>
                        <Text style={styles.sessionTime}>
                          {formatTime(session.startTime)} – {formatTime(session.endTime)}
                        </Text>
                        {isDone ? (
                          <Text style={styles.reassignedLabel}>Reassigned</Text>
                        ) : null}
                      </View>
                      {!isDone ? (
                        <Pressable
                          style={styles.reassignBtn}
                          onPress={() => handleReassignSingle(session)}
                        >
                          <Ionicons name="swap-horizontal-outline" size={16} color={Colors.dark.orange} />
                          <Text style={styles.reassignBtnText}>Reassign</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>

              <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
                {unreassignedSessions.length > 1 ? (
                  <Pressable style={styles.reassignAllBtn} onPress={handleReassignAll}>
                    <Ionicons name="people" size={18} color="#0B0D10" />
                    <Text style={styles.reassignAllBtnText}>
                      Reassign All ({unreassignedSessions.length} sessions)
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.doneBtn} onPress={handleClose}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </Modal>

      <ReassignCoachModal
        visible={reassignSessionId !== null}
        sessionId={reassignSessionId}
        sessionLabel={reassignLabel}
        batchSessionIds={reassignBatchIds}
        onClose={() => {
          setReassignSessionId(null);
          setReassignBatchIds([]);
        }}
        onSuccess={handleModalSuccess}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.border,
    borderRadius: 2,
    marginBottom: Spacing.sm,
  },
  closeBtn: {
    position: "absolute",
    right: Spacing.lg,
    top: 0,
    padding: 4,
  },
  titleSection: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  titleIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: `${Colors.dark.error}20`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${Colors.dark.error}40`,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  subtitle: {
    ...Typography.h3,
    color: Colors.dark.orange,
  },
  notice: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sessionRowDone: {
    opacity: 0.6,
    borderColor: Colors.dark.successNeon + "40",
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionInfo: {
    flex: 1,
    gap: 2,
  },
  sessionType: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  sessionTime: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  reassignedLabel: {
    ...Typography.small,
    color: Colors.dark.successNeon,
    fontWeight: "600",
  },
  reassignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: `${Colors.dark.orange}15`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.orange}30`,
  },
  reassignBtnText: {
    ...Typography.small,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
    gap: Spacing.sm,
  },
  reassignAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.orange,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  reassignAllBtnText: {
    ...Typography.body,
    color: "#0B0D10",
    fontWeight: "700",
  },
  doneBtn: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  doneBtnText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  confirmPhase: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.xl,
  },
  confirmWarningBox: {
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  confirmTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    textAlign: "center",
  },
  confirmDescription: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  confirmSessionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: `${Colors.dark.orange}15`,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${Colors.dark.orange}30`,
    marginTop: Spacing.sm,
  },
  confirmSessionPillText: {
    ...Typography.small,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  confirmActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  confirmCancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  confirmCancelText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  confirmAbsentBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.error,
  },
  confirmAbsentText: {
    ...Typography.body,
    color: "#fff",
    fontWeight: "700",
  },
  coachPickerSection: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  coachPickerLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: Spacing.md,
  },
  coachPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  coachPickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.dark.primary}18`,
    alignItems: "center",
    justifyContent: "center",
  },
  coachPickerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachPickerRole: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "capitalize",
  },
});
