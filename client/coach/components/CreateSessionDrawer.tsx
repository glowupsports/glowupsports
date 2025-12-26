import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Typography, Spacing, BorderRadius } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface Player {
  id: string;
  name: string;
  email: string;
}

interface CreateSessionDrawerProps {
  visible: boolean;
  onClose: () => void;
  initialCourtId?: string;
  initialTime?: Date;
}

type SessionType = "private" | "semi" | "group" | "physical" | "cardio";
type RecurringType = "none" | "weekly" | "biweekly";

const SESSION_TYPES: { value: SessionType; label: string; color: string }[] = [
  { value: "private", label: "Private", color: Colors.dark.primary },
  { value: "semi", label: "Semi-Private", color: Colors.dark.xpCyan },
  { value: "group", label: "Group", color: Colors.dark.orange },
  { value: "physical", label: "Physical", color: Colors.dark.gold },
  { value: "cardio", label: "Cardio Tennis", color: Colors.dark.error },
];

const DURATIONS = [30, 45, 60, 90, 120];

export default function CreateSessionDrawer({
  visible,
  onClose,
  initialCourtId,
  initialTime,
}: CreateSessionDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach, refetchCalendar } = useCoach();

  const [sessionType, setSessionType] = useState<SessionType>("private");
  const [duration, setDuration] = useState(60);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [recurringType, setRecurringType] = useState<RecurringType>("none");
  const [recurringWeeks, setRecurringWeeks] = useState(4);
  const [notes, setNotes] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      if (initialCourtId) setSelectedCourtId(initialCourtId);
      if (initialTime) setStartTime(initialTime);
      setConflicts([]);
    }
  }, [visible, initialCourtId, initialTime]);

  const { data: courts = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/courts"],
    enabled: visible,
  });

  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    enabled: visible,
  });

  const createSessionMutation = useMutation({
    mutationFn: async (sessionData: any) => {
      return apiRequest("POST", "/api/coach/sessions", sessionData);
    },
    onSuccess: () => {
      refetchCalendar();
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      onClose();
      resetForm();
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to create session");
    },
  });

  const resetForm = () => {
    setSessionType("private");
    setDuration(60);
    setSelectedCourtId(null);
    setSelectedPlayers([]);
    setRecurringType("none");
    setRecurringWeeks(4);
    setNotes("");
    setConflicts([]);
  };

  const checkConflicts = async () => {
    if (!selectedCourtId || !coach?.id) return;

    setIsChecking(true);
    try {
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + duration);

      const baseUrl = getApiUrl();
      const params = new URLSearchParams({
        courtId: selectedCourtId,
        coachId: coach.id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });
      selectedPlayers.forEach(p => params.append("playerIds", p.id));

      const url = new URL(`/api/coach/sessions/check-conflict?${params.toString()}`, baseUrl);
      const response = await fetch(url.href, { credentials: "include" });

      if (!response.ok) {
        console.error("Conflict check failed:", response.statusText);
        return;
      }

      const data = await response.json();
      if (data.conflicts && data.conflicts.length > 0) {
        setConflicts(data.conflicts);
      } else {
        setConflicts([]);
      }
    } catch (error) {
      console.error("Conflict check failed:", error);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (visible && selectedCourtId && startTime) {
      const timer = setTimeout(checkConflicts, 500);
      return () => clearTimeout(timer);
    }
  }, [visible, selectedCourtId, startTime, duration, selectedPlayers]);

  const handleSubmit = () => {
    if (!selectedCourtId) {
      Alert.alert("Error", "Please select a court");
      return;
    }

    if (conflicts.length > 0) {
      Alert.alert("Conflict", "There are scheduling conflicts. Please resolve them first.");
      return;
    }

    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + duration);

    const isRecurring = recurringType !== "none";
    const weekCount = isRecurring ? recurringWeeks : 1;

    const sessionData = {
      coachId: coach?.id,
      courtId: selectedCourtId,
      startTime: startTime.toISOString(),
      duration,
      sessionType,
      status: "scheduled",
      notes,
      playerIds: selectedPlayers.map((p) => p.id),
      isRecurring,
      weekCount,
    };

    createSessionMutation.mutate(sessionData);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const adjustTime = (minutes: number) => {
    const newTime = new Date(startTime);
    newTime.setMinutes(newTime.getMinutes() + minutes);
    setStartTime(newTime);
  };

  const togglePlayer = (player: Player) => {
    setSelectedPlayers((prev) => {
      const exists = prev.find((p) => p.id === player.id);
      if (exists) {
        return prev.filter((p) => p.id !== player.id);
      }
      return [...prev, player];
    });
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
          style={StyleSheet.absoluteFill}
        />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>New Session</Text>
          <Pressable
            onPress={handleSubmit}
            disabled={createSessionMutation.isPending || conflicts.length > 0}
            style={[
              styles.submitButton,
              (createSessionMutation.isPending || conflicts.length > 0) && styles.submitDisabled,
            ]}
          >
            {createSessionMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.text} />
            ) : (
              <Text style={styles.submitText}>Book</Text>
            )}
          </Pressable>
        </View>

        <KeyboardAwareScrollViewCompat style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Time Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Time</Text>
            <View style={styles.timeSelector}>
              <Pressable
                onPress={() => adjustTime(-15)}
                style={styles.timeAdjust}
              >
                <Ionicons name="remove" size={20} color={Colors.dark.text} />
              </Pressable>
              <View style={styles.timeDisplay}>
                <Text style={styles.timeText}>{formatTime(startTime)}</Text>
                <Text style={styles.dateText}>
                  {startTime.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              </View>
              <Pressable
                onPress={() => adjustTime(15)}
                style={styles.timeAdjust}
              >
                <Ionicons name="add" size={20} color={Colors.dark.text} />
              </Pressable>
            </View>
          </View>

          {/* Duration Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Duration</Text>
            <View style={styles.optionsRow}>
              {DURATIONS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDuration(d)}
                  style={[
                    styles.optionChip,
                    duration === d && styles.optionChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      duration === d && styles.optionChipTextActive,
                    ]}
                  >
                    {d}m
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Session Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Type</Text>
            <View style={styles.optionsRow}>
              {SESSION_TYPES.map((type) => (
                <Pressable
                  key={type.value}
                  onPress={() => setSessionType(type.value)}
                  style={[
                    styles.typeChip,
                    sessionType === type.value && {
                      backgroundColor: type.color,
                      borderColor: type.color,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      sessionType === type.value && styles.typeChipTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Court Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Court</Text>
            <View style={styles.optionsRow}>
              {courts.map((court) => (
                <Pressable
                  key={court.id}
                  onPress={() => setSelectedCourtId(court.id)}
                  style={[
                    styles.courtChip,
                    selectedCourtId === court.id && styles.courtChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.courtChipText,
                      selectedCourtId === court.id && styles.courtChipTextActive,
                    ]}
                  >
                    {court.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Conflict Warning */}
          {isChecking ? (
            <View style={styles.conflictBox}>
              <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
              <Text style={styles.checkingText}>Checking availability...</Text>
            </View>
          ) : conflicts.length > 0 ? (
            <View style={[styles.conflictBox, styles.conflictError]}>
              <Ionicons name="warning" size={20} color={Colors.dark.error} />
              <View style={styles.conflictContent}>
                <Text style={styles.conflictTitle}>Scheduling Conflict</Text>
                {conflicts.map((conflict, index) => (
                  <Text key={index} style={styles.conflictText}>
                    {conflict}
                  </Text>
                ))}
              </View>
            </View>
          ) : selectedCourtId ? (
            <View style={[styles.conflictBox, styles.conflictOk]}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
              <Text style={styles.okText}>Time slot available</Text>
            </View>
          ) : null}

          {/* Player Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Players</Text>
            <View style={styles.playerList}>
              {players.map((player) => {
                const isSelected = selectedPlayers.some((p) => p.id === player.id);
                return (
                  <Pressable
                    key={player.id}
                    onPress={() => togglePlayer(player)}
                    style={[
                      styles.playerItem,
                      isSelected && styles.playerItemActive,
                    ]}
                  >
                    <Ionicons
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={20}
                      color={isSelected ? Colors.dark.primary : Colors.dark.disabled}
                    />
                    <Text style={styles.playerName}>{player.name}</Text>
                  </Pressable>
                );
              })}
              {players.length === 0 && (
                <Text style={styles.noPlayersText}>No players available</Text>
              )}
            </View>
          </View>

          {/* Recurring Options */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recurring</Text>
            <View style={styles.optionsRow}>
              <Pressable
                onPress={() => setRecurringType("none")}
                style={[
                  styles.optionChip,
                  recurringType === "none" && styles.optionChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    recurringType === "none" && styles.optionChipTextActive,
                  ]}
                >
                  One-time
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRecurringType("weekly")}
                style={[
                  styles.optionChip,
                  recurringType === "weekly" && styles.optionChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    recurringType === "weekly" && styles.optionChipTextActive,
                  ]}
                >
                  Weekly
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRecurringType("biweekly")}
                style={[
                  styles.optionChip,
                  recurringType === "biweekly" && styles.optionChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    recurringType === "biweekly" && styles.optionChipTextActive,
                  ]}
                >
                  Bi-weekly
                </Text>
              </Pressable>
            </View>
            {recurringType !== "none" && (
              <View style={styles.recurringWeeks}>
                <Text style={styles.recurringLabel}>For</Text>
                <View style={styles.weeksSelector}>
                  <Pressable
                    onPress={() => setRecurringWeeks(Math.max(1, recurringWeeks - 1))}
                    style={styles.weekAdjust}
                  >
                    <Ionicons name="remove" size={16} color={Colors.dark.text} />
                  </Pressable>
                  <Text style={styles.weeksText}>{recurringWeeks}</Text>
                  <Pressable
                    onPress={() => setRecurringWeeks(Math.min(52, recurringWeeks + 1))}
                    style={styles.weekAdjust}
                  >
                    <Ionicons name="add" size={16} color={Colors.dark.text} />
                  </Pressable>
                </View>
                <Text style={styles.recurringLabel}>weeks</Text>
              </View>
            )}
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add notes..."
              placeholderTextColor={Colors.dark.disabled}
              multiline
              numberOfLines={3}
            />
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  submitButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    minWidth: 80,
    alignItems: "center",
  },
  submitDisabled: {
    backgroundColor: Colors.dark.disabled,
  },
  submitText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.disabled,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  timeSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xl,
  },
  timeAdjust: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  timeDisplay: {
    alignItems: "center",
  },
  timeText: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  dateText: {
    ...Typography.body,
    color: Colors.dark.disabled,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  optionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundSecondary,
  },
  optionChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  optionChipText: {
    ...Typography.body,
    color: Colors.dark.disabled,
  },
  optionChipTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  typeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundSecondary,
  },
  typeChipText: {
    ...Typography.small,
    color: Colors.dark.disabled,
  },
  typeChipTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  courtChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  courtChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  courtChipText: {
    ...Typography.body,
    color: Colors.dark.disabled,
  },
  courtChipTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  conflictBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  conflictError: {
    backgroundColor: "rgba(255, 77, 77, 0.1)",
    borderWidth: 1,
    borderColor: Colors.dark.error,
  },
  conflictOk: {
    backgroundColor: "rgba(46, 204, 64, 0.1)",
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  conflictContent: {
    flex: 1,
  },
  conflictTitle: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  conflictText: {
    ...Typography.small,
    color: Colors.dark.error,
    marginTop: 2,
  },
  checkingText: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
  },
  okText: {
    ...Typography.body,
    color: Colors.dark.primary,
  },
  playerList: {
    gap: Spacing.sm,
  },
  playerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  playerItemActive: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  noPlayersText: {
    ...Typography.body,
    color: Colors.dark.disabled,
    fontStyle: "italic",
  },
  recurringWeeks: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  recurringLabel: {
    ...Typography.body,
    color: Colors.dark.disabled,
  },
  weeksSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.xs,
  },
  weekAdjust: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  weeksText: {
    ...Typography.body,
    color: Colors.dark.text,
    minWidth: 24,
    textAlign: "center",
  },
  notesInput: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
  },
});
