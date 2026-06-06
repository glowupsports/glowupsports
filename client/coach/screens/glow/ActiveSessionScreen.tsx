import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  TextInput,
  Modal,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest, buildPhotoUrl } from "@/lib/query-client";
import { useCoach } from "@/coach/context/CoachContext";
import { formatTimeInTimezone } from "@/lib/dateUtils";
import { AddPlayerToSessionModal } from "@/coach/components/calendar/AddPlayerToSessionModal";
import InSessionFeedbackDrawer from "@/coach/components/InSessionFeedbackDrawer";
import { useIntakeModal } from "@/coach/context/IntakeModalContext";

// ─── Types ───────────────────────────────────────────────────────────────────

type FullAttendanceStatus =
  | "present"
  | "late"
  | "no_show"
  | "holiday"
  | "sick"
  | "emergency"
  | "excused"
  | "unset";

interface AttendanceOption {
  key: FullAttendanceStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  apiStatus: "present" | "late" | "absent" | "holiday";
  apiAbsentReason?: string;
}

const ATTENDANCE_OPTIONS: AttendanceOption[] = [
  {
    key: "present",
    label: "Present",
    icon: "checkmark-circle",
    color: "#22C55E",
    apiStatus: "present",
  },
  {
    key: "late",
    label: "Late",
    icon: "time",
    color: "#F59E0B",
    apiStatus: "late",
  },
  {
    key: "no_show",
    label: "No Show",
    icon: "close-circle",
    color: "#EF4444",
    apiStatus: "absent",
    apiAbsentReason: "no_show",
  },
  {
    key: "holiday",
    label: "Holiday / Vacation",
    icon: "airplane",
    color: "#06B6D4",
    apiStatus: "holiday",
  },
  {
    key: "sick",
    label: "Sick / Medical",
    icon: "medkit",
    color: "#8B5CF6",
    apiStatus: "absent",
    apiAbsentReason: "illness",
  },
  {
    key: "emergency",
    label: "Emergency",
    icon: "warning",
    color: "#F97316",
    apiStatus: "absent",
    apiAbsentReason: "personal",
  },
  {
    key: "excused",
    label: "Excused (notified)",
    icon: "shield-checkmark",
    color: "#10B981",
    apiStatus: "absent",
    apiAbsentReason: "personal",
  },
];

interface SessionPlayer {
  id: string;
  name: string;
  ballLevel?: string | null;
  profilePhotoUrl?: string | null;
  attendanceStatus?: string | null;
  isGuest?: boolean;
  joinType?: string | null;
}

interface SessionDetail {
  id: string;
  title?: string | null;
  sessionType: string;
  status?: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  players?: SessionPlayer[];
  courtName?: string | null;
  locationName?: string | null;
  seriesId?: string | null;
}

