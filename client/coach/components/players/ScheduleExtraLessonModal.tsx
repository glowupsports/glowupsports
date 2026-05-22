import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { formatTimeInTimezone } from "@/lib/dateUtils";
import { apiRequest } from "@/lib/query-client";
import { WebCalendarPicker } from "@/components/WebCalendarPicker";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

type SessionTypeFilter = "private" | "semi_private" | "group";

interface CalendarSessionPlayer {
  id: string;
  name?: string | null;
  status?: string | null;
  attendanceStatus?: string | null;
  isGuest?: boolean;
}

interface CalendarSession {
  id: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  courtId?: string | null;
  courtName?: string | null;
  seriesId?: string | null;
  seriesName?: string | null;
  status?: string | null;
  maxPlayers?: number | null;
  players?: CalendarSessionPlayer[];
}

interface CalendarResponse {
  ownSessions?: CalendarSession[];
}

interface ScheduleExtraLessonModalProps {
  visible: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  coachId: string | null | undefined;
  /**
   * When true, the modal is being opened from an admin surface
   * (AdminInlinePlayerProfile). The coach `/api/coach/series/:id/players`
   * endpoint enforces `series.coachId === req.user.coachId` and will 403 for
   * admin/academy_owner users, so admins must take the session-level path
   * (`/api/coach/sessions/:id/players` is academy-scoped) and use the admin
   * attendance endpoint for past-date credit processing.
   */
  adminMode?: boolean;
  onCreateNewLesson: (date: Date, sessionType: SessionTypeFilter) => void;
}

const SESSION_TYPE_OPTIONS: {
  value: SessionTypeFilter;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { value: "group", label: "Group", icon: "people", color: Colors.dark.xpCyan },
  { value: "semi_private", label: "Semi", icon: "person-add", color: Colors.dark.gold },
  { value: "private", label: "Private", icon: "person", color: Colors.dark.primary },
];

function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTimeRange(startIso: string, endIso: string, timezone: string): string {
  return `${formatTimeInTimezone(startIso, timezone)} – ${formatTimeInTimezone(endIso, timezone)}`;
}

function prettySessionType(type: string): string {
  switch (type) {
    case "group":
      return "Group";
    case "semi_private":
      return "Semi-Private";
    case "private":
      return "Private";
    default:
      return type;
  }
}

function normalizeType(raw: string): SessionTypeFilter | null {
  const t = (raw || "").toLowerCase();
  if (t === "group") return "group";
  if (t === "private") return "private";
  if (t === "semi_private" || t === "semi") return "semi_private";
  return null;
}

