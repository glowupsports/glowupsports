import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  FontSizes,
} from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type SessionType = "private" | "semi_private" | "group";

interface CalendarPlayer {
  id: string;
  name: string;
  status?: string | null;
  attendanceStatus?: string | null;
  isGuest?: boolean;
}

interface CalendarSession {
  id: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  status: string;
  seriesId?: string | null;
  maxPlayers?: number | null;
  players?: CalendarPlayer[];
}

interface CalendarResponse {
  ownSessions: CalendarSession[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  onCreateNewLesson: (date: Date, type: SessionType) => void;
}

const SESSION_TYPE_OPTIONS: {
  value: SessionType;
  label: string;
  color: string;
}[] = [
  { value: "group", label: "Group", color: Colors.dark.orange },
  { value: "private", label: "Private", color: Colors.dark.primary },
  { value: "semi_private", label: "Semi", color: Colors.dark.xpCyan },
];

function toDateOnlyString(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTimeHHMM(iso: string) {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatDateLabel(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function normalizeType(raw: string): SessionType | null {
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
  onCreateNewLesson,
}: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [date, setDate] = useState<Date>(new Date());
  const [type, setType] = useState<SessionType>("group");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDate(new Date());
      setType("group");
      setShowDatePicker(false);
      setBusySessionId(null);
    }
  }, [visible]);

  const dateStr = toDateOnlyString(date);

  const { data, isLoading, isFetching, isError, refetch } =
    useQuery<CalendarResponse>({
      queryKey: [`/api/coach/calendar`, dateStr, "day"],
      queryFn: async () => {
        const r = await apiRequest(
          "GET",
          `/api/coach/calendar?date=${dateStr}&view=day`,
        );
        return r.json();
      },
      enabled: visible,
      staleTime: 15_000,
    });

  const matchingSessions = useMemo(() => {
    const list = data?.ownSessions ?? [];
    return list
      .filter((s) => normalizeType(s.sessionType) === type)
      .filter((s) => s.status !== "cancelled" && s.status !== "deleted")
      .filter((s) => !(s.players ?? []).some((p) => p.id === playerId))
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
  }, [data, type, playerId]);