interface AttendanceRecord {
  status: FullAttendanceStatus;
  note: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOptionForStatus(status: FullAttendanceStatus | undefined): AttendanceOption | undefined {
  if (!status || status === "unset") return undefined;
  return ATTENDANCE_OPTIONS.find((o) => o.key === status);
}

function inferFullStatus(
  attendanceStatus: string | null | undefined
): FullAttendanceStatus {
  if (!attendanceStatus) return "unset";
  switch (attendanceStatus) {
    case "present":
      return "present";
    case "late":
      return "late";
    case "holiday":
      return "holiday";
    case "absent":
      return "no_show";
    default:
      return "unset";
  }
}

function sessionTypeBadge(type: string): string {
  switch (type) {
    case "group":
      return "Group";
    case "semi_private":
      return "Semi-Private";
    case "private":
    case "private_adjusted":
      return "Private";
    case "physical":
      return "Physical";
    case "activity":
      return "Activity";
    default:
      return type;
  }
}

function sessionTypeBadgeColor(type: string): string {
  switch (type) {
    case "group":
      return Colors.dark.primary;
    case "semi_private":
      return Colors.dark.xpCyan;
    case "private":
    case "private_adjusted":
      return "#A78BFA";
    case "physical":
      return Colors.dark.orange;
    default:
      return Colors.dark.tabIconDefault;
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function LivePulseDot() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 700, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 700, easing: Easing.in(Easing.ease) }),
      ),
      -1,
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(scale.value, [1, 1.6], [1, 0.25]),
  }));
  return (
    <View style={{ width: 10, height: 10, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" }, animStyle]}
      />
    </View>
  );
}

function CircularCountdown({
  secondsRemaining,
  totalDuration,
  isOvertime,
  formatCountdown,
}: {
  secondsRemaining: number;
  totalDuration: number;
  isOvertime: boolean;
  formatCountdown: () => string;
}) {
  const SIZE = 148;
  const STROKE = 9;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const progress = totalDuration > 0 ? Math.max(0, Math.min(1, secondsRemaining / totalDuration)) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  // Color progression: green → amber at <10 min → red at <3 min / overtime
  const ringColor = (isOvertime || secondsRemaining <= 3 * 60)
    ? Colors.dark.error
    : secondsRemaining <= 10 * 60
    ? Colors.dark.orange
    : Colors.dark.primary;

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={ringColor}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <ThemedText
          style={{
            fontSize: 30,
            fontWeight: "800",
            color: ringColor,
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatCountdown()}
        </ThemedText>
        <ThemedText style={{ fontSize: 9, color: Colors.dark.tabIconDefault, letterSpacing: 1.2, marginTop: 2 }}>
          {isOvertime ? "OVERTIME" : "REMAINING"}
        </ThemedText>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ActiveSessionScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const { academy } = useCoach();
  const timezone = academy?.timezone || "Asia/Dubai";
  const { openIntake } = useIntakeModal();

  const { sessionId, sessionJson } = route.params || {};

  // Parse optional session seed data passed from caller
  const seedSession: SessionDetail | null = sessionJson
    ? (() => { try { return JSON.parse(sessionJson); } catch { return null; } })()
    : null;

  // Local state
  const [attendanceMap, setAttendanceMap] = useState<Map<string, AttendanceRecord>>(new Map());
  const [selectedPlayerForPicker, setSelectedPlayerForPicker] = useState<SessionPlayer | null>(null);
  const [showAttendancePicker, setShowAttendancePicker] = useState(false);
  const [pickerNote, setPickerNote] = useState("");
  const [pickerStatus, setPickerStatus] = useState<FullAttendanceStatus>("present");

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notePlayerId, setNotePlayerId] = useState<string | "session" | null>(null);

  const [showFeedbackDrawer, setShowFeedbackDrawer] = useState(false);
  const [feedbackPlayerId, setFeedbackPlayerId] = useState<string | null>(null);

  // Focused player — long-press a card to select; drives Feedback + Skill Clip
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const [showAddPlayer, setShowAddPlayer] = useState(false);

  // Add Guest state
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestMode, setGuestMode] = useState<"new" | "academy">("new");
  const [guestSearch, setGuestSearch] = useState("");
  const [academyPlayers, setAcademyPlayers] = useState<SessionPlayer[]>([]);
  const [academyPlayersLoaded, setAcademyPlayersLoaded] = useState(false);

  const [showOverflow, setShowOverflow] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Countdown timer
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Session data query ──
  const today = new Date().toISOString().split("T")[0];
  const { data: calendarSessions, refetch: refetchCalendar } = useQuery<SessionDetail[]>({
    queryKey: ["/api/coach/calendar", today, "day"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/coach/calendar?date=${today}&view=day`);
      const raw = await res.json();
      // calendar returns array of sessions
      return Array.isArray(raw) ? raw : raw.sessions || [];
    },
    refetchInterval: 30000,
  });

  const session: SessionDetail | null =
    (calendarSessions ?? []).find((s) => s.id === sessionId) ?? seedSession;

  const players = useMemo(() => session?.players || [], [session?.players]);

  // ── Init attendance from session data ──
  useEffect(() => {
    if (!session?.players) return;
    setAttendanceMap((prev) => {
      const next = new Map(prev);
      session.players!.forEach((p) => {
        if (!next.has(p.id)) {
          next.set(p.id, {
            status: inferFullStatus(p.attendanceStatus),
            note: "",
          });
        }
      });
      return next;
    });
  }, [session?.players]);

  // ── Countdown timer ──
  useEffect(() => {
    if (!session?.endTime) return;

    const tick = () => {
      const diff = Math.floor(
        (new Date(session.endTime).getTime() - Date.now()) / 1000
      );
      setSecondsRemaining(diff);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session?.endTime]);

  // ── Mutations ──

  const saveAttendanceMutation = useMutation({
    mutationFn: async ({
      playerId,
      option,
      note,
    }: {
      playerId: string;
      option: AttendanceOption;
      note: string;
    }) => {
      const payload: Record<string, unknown> = {
        attendance: [
          {
            playerId,
            status: option.apiStatus,
            ...(option.apiAbsentReason
              ? { absentReason: option.apiAbsentReason }
              : {}),
          },
        ],
        markCompleted: false,
      };
      await apiRequest(
        "POST",
        `/api/coach/sessions/${sessionId}/attendance`,
        payload
      );

      // Save note as in-session feedback if provided
      if (note.trim()) {
        await apiRequest(
          "POST",
          `/api/coach/sessions/${sessionId}/in-session-feedback`,
          {
            playerId,
            feedbackType: "note",
            message: note.trim(),
            visibility: "private",
          }
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).startsWith("/api/coach/calendar"),
      });
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: async ({
      playerId,
      note,
    }: {
      playerId: string | "session" | null;
      note: string;
    }) => {
      const trimmed = note.trim();
      // Session-wide: fan-out one note per enrolled player (backend requires playerId)
      if (!playerId || playerId === "session") {
        const enrolled = players.filter((p) => p.id);
        if (enrolled.length === 0) return;
        await Promise.all(
          enrolled.map((p) =>
            apiRequest(
              "POST",
              `/api/coach/sessions/${sessionId}/in-session-feedback`,
              { feedbackType: "note", message: trimmed, visibility: "private", playerId: p.id }
            )
          )
        );
        return;
      }
      // Player-specific note
      return apiRequest(
        "POST",
        `/api/coach/sessions/${sessionId}/in-session-feedback`,
        { feedbackType: "note", message: trimmed, visibility: "private", playerId }
      );
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Failed to save note. Please try again.");
    },
  });

  const addGuestMutation = useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Guest name is required");
      const createRes = await apiRequest("POST", "/api/players", {
        name: `${trimmed} (Guest)`,
        membershipType: "guest",
      });
      const guest = await createRes.json();
      await apiRequest("POST", `/api/coach/sessions/${sessionId}/players`, {
        playerId: guest.id,
        isGuest: true,
      });
      return guest;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).startsWith("/api/coach/calendar"),
      });
      refetchCalendar();
      setGuestName("");
      setShowAddGuest(false);
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message || "Failed to add guest");
    },
  });

  const addExistingAsGuestMutation = useMutation({
    mutationFn: async (playerId: string) => {
      await apiRequest("POST", `/api/coach/sessions/${sessionId}/players`, {
        playerId,
        isGuest: true,
        skipCreditCheck: true,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).startsWith("/api/coach/calendar"),
      });
      refetchCalendar();
      setGuestSearch("");
      setShowAddGuest(false);
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message || "Failed to add guest");
    },
  });

  // Load academy players for guest search
  const handleOpenGuestModal = useCallback(async () => {
    setGuestMode("new");
    setGuestName("");
    setGuestSearch("");
    setShowAddGuest(true);
    if (!academyPlayersLoaded) {
      try {
        const res = await apiRequest("GET", "/api/players?limit=200");
        const data = await res.json();
        setAcademyPlayers(
          (Array.isArray(data) ? data : data.players || []).filter(
            (p: SessionPlayer) => !p.name?.includes("(Guest)")
          )
        );
        setAcademyPlayersLoaded(true);
      } catch {
        // silently ignore
      }
    }
  }, [academyPlayersLoaded]);

  const extendSessionMutation = useMutation({
    mutationFn: async (minutes: number) => {
      if (!session) throw new Error("No session");
      const newEnd = new Date(
        new Date(session.endTime).getTime() + minutes * 60000
      ).toISOString();
      return apiRequest("PATCH", `/api/coach/sessions/${sessionId}`, {
        endTime: newEnd,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).startsWith("/api/coach/calendar"),
      });
      refetchCalendar();
      setShowExtendModal(false);
      setShowOverflow(false);
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message || "Failed to extend session");
    },
  });

  const cancelSessionMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await apiRequest(
        "POST",
        `/api/coach/sessions/${sessionId}/cancel`,
        { reason: reason.trim() || "Cancelled by coach" }
      );
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).startsWith("/api/coach/calendar"),
      });
      setShowCancelConfirm(false);
      setShowOverflow(false);
      navigation.navigate("CoachHQ");
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message || "Failed to cancel session");
    },
  });

  // ── Handlers ──

  const handlePlayerCardPress = useCallback((player: SessionPlayer) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const existing = attendanceMap.get(player.id);
    setPickerStatus(existing?.status || "present");
    setPickerNote(existing?.note || "");
    setSelectedPlayerForPicker(player);
    setShowAttendancePicker(true);
  }, [attendanceMap]);

  const handlePlayerCardLongPress = useCallback((player: SessionPlayer) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedPlayerId((prev) => (prev === player.id ? null : player.id));
  }, []);

  const handlePickerConfirm = useCallback(() => {
    if (!selectedPlayerForPicker) return;
    const option = getOptionForStatus(pickerStatus);
    if (!option) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setAttendanceMap((prev) => {
      const next = new Map(prev);
      next.set(selectedPlayerForPicker.id, { status: pickerStatus, note: pickerNote });
      return next;
    });

    saveAttendanceMutation.mutate({
      playerId: selectedPlayerForPicker.id,
      option,
      note: pickerNote,
    });

    setShowAttendancePicker(false);
    setSelectedPlayerForPicker(null);
    setPickerNote("");
  }, [selectedPlayerForPicker, pickerStatus, pickerNote, saveAttendanceMutation]);

  const handleSaveNote = useCallback(() => {
    if (!noteText.trim()) return;
    saveNoteMutation.mutate({ playerId: notePlayerId, note: noteText });
    setNoteText("");
    setShowNoteModal(false);
    setNotePlayerId(null);
  }, [noteText, notePlayerId, saveNoteMutation]);

  const handleEndSession = useCallback(() => {
    setShowOverflow(false);
    if (!session) {
      navigation.navigate("CoachHQ");
      return;
    }
    const cardType: "private" | "semi_private" | "group" =
      session.sessionType === "private" || session.sessionType === "private_adjusted"
        ? "private"
        : session.sessionType === "semi_private"
        ? "semi_private"
        : "group";

    const intakePlayers = players.map((p) => {
      const rec = attendanceMap.get(p.id);
      const option = rec ? getOptionForStatus(rec.status) : undefined;
      return {
        id: p.id,
        name: p.name,
        ballLevel: p.ballLevel ?? null,
        attendanceStatus: option?.apiStatus ?? "present",
      };
    });

    openIntake(
      {
        sessionId,
        startTime: session.startTime,
        sessionType: session.sessionType,
        players: intakePlayers,
        playerCount: intakePlayers.length,
        needsGroupDynamics: cardType !== "private",
        cardType,
      },
      {
        onComplete: () => {
          queryClient.invalidateQueries({
            predicate: (q) =>
              typeof q.queryKey[0] === "string" &&
              (q.queryKey[0] as string).startsWith("/api/coach/calendar"),
          });
          navigation.navigate("CoachHQ");
        },
        onSaveOnly: () => {
          queryClient.invalidateQueries({
            predicate: (q) =>
              typeof q.queryKey[0] === "string" &&
              (q.queryKey[0] as string).startsWith("/api/coach/calendar"),
          });
          navigation.navigate("CoachHQ");
        },
        onDismiss: () => {
          queryClient.invalidateQueries({
            predicate: (q) =>
              typeof q.queryKey[0] === "string" &&
              (q.queryKey[0] as string).startsWith("/api/coach/calendar"),
          });
          navigation.navigate("CoachHQ");
        },
      }
    );
  }, [navigation, sessionId, session, players, attendanceMap, openIntake, queryClient]);

  // ── Format helpers ──

  const formatCountdown = () => {
    if (secondsRemaining <= 0) {
      const over = Math.abs(secondsRemaining);
      const m = Math.floor(over / 60);
      const s = over % 60;
      return `-${m}:${String(s).padStart(2, "0")}`;
    }
    const m = Math.floor(secondsRemaining / 60);
    const s = secondsRemaining % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const isOvertime = secondsRemaining < 0;

  const totalDuration = useMemo(() => {
    if (!session?.startTime || !session?.endTime) return 0;
    return Math.floor(
      (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000
    );
  }, [session?.startTime, session?.endTime]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const feedbackPlayers = players.map((p) => ({
    id: p.id,
    name: p.name,
    photoUrl: p.profilePhotoUrl,
  }));

  const attendingCount = Array.from(attendanceMap.values()).filter(
    (r) => r.status === "present" || r.status === "late"
  ).length;

  return (
    <View style={styles.root}>
      {/* ── Premium Hero Header ── */}
      <LinearGradient
        colors={["#111827", Colors.dark.backgroundRoot]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.hero, { paddingTop: headerHeight + Spacing.xs }]}
      >
        {/* Top row: live pill + type badge + overflow */}
        <View style={styles.heroTopRow}>
          <View style={styles.heroTopLeft}>
            <View style={styles.livePill}>
              <LivePulseDot />
              <ThemedText style={styles.livePillText}>LIVE</ThemedText>
            </View>
            {session?.sessionType ? (
              <View
                style={[
                  styles.typeBadge,
                  { backgroundColor: sessionTypeBadgeColor(session.sessionType) + "22" },
                ]}
              >
                <ThemedText
                  style={[styles.typeBadgeText, { color: sessionTypeBadgeColor(session.sessionType) }]}
                >
                  {sessionTypeBadge(session.sessionType)}
                </ThemedText>
              </View>
            ) : null}
          </View>
          <Pressable style={styles.overflowButton} onPress={() => setShowOverflow(true)} hitSlop={10}>
            <Ionicons name="ellipsis-vertical" size={20} color={Colors.dark.text} />
          </Pressable>
        </View>

        {session?.title ? (
          <ThemedText style={styles.heroTitle} numberOfLines={2}>
            {session.title}
          </ThemedText>
        ) : null}

        {/* Time + location meta */}
        <View style={styles.heroMeta}>
          {session?.startTime && session?.endTime ? (
            <View style={styles.heroMetaItem}>
              <Ionicons name="time-outline" size={12} color={Colors.dark.tabIconDefault} />
              <ThemedText style={styles.heroMetaText}>
                {formatTimeInTimezone(session.startTime, timezone)} – {formatTimeInTimezone(session.endTime, timezone)}
              </ThemedText>
            </View>
          ) : null}
          {(session?.courtName || session?.locationName) ? (
            <View style={styles.heroMetaItem}>
              <Ionicons name="location-outline" size={12} color={Colors.dark.tabIconDefault} />
              <ThemedText style={styles.heroMetaText} numberOfLines={1}>
                {session.courtName || session.locationName}
              </ThemedText>
            </View>
          ) : null}
        </View>

        {/* Timer + stat pills */}
        <View style={styles.timerRow}>
          <CircularCountdown
            secondsRemaining={secondsRemaining}
            totalDuration={totalDuration}
            isOvertime={isOvertime}
            formatCountdown={formatCountdown}
          />
          <View style={styles.timerStats}>
            <View style={styles.timerStatCard}>
              <ThemedText style={styles.timerStatValue}>{players.length}</ThemedText>
              <ThemedText style={styles.timerStatLabel}>PLAYERS</ThemedText>
            </View>
            <View style={[styles.timerStatCard, styles.timerStatCardGreen]}>
              <ThemedText style={[styles.timerStatValue, styles.timerStatValueGreen]}>
                {attendingCount}
              </ThemedText>
              <ThemedText style={styles.timerStatLabel}>ATTENDING</ThemedText>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* ── Player Grid ── */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.playerGrid,
          { paddingBottom: insets.bottom + 160 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {players.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="people-outline"
              size={48}
              color={Colors.dark.tabIconDefault}
            />
            <ThemedText style={styles.emptyText}>
              No players in this session
            </ThemedText>
          </View>
        ) : (
          players.map((player) => {
            const record = attendanceMap.get(player.id);
            const status = record?.status || "unset";
            const option = getOptionForStatus(status);
            const photoUri = buildPhotoUrl(player.profilePhotoUrl);

            return (
              <Pressable
                key={player.id}
                style={({ pressed }) => [
                  styles.playerCard,
                  pressed && styles.playerCardPressed,
                  option && { borderLeftColor: option.color + "90" },
                  selectedPlayerId === player.id && styles.playerCardSelected,
                ]}
                onPress={() => handlePlayerCardPress(player)}
                onLongPress={() => handlePlayerCardLongPress(player)}
                delayLongPress={350}
              >
                {/* Avatar */}
                <View style={styles.avatarWrapper}>
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback, option && { backgroundColor: option.color + "20" }]}>
                      <ThemedText style={[styles.avatarInitial, option && { color: option.color }]}>
                        {player.name.charAt(0).toUpperCase()}
                      </ThemedText>
                    </View>
                  )}
                  <View style={[styles.statusDot, option ? { backgroundColor: option.color } : styles.statusDotUnset]} />
                </View>

                {/* Player info — full name + ball level */}
                <View style={styles.playerInfo}>
                  <View style={styles.playerNameRow}>
                    <ThemedText style={styles.playerName} numberOfLines={1}>
                      {player.name}
                    </ThemedText>
                    {player.isGuest ? (
                      <View style={styles.guestBadge}>
                        <ThemedText style={styles.guestBadgeText}>Guest</ThemedText>
                      </View>
                    ) : null}
                  </View>
                  {player.ballLevel ? (
                    <ThemedText style={styles.ballLevel} numberOfLines={1}>{player.ballLevel}</ThemedText>
                  ) : null}
                </View>

                {/* Attendance status chip */}
                <View
                  style={[
                    styles.statusChip,
                    option
                      ? { backgroundColor: option.color + "18", borderColor: option.color + "50" }
                      : styles.statusChipUnset,
                  ]}
                >
                  {option ? <Ionicons name={option.icon} size={11} color={option.color} /> : null}
                  <ThemedText
                    style={[styles.statusChipText, { color: option ? option.color : Colors.dark.tabIconDefault }]}
                    numberOfLines={1}
                  >
                    {option ? option.label.split(" /")[0] : "Set"}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* ── Quick Actions Bar ── */}
      <View
        style={[
          styles.quickActionsBar,
          { paddingBottom: insets.bottom + Spacing.sm },
        ]}
      >
        <QuickAction
          icon="create-outline"
          label="Note"
          onPress={() => {
            setNotePlayerId(null);
            setNoteText("");
            setShowNoteModal(true);
          }}
        />
        <QuickAction
          icon="chatbubble-ellipses-outline"
          label="Feedback"
          badge={selectedPlayerId ? players.find((p) => p.id === selectedPlayerId)?.name.split(" ")[0] : undefined}
          onPress={() => {
            setFeedbackPlayerId(selectedPlayerId);
            setShowFeedbackDrawer(true);
          }}
        />
        <QuickAction
          icon="videocam-outline"
          label="Skill Clip"
          badge={selectedPlayerId ? players.find((p) => p.id === selectedPlayerId)?.name.split(" ")[0] : undefined}
          onPress={() => {
            if (selectedPlayerId) {
              navigation.navigate("EvidenceCapture", { sessionId, playerId: selectedPlayerId });
            } else if (players.length === 1) {
              navigation.navigate("EvidenceCapture", { sessionId, playerId: players[0].id });
            } else {
              Alert.alert(
                "Select a Player",
                "Long-press a player card to select them, then tap Skill Clip.",
                [{ text: "OK" }]
              );
            }
          }}
        />
        <QuickAction
          icon="person-add-outline"
          label="Add Player"
          onPress={() => setShowAddPlayer(true)}
        />
        <QuickAction
          icon="people-outline"
          label="Add Guest"
          onPress={handleOpenGuestModal}
        />

        {/* End Session — prominent */}
        <Pressable
          style={styles.endSessionButton}
          onPress={handleEndSession}
        >
          <Ionicons
            name="stop-circle"
            size={18}
            color={Colors.dark.text}
          />
          <ThemedText style={styles.endSessionText}>End</ThemedText>
        </Pressable>
      </View>

      {/* ── Modals ── */}

      {/* Attendance Picker */}
      <Modal
        visible={showAttendancePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAttendancePicker(false)}
      >
        <View
          style={[
            styles.pickerContainer,
            { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl },
          ]}
        >
          <View style={styles.pickerHeader}>
            <Pressable
              onPress={() => setShowAttendancePicker(false)}
              style={styles.pickerClose}
              hitSlop={10}
            >
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <ThemedText style={styles.pickerTitle}>
              {selectedPlayerForPicker?.name.split(" ")[0] || "Attendance"}
            </ThemedText>
            <Pressable
              style={[
                styles.pickerSave,
                pickerStatus === "unset" && styles.pickerSaveDisabled,
              ]}
              onPress={handlePickerConfirm}
              disabled={pickerStatus === "unset"}
            >
              <ThemedText style={styles.pickerSaveText}>Save</ThemedText>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.pickerOptions}>
            {ATTENDANCE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[
                  styles.pickerOption,
                  pickerStatus === opt.key && {
                    backgroundColor: opt.color + "20",
                    borderColor: opt.color,
                  },
                ]}
                onPress={() => {
                  setPickerStatus(opt.key);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View
                  style={[
                    styles.pickerOptionIcon,
                    { backgroundColor: opt.color + "25" },
                  ]}
                >
                  <Ionicons name={opt.icon} size={22} color={opt.color} />
                </View>
                <ThemedText
                  style={[
                    styles.pickerOptionLabel,
                    pickerStatus === opt.key && { color: opt.color },
                  ]}
                >
                  {opt.label}
                </ThemedText>
                {pickerStatus === opt.key ? (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={opt.color}
                  />
                ) : null}
              </Pressable>
            ))}

            {/* Note field */}
            <View style={styles.pickerNoteSection}>
              <ThemedText style={styles.pickerNoteLabel}>
                Note (optional)
              </ThemedText>
              <TextInput
                style={styles.pickerNoteInput}
                value={pickerNote}
                onChangeText={setPickerNote}
                placeholder="Add a note about this player..."
                placeholderTextColor={Colors.dark.tabIconDefault}
                multiline
                maxLength={200}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Note Modal */}
      <Modal
        visible={showNoteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNoteModal(false)}
      >
        <View
          style={[
            styles.pickerContainer,
            { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl },
          ]}
        >
          <View style={styles.pickerHeader}>
            <Pressable onPress={() => setShowNoteModal(false)} style={styles.pickerClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <ThemedText style={styles.pickerTitle}>Add Note</ThemedText>
            <Pressable
              style={[styles.pickerSave, !noteText.trim() && styles.pickerSaveDisabled]}
              onPress={handleSaveNote}
              disabled={!noteText.trim() || saveNoteMutation.isPending}
            >
              <ThemedText style={styles.pickerSaveText}>Save</ThemedText>
            </Pressable>
          </View>

          {/* Player selector — "All" or pick specific player */}
          <View style={styles.noteScopeRow}>
            <Pressable
              style={[
                styles.noteScopeChip,
                (!notePlayerId || notePlayerId === "session") && styles.noteScopeChipActive,
              ]}
              onPress={() => setNotePlayerId("session")}
            >
              <ThemedText
                style={[
                  styles.noteScopeChipText,
                  (!notePlayerId || notePlayerId === "session") && styles.noteScopeChipTextActive,
                ]}
              >
                All Players
              </ThemedText>
            </Pressable>
            {players.map((p) => (
              <Pressable
                key={p.id}
                style={[
                  styles.noteScopeChip,
                  notePlayerId === p.id && styles.noteScopeChipActive,
                ]}
                onPress={() => setNotePlayerId(p.id)}
              >
                <ThemedText
                  style={[
                    styles.noteScopeChipText,
                    notePlayerId === p.id && styles.noteScopeChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {p.name.split(" ")[0]}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.noteInputFull}
            value={noteText}
            onChangeText={setNoteText}
            placeholder={
              !notePlayerId || notePlayerId === "session"
                ? "Write a session-wide note..."
                : `Note about ${players.find((p) => p.id === notePlayerId)?.name.split(" ")[0] || "player"}...`
            }
            placeholderTextColor={Colors.dark.tabIconDefault}
            multiline
            autoFocus
            maxLength={500}
          />
          <ThemedText style={styles.noteCharCount}>{noteText.length}/500</ThemedText>
        </View>
      </Modal>

      {/* Add Guest Modal */}
      <Modal
        visible={showAddGuest}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowAddGuest(false); setGuestName(""); setGuestSearch(""); }}
      >
        <View
          style={[
            styles.pickerContainer,
            { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl },
          ]}
        >
          <View style={styles.pickerHeader}>
            <Pressable
              onPress={() => { setShowAddGuest(false); setGuestName(""); setGuestSearch(""); }}
              style={styles.pickerClose}
              hitSlop={10}
            >
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <ThemedText style={styles.pickerTitle}>Add Guest</ThemedText>
            <View style={{ width: 60 }} />
          </View>

          {/* Mode tabs */}
          <View style={styles.guestTabRow}>
            <Pressable
              style={[styles.guestTab, guestMode === "new" && styles.guestTabActive]}
              onPress={() => setGuestMode("new")}
            >
              <Ionicons
                name="person-add-outline"
                size={14}
                color={guestMode === "new" ? Colors.dark.backgroundRoot : Colors.dark.textMuted}
              />
              <ThemedText
                style={[styles.guestTabText, guestMode === "new" && styles.guestTabTextActive]}
              >
                New Guest
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.guestTab, guestMode === "academy" && styles.guestTabActive]}
              onPress={() => setGuestMode("academy")}
            >
              <Ionicons
                name="people-outline"
                size={14}
                color={guestMode === "academy" ? Colors.dark.backgroundRoot : Colors.dark.textMuted}
              />
              <ThemedText
                style={[
                  styles.guestTabText,
                  guestMode === "academy" && styles.guestTabTextActive,
                ]}
              >
                From Academy
              </ThemedText>
            </Pressable>
          </View>

          {guestMode === "new" ? (
            <View style={styles.guestNewSection}>
              <TextInput
                style={styles.guestInput}
                value={guestName}
                onChangeText={setGuestName}
                placeholder="Guest name..."
                placeholderTextColor={Colors.dark.tabIconDefault}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (guestName.trim()) addGuestMutation.mutate(guestName);
                }}
              />
              <Pressable
                style={[
                  styles.guestAddBtn,
                  (!guestName.trim() || addGuestMutation.isPending) && styles.guestAddBtnDisabled,
                ]}
                onPress={() => {
                  if (guestName.trim()) addGuestMutation.mutate(guestName);
                }}
                disabled={!guestName.trim() || addGuestMutation.isPending}
              >
                <Ionicons name="arrow-forward" size={20} color={Colors.dark.backgroundRoot} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.guestAcademySection}>
              <TextInput
                style={[styles.guestInput, { flex: 0 }]}
                value={guestSearch}
                onChangeText={setGuestSearch}
                placeholder="Search player..."
                placeholderTextColor={Colors.dark.tabIconDefault}
                autoFocus
              />
              <ScrollView showsVerticalScrollIndicator={false}>
                {academyPlayers
                  .filter(
                    (p) =>
                      !players.some((sp) => sp.id === p.id) &&
                      p.name.toLowerCase().includes(guestSearch.toLowerCase())
                  )
                  .slice(0, 12)
                  .map((p) => (
                    <Pressable
                      key={p.id}
                      style={styles.guestPlayerItem}
                      onPress={() => addExistingAsGuestMutation.mutate(p.id)}
                      disabled={addExistingAsGuestMutation.isPending}
                    >
                      <View style={styles.guestPlayerAvatar}>
                        <ThemedText style={styles.guestPlayerInitial}>
                          {p.name.charAt(0).toUpperCase()}
                        </ThemedText>
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.guestPlayerName}>{p.name}</ThemedText>
                        {p.ballLevel ? (
                          <ThemedText style={styles.guestPlayerLevel}>{p.ballLevel}</ThemedText>
                        ) : null}
                      </View>
                      <Ionicons
                        name="add-circle-outline"
                        size={22}
                        color={Colors.dark.primary}
                      />
                    </Pressable>
                  ))}
                {academyPlayersLoaded &&
                  academyPlayers.filter(
                    (p) =>
                      !players.some((sp) => sp.id === p.id) &&
                      p.name.toLowerCase().includes(guestSearch.toLowerCase())
                  ).length === 0 ? (
                  <ThemedText style={styles.guestNoResults}>No players found</ThemedText>
                ) : null}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* Overflow Menu */}
      <Modal
        visible={showOverflow}
        animationType="fade"
        transparent
        onRequestClose={() => setShowOverflow(false)}
      >
        <Pressable
          style={styles.overflowOverlay}
          onPress={() => setShowOverflow(false)}
        >
          <View
            style={[
              styles.overflowMenu,
              { marginTop: headerHeight + Spacing.lg },
            ]}
          >
            <Pressable
              style={styles.overflowItem}
              onPress={() => {
                setShowOverflow(false);
                setShowExtendModal(true);
              }}
            >
              <Ionicons
                name="time-outline"
                size={20}
                color={Colors.dark.xpCyan}
              />
              <ThemedText
                style={[styles.overflowItemText, { color: Colors.dark.xpCyan }]}
              >
                Extend Session
              </ThemedText>
            </Pressable>
            <View style={styles.overflowDivider} />
            <Pressable
              style={styles.overflowItem}
              onPress={() => {
                setShowOverflow(false);
                setShowCancelConfirm(true);
              }}
            >
              <Ionicons
                name="close-circle-outline"
                size={20}
                color={Colors.dark.orange}
              />
              <ThemedText
                style={[styles.overflowItemText, { color: Colors.dark.orange }]}
              >
                Cancel Session
              </ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Extend Session Modal */}
      <Modal
        visible={showExtendModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowExtendModal(false)}
      >
        <Pressable
          style={styles.overflowOverlay}
          onPress={() => setShowExtendModal(false)}
        >
          <Pressable
            style={[styles.extendBox, { paddingBottom: insets.bottom + Spacing.lg }]}
            onPress={() => {}}
          >
            <ThemedText style={styles.extendTitle}>Extend Session</ThemedText>
            <ThemedText style={styles.extendSubtitle}>
              How many minutes?
            </ThemedText>
            <View style={styles.extendGrid}>
              {[15, 30, 45, 60].map((minutes) => (
                <Pressable
                  key={minutes}
                  style={styles.extendOption}
                  onPress={() => extendSessionMutation.mutate(minutes)}
                  disabled={extendSessionMutation.isPending}
                >
                  <ThemedText style={styles.extendOptionValue}>
                    +{minutes}
                  </ThemedText>
                  <ThemedText style={styles.extendOptionUnit}>min</ThemedText>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Cancel Confirm Modal */}
      <Modal
        visible={showCancelConfirm}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCancelConfirm(false)}
      >
        <Pressable
          style={styles.overflowOverlay}
          onPress={() => setShowCancelConfirm(false)}
        >
          <Pressable
            style={[styles.cancelBox, { paddingBottom: insets.bottom + Spacing.lg }]}
            onPress={() => {}}
          >
            <Ionicons
              name="warning-outline"
              size={40}
              color={Colors.dark.orange}
            />
            <ThemedText style={styles.cancelTitle}>Cancel Session?</ThemedText>
            <ThemedText style={styles.cancelSubtitle}>
              Players will not be charged. This cannot be undone.
            </ThemedText>
            <TextInput
              style={styles.cancelReasonInput}
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Reason for cancellation (optional)"
              placeholderTextColor={Colors.dark.tabIconDefault}
              multiline
            />
            <View style={styles.cancelActions}>
              <Pressable
                style={styles.cancelDismissBtn}
                onPress={() => setShowCancelConfirm(false)}
              >
                <ThemedText style={styles.cancelDismissText}>
                  Keep Session
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.cancelConfirmBtn,
                  cancelSessionMutation.isPending && { opacity: 0.6 },
                ]}
                onPress={() =>
                  cancelSessionMutation.mutate(cancelReason)
                }
                disabled={cancelSessionMutation.isPending}
              >
                <ThemedText style={styles.cancelConfirmText}>
                  Cancel Session
                </ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* In-Session Feedback Drawer */}
      <InSessionFeedbackDrawer
        visible={showFeedbackDrawer}
        sessionId={sessionId}
        players={feedbackPlayers}
        onClose={() => setShowFeedbackDrawer(false)}
        initialPlayerId={feedbackPlayerId}
      />

      {/* Add Player Modal */}
      <AddPlayerToSessionModal
        visible={showAddPlayer}
        session={
          session
            ? {
                id: session.id,
                startTime: session.startTime,
                endTime: session.endTime,
                sessionType: session.sessionType,
                seriesId: session.seriesId,
                title: session.title,
                players: players.map((p) => ({
                  id: p.id,
                  name: p.name,
                  status: "active",
                  attendanceStatus: p.attendanceStatus,
                })),
              }
            : null
        }
        academyTimezone={timezone}
        onClose={() => {
          setShowAddPlayer(false);
          refetchCalendar();
        }}
      />
    </View>
  );
}

// ─── QuickAction Component ────────────────────────────────────────────────────

function QuickAction({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.quickActionBtn, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <View style={{ position: "relative" }}>
        <Ionicons name={icon} size={22} color={Colors.dark.text} />
        {badge ? (
          <View style={styles.quickActionBadge}>
            <ThemedText style={styles.quickActionBadgeText} numberOfLines={1}>
              {badge}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText style={styles.quickActionLabel}>{label}</ThemedText>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  // Premium Hero Header
  hero: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  heroTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#22C55E18",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#22C55E40",
  },
  livePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#22C55E",
    letterSpacing: 1.2,
  },
  typeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  overflowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.sm,
  },
  heroMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  heroMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heroMetaText: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
  },
  // Timer row
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  timerStats: {
    flex: 1,
    gap: Spacing.sm,
  },
  timerStatCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  timerStatCardGreen: {
    borderColor: "#22C55E30",
    backgroundColor: "#22C55E08",
  },
  timerStatValue: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  timerStatValueGreen: {
    color: "#22C55E",
  },
  timerStatLabel: {
    fontSize: 9,
    color: Colors.dark.tabIconDefault,
    letterSpacing: 1.2,
    marginTop: 2,
    fontWeight: "600",
  },
  // Hero title
  heroTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  // Player list
  scrollArea: {
    flex: 1,
  },
  playerGrid: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.xs,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.md,
    paddingLeft: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderLeftWidth: 4,
    borderLeftColor: "rgba(255,255,255,0.10)",
    gap: Spacing.sm,
  },
  playerCardPressed: {
    opacity: 0.8,
  },
  playerCardSelected: {
    borderColor: Colors.dark.primary,
    borderWidth: 2,
    backgroundColor: Colors.dark.primary + "12",
  },
  avatarWrapper: {
    position: "relative",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statusDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundDefault,
  },
  statusDotUnset: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  playerInfo: {
    flex: 1,
    gap: 2,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flexWrap: "wrap",
  },
  playerName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    flexShrink: 1,
  },
  ballLevel: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minWidth: 54,
    justifyContent: "center",
  },
  statusChipUnset: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  guestBadge: {
    backgroundColor: Colors.dark.orange + "25",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
  },
  guestBadgeText: {
    fontSize: 10,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"] * 2,
    gap: Spacing.md,
    width: "100%",
  },
  emptyText: {
    fontSize: 15,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
  // Quick Actions Bar
  quickActionsBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
  },
  quickActionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    gap: 3,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  quickActionLabel: {
    fontSize: 10,
    color: Colors.dark.text,
    textAlign: "center",
  },
  quickActionBadge: {
    position: "absolute",
    top: -6,
    right: -10,
    backgroundColor: Colors.dark.primary,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: "center",
  },
  quickActionBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  endSessionButton: {
    flex: 1.3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.error,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.xs,
  },
  endSessionText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  // Attendance Picker
  pickerContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.lg,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  pickerClose: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    flex: 1,
    textAlign: "center",
  },
  pickerSave: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  pickerSaveDisabled: {
    opacity: 0.4,
  },
  pickerSaveText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  pickerOptions: {
    gap: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  pickerOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerOptionLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.dark.text,
    flex: 1,
  },
  pickerNoteSection: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  pickerNoteLabel: {
    fontSize: 13,
    color: Colors.dark.tabIconDefault,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pickerNoteInput: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  // Note Modal
  noteOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
    padding: Spacing.lg,
  },
  noteBox: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius["2xl"],
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  noteBoxTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  noteInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: "top",
  },
  noteActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  noteCancelBtn: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  noteCancelText: {
    fontSize: 15,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  noteSaveBtn: {
    flex: 1.5,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  noteSaveBtnDisabled: {
    opacity: 0.4,
  },
  noteSaveText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  // Overflow Menu
  overflowOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  overflowMenu: {
    position: "absolute",
    right: Spacing.lg,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    minWidth: 200,
  },
  overflowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  overflowItemText: {
    fontSize: 15,
    fontWeight: "500",
  },
  overflowDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  // Extend Modal
  extendBox: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: BorderRadius["2xl"],
    borderTopRightRadius: BorderRadius["2xl"],
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  extendTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  extendSubtitle: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    marginTop: -Spacing.sm,
  },
  extendGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  extendOption: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.lg,
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  extendOptionValue: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.xpCyan,
  },
  extendOptionUnit: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
  },
  // Cancel Modal
  cancelBox: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: BorderRadius["2xl"],
    borderTopRightRadius: BorderRadius["2xl"],
    padding: Spacing.lg,
    gap: Spacing.md,
    alignItems: "center",
  },
  cancelTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.error,
  },
  cancelSubtitle: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    lineHeight: 20,
  },
  cancelReasonInput: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
  },
  cancelActions: {
    flexDirection: "row",
    width: "100%",
    gap: Spacing.sm,
  },
  cancelDismissBtn: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  cancelDismissText: {
    fontSize: 15,
    color: Colors.dark.text,
  },
  cancelConfirmBtn: {
    flex: 1.4,
    backgroundColor: Colors.dark.error,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  cancelConfirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  // Note modal — player scope chips
  noteScopeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  noteScopeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  noteScopeChipActive: {
    backgroundColor: Colors.dark.primary + "25",
    borderColor: Colors.dark.primary,
  },
  noteScopeChipText: {
    fontSize: 13,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500",
  },
  noteScopeChipTextActive: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  noteInputFull: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 16,
    textAlignVertical: "top",
    marginHorizontal: Spacing.xs,
  },
  noteCharCount: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    textAlign: "right",
    marginRight: Spacing.xs,
    marginTop: 4,
  },
  // Guest modal
  guestTabRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  guestTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  guestTabActive: {
    backgroundColor: Colors.dark.text,
    borderColor: Colors.dark.text,
  },
  guestTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
  },
  guestTabTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  guestNewSection: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "center",
  },
  guestAcademySection: {
    flex: 1,
    gap: Spacing.sm,
  },
  guestInput: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  guestAddBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  guestAddBtnDisabled: {
    opacity: 0.4,
  },
  guestPlayerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  guestPlayerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary + "25",
    alignItems: "center",
    justifyContent: "center",
  },
  guestPlayerInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  guestPlayerName: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  guestPlayerLevel: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
  },
  guestNoResults: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    paddingVertical: Spacing.xl,
  },
});