export function ScheduleExtraLessonModal({
  visible,
  onClose,
  playerId,
  playerName,
  coachId,
  adminMode = false,
  onCreateNewLesson,
}: ScheduleExtraLessonModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { academy } = useCoach();
  const timezone = academy?.timezone || "Asia/Dubai";
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [sessionType, setSessionType] = useState<SessionTypeFilter>("group");
  // Multi-select: tracks which session IDs the coach has tapped (not yet confirmed)
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  // Per-row spinner: the session ID currently being submitted
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  // Confirm-all button loading state
  const [isConfirming, setIsConfirming] = useState(false);
  // Suppresses auto-close in onSuccess when running a batch
  const isBatchModeRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setSelectedDate(new Date());
      setSessionType("group");
      setSelectedSessionIds([]);
      setPendingSessionId(null);
      setIsConfirming(false);
      isBatchModeRef.current = false;
    }
  }, [visible]);

  // Clear selection when date or type changes so stale IDs don't carry over
  useEffect(() => {
    setSelectedSessionIds([]);
  }, [selectedDate, sessionType]);

  const dateParam = useMemo(() => formatDateLocal(selectedDate), [selectedDate]);

  const calendarQueryKey = useMemo(() => {
    const params = new URLSearchParams({ date: dateParam, view: "day" });
    if (coachId) params.set("coachId", coachId);
    return [`/api/coach/calendar?${params.toString()}`];
  }, [dateParam, coachId]);

  const { data: calendarData, isLoading: calendarLoading } = useQuery<CalendarResponse>({
    queryKey: calendarQueryKey,
    enabled: visible,
  });

  const sessionsForDay = useMemo(() => {
    const list = calendarData?.ownSessions ?? [];
    return list
      .filter((s) => normalizeType(s.sessionType) === sessionType)
      .filter((s) => s.status !== "cancelled" && s.status !== "deleted")
      .filter((s) => {
        const start = new Date(s.startTime);
        return isSameDay(start, selectedDate);
      })
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
  }, [calendarData, sessionType, selectedDate]);

  const isPastDay = useMemo(() => {
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);
    return end.getTime() < Date.now();
  }, [selectedDate]);

  const playerAlreadyInSession = (s: CalendarSession): boolean => {
    return (s.players ?? []).some((p) => p.id === playerId);
  };

  // Add-player path selection — picked so that, for past sessions, attendance
  // is backfilled through code paths that actually run credit processing
  // (markAttendance + ensureCreditProcessed), not just status updates.
  //
  //   COACH surface, past session in a series (primary path):
  //     POST /api/coach/series/:seriesId/players
  //          { playerId, attendedSessionIds:[sessionId] }
  //     Reuses the existing series add-with-backfill flow which calls
  //     storage.markAttendance + ensureCreditProcessed.
  //     Falls through to the per-session path below if the player is
  //     already in the series (series endpoint returns 400).
  //
  //   COACH surface, per-session path (future session, no series, or
  //   player already in series):
  //     POST /api/coach/sessions/:sessionId/players
  //     + POST /api/coach/sessions/:sessionId/attendance  (if past)
  //
  //   ADMIN surface (any case):
  //     POST /api/coach/sessions/:sessionId/players  (academy-scoped)
  //     + POST /api/admin/sessions/:sessionId/attendance  (if past)
  const addPlayerMutation = useMutation({
    mutationFn: async (input: {
      session: CalendarSession;
      skipCreditCheck?: boolean;
    }) => {
      const { session, skipCreditCheck = false } = input;
      const isPast = new Date(session.startTime).getTime() < Date.now();
      const useCoachSeriesBackfill =
        !adminMode && isPast && !!session.seriesId;

      if (useCoachSeriesBackfill && session.seriesId) {
        try {
          const seriesRes = await apiRequest(
            "POST",
            `/api/coach/series/${session.seriesId}/players`,
            {
              playerId,
              attendedSessionIds: [session.id],
              skipCreditCheck,
            },
          );
          const seriesPayload = (await seriesRes.json().catch(() => ({}))) as {
            warning?: string;
            message?: string;
            requiredCreditType?: string;
          };
          if (seriesPayload?.warning === "credit_mismatch" && !skipCreditCheck) {
            throw Object.assign(
              new Error(
                seriesPayload.message ||
                  `Player has no ${seriesPayload.requiredCreditType ?? sessionType.replace("_", "-")} credits available`,
              ),
              { creditMismatch: true, session },
            );
          }
          return seriesPayload;
        } catch (seriesErr: any) {
          // Credit errors and genuine server failures bubble up immediately
          if (seriesErr?.creditMismatch) throw seriesErr;
          // "Player already in this class" (400) → fall through to per-session
          // path so we can still add them to this specific session + mark present.
          if (!String(seriesErr?.message ?? "").includes("400")) throw seriesErr;
          // Fall through to per-session path below
        }
      }

      // Per-session path — used for future sessions, no-series sessions, admin
      // surface, and as fallback when the player is already enrolled in the series.
      const addRes = await apiRequest(
        "POST",
        `/api/coach/sessions/${session.id}/players`,
        { playerId, isGuest: false, skipCreditCheck },
      );
      const addPayload = (await addRes.json().catch(() => ({}))) as {
        warning?: string;
        message?: string;
        requiredCreditType?: string;
      };

      if (addPayload?.warning === "credit_mismatch" && !skipCreditCheck) {
        throw Object.assign(
          new Error(
            addPayload.message ||
              `Player has no ${addPayload.requiredCreditType ?? sessionType.replace("_", "-")} credits available`,
          ),
          { creditMismatch: true, session },
        );
      }

      // Mark attendance as present for any past session (coach AND admin).
      // Previously only adminMode did this — omitting it for coach surface meant
      // players were added but attendance_status stayed NULL, making the
      // "will be marked Present" note a lie.
      if (isPast) {
        const attendanceEndpoint = adminMode
          ? `/api/admin/sessions/${session.id}/attendance`
          : `/api/coach/sessions/${session.id}/attendance`;
        await apiRequest("POST", attendanceEndpoint, {
          attendance: [{ playerId, status: "present" }],
        });
      }

      return addPayload;
    },
    onMutate: ({ session }) => {
      setPendingSessionId(session.id);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).includes(`/coach/players/${playerId}/attendance-history`),
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/coach/players/${playerId}/attendance-summary`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/v2/credits/wallet/${playerId}`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/players/${playerId}/credit-balance`],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/players", playerId, "stats"],
      });
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      setPendingSessionId(null);
      // In batch mode handleConfirmAll manages close; single-tap closes immediately
      if (!isBatchModeRef.current) {
        onClose();
      }
    },
    onError: (err: Error & { creditMismatch?: boolean; session?: CalendarSession }) => {
      setPendingSessionId(null);
      // In batch mode, handleConfirmAll handles credit alerts and error reporting
      if (isBatchModeRef.current) return;
      if (err?.creditMismatch && err.session) {
        const creditLabel = sessionType.replace("_", "-");
        Alert.alert(
          "No matching credits",
          `${playerName} has no ${creditLabel} credits. Add anyway? A debt will be recorded.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Add anyway",
              onPress: () => {
                addPlayerMutation.mutate({
                  session: err.session as CalendarSession,
                  skipCreditCheck: true,
                });
              },
            },
          ],
        );
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Couldn't add player",
        err?.message || "Failed to schedule the extra lesson. Please try again.",
      );
    },
  });

  // Toggle selection of a session row (multi-select)
  const handleSelectSession = (session: CalendarSession) => {
    if (isConfirming || addPlayerMutation.isPending) return;
    if (playerAlreadyInSession(session)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.selectionAsync();
    setSelectedSessionIds((prev) =>
      prev.includes(session.id)
        ? prev.filter((id) => id !== session.id)
        : [...prev, session.id],
    );
  };

  // Confirm: add player to all selected sessions sequentially
  const handleConfirmAll = async () => {
    if (isConfirming || selectedSessionIds.length === 0) return;
    setIsConfirming(true);
    isBatchModeRef.current = true;

    const toAdd = selectedSessionIds
      .map((id) => sessionsForDay.find((s) => s.id === id))
      .filter((s): s is CalendarSession => !!s);

    for (const session of toAdd) {
      setPendingSessionId(session.id);
      try {
        await addPlayerMutation.mutateAsync({ session });
      } catch (err: any) {
        if (err?.creditMismatch) {
          // Ask per-session whether to add anyway
          const shouldAdd = await new Promise<boolean>((resolve) => {
            const creditLabel = sessionType.replace("_", "-");
            Alert.alert(
              "No matching credits",
              `${playerName} has no ${creditLabel} credits for the ${formatTimeRange(session.startTime, session.endTime, timezone)} session. Add anyway? A debt will be recorded.`,
              [
                { text: "Skip", style: "cancel", onPress: () => resolve(false) },
                { text: "Add anyway", onPress: () => resolve(true) },
              ],
            );
          });
          if (shouldAdd) {
            try {
              await addPlayerMutation.mutateAsync({ session, skipCreditCheck: true });
            } catch (_) {
              // Continue regardless
            }
          }
        }
        // Non-credit errors: continue with next session
      }
    }

    setPendingSessionId(null);
    isBatchModeRef.current = false;
    setIsConfirming(false);
    setSelectedSessionIds([]);
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        (q.queryKey[0] as string).includes("/api/coach/calendar"),
      refetchType: "all",
    });
    onClose();
  };

  const handleCreateNew = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCreateNewLesson(selectedDate, sessionType);
  };

  const selectionCount = selectedSessionIds.length;
  const isBusy = isConfirming || addPlayerMutation.isPending;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={modalStyles.root}>
        <LinearGradient
          colors={["rgba(0,224,255,0.12)", "transparent"]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 160 }}
        />
        <View
          style={[
            modalStyles.header,
            { paddingTop: insets.top > 0 ? Spacing.md : Spacing.lg },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={modalStyles.headerTitle}>Schedule Extra Lesson</Text>
            <Text style={modalStyles.headerSubtitle} numberOfLines={1}>
              {playerName}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={modalStyles.closeBtn}
          >
            <Ionicons name="close" size={22} color={Colors.dark.text} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl + (selectionCount > 0 ? 80 : 0),
            gap: Spacing.lg,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={modalStyles.card}>
            <Text style={modalStyles.cardLabel}>Date</Text>
            <WebCalendarPicker
              value={selectedDate}
              onChange={(d) => {
                Haptics.selectionAsync();
                setSelectedDate(d);
              }}
            />
          </View>

          <View style={modalStyles.card}>
            <Text style={modalStyles.cardLabel}>Session Type</Text>
            <View style={modalStyles.typeRow}>
              {SESSION_TYPE_OPTIONS.map((opt) => {
                const active = sessionType === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSessionType(opt.value);
                    }}
                    style={[
                      modalStyles.typeChip,
                      active && {
                        backgroundColor: `${opt.color}22`,
                        borderColor: opt.color,
                      },
                    ]}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={16}
                      color={active ? opt.color : Colors.dark.textMuted}
                    />
                    <Text
                      style={[
                        modalStyles.typeChipLabel,
                        active && { color: opt.color },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={modalStyles.card}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: Spacing.sm,
              }}
            >
              <Text style={modalStyles.cardLabel}>
                {prettySessionType(sessionType)} sessions on this day
              </Text>
              {calendarLoading ? (
                <TennisBallSpinner size="small" color={Colors.dark.xpCyan} />
              ) : null}
            </View>

            {!calendarLoading && sessionsForDay.length === 0 ? (
              <View style={modalStyles.emptyBlock}>
                <Ionicons
                  name="calendar-outline"
                  size={28}
                  color={Colors.dark.textMuted}
                />
                <Text style={modalStyles.emptyText}>
                  No {prettySessionType(sessionType).toLowerCase()} sessions on
                  this date.
                </Text>
              </View>
            ) : null}

            {sessionsForDay.map((session) => {
              const enrolled = playerAlreadyInSession(session);
              const isSelected = selectedSessionIds.includes(session.id);
              const playersCount = (session.players ?? []).filter(
                (p) => p.status !== "left",
              ).length;
              const isSubmitting =
                addPlayerMutation.isPending && pendingSessionId === session.id;
              return (
                <Pressable
                  key={session.id}
                  onPress={() => handleSelectSession(session)}
                  disabled={enrolled || isBusy}
                  style={({ pressed }) => [
                    modalStyles.sessionRow,
                    isSelected && modalStyles.sessionRowSelected,
                    pressed && !enrolled && { opacity: 0.7 },
                    enrolled && { opacity: 0.55 },
                  ]}
                >
                  <View style={modalStyles.sessionTimeBlock}>
                    <Ionicons
                      name="time-outline"
                      size={16}
                      color={Colors.dark.xpCyan}
                    />
                    <Text style={modalStyles.sessionTime}>
                      {formatTimeRange(session.startTime, session.endTime, timezone)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={modalStyles.sessionTitle} numberOfLines={1}>
                      {session.seriesName ||
                        prettySessionType(session.sessionType)}
                    </Text>
                    <Text style={modalStyles.sessionMeta} numberOfLines={1}>
                      {playersCount} players
                      {session.courtName ? ` · ${session.courtName}` : ""}
                    </Text>
                  </View>
                  {isSubmitting ? (
                    <TennisBallSpinner size="small" color={Colors.dark.xpCyan} />
                  ) : enrolled ? (
                    <View style={modalStyles.enrolledBadge}>
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={Colors.dark.successNeon}
                      />
                      <Text style={modalStyles.enrolledText}>Enrolled</Text>
                    </View>
                  ) : isSelected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={26}
                      color={Colors.dark.successNeon}
                    />
                  ) : (
                    <Ionicons
                      name="add-circle"
                      size={26}
                      color={Colors.dark.xpCyan}
                    />
                  )}
                </Pressable>
              );
            })}

            {sessionsForDay.length === 0 && !calendarLoading ? (
              <Pressable
                onPress={handleCreateNew}
                disabled={isBusy}
                style={({ pressed }) => [
                  modalStyles.createNewBtn,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={20}
                  color={Colors.dark.primary}
                />
                <Text style={modalStyles.createNewText}>
                  Create new lesson on this date
                </Text>
              </Pressable>
            ) : null}

            {isPastDay && sessionsForDay.length > 0 ? (
              <Text style={modalStyles.pastNote}>
                Past date — added players will be marked Present.
              </Text>
            ) : null}
          </View>
        </ScrollView>

        {/* Sticky confirm button — shown when ≥1 session is selected */}
        {selectionCount > 0 ? (
          <View
            style={[
              modalStyles.confirmBar,
              { paddingBottom: insets.bottom > 0 ? insets.bottom : Spacing.md },
            ]}
          >
            <Pressable
              onPress={handleConfirmAll}
              disabled={isConfirming}
              style={({ pressed }) => [
                modalStyles.confirmBtn,
                pressed && { opacity: 0.85 },
                isConfirming && { opacity: 0.7 },
              ]}
            >
              {isConfirming ? (
                <TennisBallSpinner size="small" color="#000" />
              ) : (
                <Ionicons name="checkmark-circle" size={20} color="#000" />
              )}
              <Text style={modalStyles.confirmBtnText}>
                {isConfirming
                  ? "Adding..."
                  : `Add to ${selectionCount} session${selectionCount > 1 ? "s" : ""}`}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 20,
    fontWeight: "700" as const,
  },
  headerSubtitle: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardLabel: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    fontWeight: "600" as const,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  typeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  typeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  typeChipLabel: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontWeight: "600" as const,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(0,224,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(0,224,255,0.12)",
    marginBottom: Spacing.xs,
  },
  sessionRowSelected: {
    backgroundColor: `${Colors.dark.successNeon}10`,
    borderColor: `${Colors.dark.successNeon}55`,
  },
  sessionTimeBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 110,
  },
  sessionTime: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "600" as const,
  },
  sessionTitle: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  sessionMeta: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  enrolledBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: `${Colors.dark.successNeon}15`,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: `${Colors.dark.successNeon}30`,
  },
  enrolledText: {
    color: Colors.dark.successNeon,
    fontSize: 11,
    fontWeight: "600" as const,
  },
  createNewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.primary}12`,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}40`,
    borderStyle: "dashed",
  },
  createNewText: {
    color: Colors.dark.primary,
    fontSize: 14,
    fontWeight: "700" as const,
  },
  emptyBlock: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  emptyText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    textAlign: "center",
  },
  pastNote: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    fontStyle: "italic",
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  confirmBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.dark.background,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.successNeon,
  },
  confirmBtnText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700" as const,
  },
});

export default ScheduleExtraLessonModal;