  const isPastDay = useMemo(() => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end.getTime() < Date.now();
  }, [date]);

  const addToSession = async (
    session: CalendarSession,
    skipCreditCheck: boolean,
  ) => {
    setBusySessionId(session.id);
    try {
      const res = await apiRequest(
        "POST",
        `/api/coach/sessions/${session.id}/players`,
        {
          playerId,
          isGuest: false,
          skipCreditCheck,
        },
      );
      const json = await res.json();

      if (json?.warning === "credit_mismatch") {
        setBusySessionId(null);
        const creditLabel = (json.requiredCreditType || type).replace(
          "_",
          "-",
        );
        Alert.alert(
          "No matching credits",
          `${playerName} has no ${creditLabel} credits. Add anyway? A debt will be recorded.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Add anyway",
              onPress: () => {
                addToSession(session, true);
              },
            },
          ],
        );
        return;
      }

      let attendanceFailed = false;
      const sessionStartMs = new Date(session.startTime).getTime();
      if (sessionStartMs < Date.now()) {
        try {
          await apiRequest(
            "PATCH",
            `/api/coach/players/${playerId}/sessions/${session.id}/attendance`,
            { newStatus: "present" },
          );
        } catch (e) {
          attendanceFailed = true;
          console.warn(
            "[ScheduleExtraLesson] Failed to mark attendance present",
            e,
          );
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({
        queryKey: [`/api/coach/players/${playerId}/attendance-history`],
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
        queryKey: [`/api/coach/calendar`],
      });

      const timeLabel = formatTimeHHMM(session.startTime);
      onClose();
      setTimeout(() => {
        if (attendanceFailed) {
          Alert.alert(
            "Added — but attendance not marked",
            `${playerName} was added to the ${timeLabel} session on ${formatDateLabel(date)}, but marking them present failed. Open the session to set attendance manually.`,
          );
        } else {
          Alert.alert(
            "Lesson added",
            `${playerName} added to the ${timeLabel} ${type === "semi_private" ? "semi" : type} session on ${formatDateLabel(date)}.`,
          );
        }
      }, 300);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Could not add player",
        err?.message || "Please try again.",
      );
      setBusySessionId(null);
    }
  };

  const handleDateChange = (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (event.type === "dismissed") return;
    if (picked) setDate(picked);
  };

  const handleCreateNew = () => {
    onClose();
    setTimeout(() => onCreateNewLesson(date, type), 200);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, Spacing.lg) },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Schedule Extra Lesson</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={22} color={Colors.dark.text} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Add {playerName} to a session on the chosen date.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Date</Text>
            <Pressable
              style={styles.datePill}
              onPress={() => setShowDatePicker((s) => !s)}
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={Colors.dark.text}
              />
              <Text style={styles.datePillText}>{formatDateLabel(date)}</Text>
              <Ionicons
                name="chevron-down"
                size={16}
                color={Colors.dark.tabIconDefault}
              />
            </Pressable>
            {showDatePicker && (
              <View style={styles.pickerWrap}>
                <DateTimePicker
                  value={date}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  onChange={handleDateChange}
                  themeVariant="dark"
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    style={styles.pickerDone}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Type</Text>
            <View style={styles.typeRow}>
              {SESSION_TYPE_OPTIONS.map((opt) => {
                const active = opt.value === type;
                return (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.typeChip,
                      active && {
                        backgroundColor: opt.color + "26",
                        borderColor: opt.color,
                      },
                    ]}
                    onPress={() => setType(opt.value)}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
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

          <View style={[styles.section, styles.sessionsSection]}>
            <Text style={styles.sectionLabel}>
              {isLoading || isFetching
                ? "Looking up sessions…"
                : isError
                  ? "Couldn't load sessions"
                  : matchingSessions.length > 0
                    ? `Sessions on ${formatDateLabel(date)}`
                    : "No matching sessions"}
            </Text>
            {isLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={Colors.dark.primary} />
              </View>
            ) : isError ? (
              <View style={styles.emptyBox}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={32}
                  color={Colors.dark.tabIconDefault}
                />
                <Text style={styles.emptyText}>
                  Couldn&apos;t load sessions for this date.
                </Text>
                <Pressable
                  style={styles.createNewButton}
                  onPress={() => refetch()}
                >
                  <Ionicons name="refresh" size={18} color="#000" />
                  <Text style={styles.createNewButtonText}>Try again</Text>
                </Pressable>
              </View>
            ) : matchingSessions.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons
                  name="calendar-outline"
                  size={32}
                  color={Colors.dark.tabIconDefault}
                />
                <Text style={styles.emptyText}>
                  No {type === "semi_private" ? "semi" : type} session on this
                  date.
                </Text>
                <Pressable
                  style={styles.createNewButton}
                  onPress={handleCreateNew}
                >
                  <Ionicons name="add" size={18} color="#000" />
                  <Text style={styles.createNewButtonText}>
                    Create new lesson
                  </Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView
                style={styles.sessionsList}
                contentContainerStyle={{ paddingBottom: Spacing.md }}
              >
                {matchingSessions.map((s) => {
                  const players = s.players ?? [];
                  const activeCount = players.filter(
                    (p) =>
                      p.status !== "left" && (p.attendanceStatus ?? null) !==
                      "absent",
                  ).length;
                  const max = s.maxPlayers ?? null;
                  const isFull = max != null && activeCount >= max;
                  const isBusy = busySessionId === s.id;
                  const disabled = isBusy || busySessionId !== null || isFull;
                  return (
                    <Pressable
                      key={s.id}
                      style={[
                        styles.sessionCard,
                        (isBusy || isFull) && { opacity: 0.5 },
                      ]}
                      disabled={disabled}
                      onPress={() => addToSession(s, false)}
                    >
                      <View style={styles.sessionTimeBox}>
                        <Text style={styles.sessionTimeText}>
                          {formatTimeHHMM(s.startTime)}
                        </Text>
                        <Text style={styles.sessionTimeSep}>–</Text>
                        <Text style={styles.sessionTimeText}>
                          {formatTimeHHMM(s.endTime)}
                        </Text>
                      </View>
                      <View style={styles.sessionInfo}>
                        <Text style={styles.sessionTypeLabel}>
                          {s.sessionType.replace("_", " ")}
                        </Text>
                        <Text style={styles.sessionPlayerCount}>
                          {activeCount}
                          {max ? ` / ${max}` : ""} players
                          {isFull ? " · Full" : ""}
                        </Text>
                      </View>
                      {isBusy ? (
                        <ActivityIndicator color={Colors.dark.primary} />
                      ) : isFull ? (
                        <Ionicons
                          name="lock-closed"
                          size={22}
                          color={Colors.dark.tabIconDefault}
                        />
                      ) : (
                        <Ionicons
                          name="add-circle"
                          size={26}
                          color={Colors.dark.primary}
                        />
                      )}
                    </Pressable>
                  );
                })}
                <Pressable
                  style={styles.createNewSecondary}
                  onPress={handleCreateNew}
                  disabled={busySessionId !== null}
                >
                  <Ionicons
                    name="add"
                    size={18}
                    color={Colors.dark.primary}
                  />
                  <Text style={styles.createNewSecondaryText}>
                    Or create a new lesson on this date
                  </Text>
                </Pressable>
              </ScrollView>
            )}
            {isPastDay && matchingSessions.length > 0 && (
              <Text style={styles.pastNote}>
                Past date — added players will be marked Present.
              </Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    maxHeight: "92%",
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.tabIconDefault,
    opacity: 0.5,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: Colors.dark.text,
    fontSize: FontSizes.xl,
    fontFamily: Typography.bold,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  subtitle: {
    color: Colors.dark.tabIconDefault,
    fontSize: FontSizes.sm,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  section: {
    marginBottom: Spacing.md,
  },
  sessionsSection: {
    flexShrink: 1,
  },
  sectionLabel: {
    color: Colors.dark.tabIconDefault,
    fontSize: FontSizes.xs,
    fontFamily: Typography.medium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.dark.tabIconDefault + "40",
  },
  datePillText: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    fontFamily: Typography.medium,
  },
  pickerWrap: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.lg,
    padding: Platform.OS === "ios" ? Spacing.sm : 0,
  },
  pickerDone: {
    alignSelf: "flex-end",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pickerDoneText: {
    color: Colors.dark.primary,
    fontSize: FontSizes.md,
    fontFamily: Typography.bold,
  },
  typeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  typeChip: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.tabIconDefault + "30",
    alignItems: "center",
  },
  typeChipText: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontFamily: Typography.medium,
  },
  sessionsList: {
    maxHeight: 320,
  },
  loadingBox: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },
  emptyBox: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  emptyText: {
    color: Colors.dark.tabIconDefault,
    fontSize: FontSizes.sm,
    textAlign: "center",
  },
  createNewButton: {
    marginTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.lg,
  },
  createNewButtonText: {
    color: "#000",
    fontSize: FontSizes.md,
    fontFamily: Typography.bold,
  },
  createNewSecondary: {
    marginTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "60",
  },
  createNewSecondaryText: {
    color: Colors.dark.primary,
    fontSize: FontSizes.sm,
    fontFamily: Typography.medium,
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.tabIconDefault + "20",
  },
  sessionTimeBox: {
    alignItems: "center",
    minWidth: 56,
  },
  sessionTimeText: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontFamily: Typography.bold,
  },
  sessionTimeSep: {
    color: Colors.dark.tabIconDefault,
    fontSize: FontSizes.xs,
    marginVertical: 1,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTypeLabel: {
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    fontFamily: Typography.medium,
    textTransform: "capitalize",
  },
  sessionPlayerCount: {
    color: Colors.dark.tabIconDefault,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  pastNote: {
    color: Colors.dark.tabIconDefault,
    fontSize: FontSizes.xs,
    fontStyle: "italic",
    marginTop: Spacing.sm,
    textAlign: "center",
  },
});

export default ScheduleExtraLessonModal;
