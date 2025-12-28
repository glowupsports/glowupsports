import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

type AttendanceStatus = "present" | "late" | "absent" | "holiday";
type LateMinutes = 5 | 10 | 15 | 20 | 30 | 999;
type AbsentReason = "illness" | "injury" | "personal" | "weather" | "no_show" | "other";

interface Player {
  id: string;
  name: string;
  level: string;
  status?: AttendanceStatus;
  lateMinutes?: LateMinutes;
  absentReason?: AbsentReason;
}

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status: string | null;
  players?: Player[];
}

interface AttendanceRecord {
  playerId: string;
  status: AttendanceStatus;
  lateMinutes?: LateMinutes;
  absentReason?: AbsentReason;
}

interface AvailablePlayer {
  id: string;
  name: string;
  ballLevel?: string | null;
  skillLevel?: number | null;
}

interface AttendanceDrawerProps {
  visible: boolean;
  session: Session | null;
  onClose: () => void;
  onSave: () => void;
  onPlayersAdded?: () => void;
}

const OFFLINE_QUEUE_KEY = "coach_offline_attendance_queue";

export default function AttendanceDrawer({
  visible,
  session,
  onClose,
  onSave,
  onPlayersAdded,
}: AttendanceDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [attendance, setAttendance] = useState<Map<string, AttendanceRecord>>(new Map());
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [showAddPlayers, setShowAddPlayers] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: allPlayersData } = useQuery<AvailablePlayer[]>({
    queryKey: ["/api/players"],
    enabled: visible && showAddPlayers,
  });
  const allPlayers = Array.isArray(allPlayersData) ? allPlayersData : [];

  const existingPlayerIds = session?.players?.map(p => p.id) || [];
  const filteredPlayers = allPlayers.filter(p => 
    !existingPlayerIds.includes(p.id) &&
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addPlayersMutation = useMutation({
    mutationFn: async (playerIds: string[]) => {
      const promises = playerIds.map(playerId =>
        apiRequest("POST", `/api/coach/sessions/${session?.id}/players`, { playerId })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      setShowAddPlayers(false);
      setSelectedPlayerIds([]);
      setSearchQuery("");
      onPlayersAdded?.();
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to add players");
    },
  });

  useEffect(() => {
    if (session?.players) {
      const initial = new Map<string, AttendanceRecord>();
      session.players.forEach((player) => {
        initial.set(player.id, {
          playerId: player.id,
          status: player.status || "present",
          lateMinutes: player.lateMinutes,
          absentReason: player.absentReason,
        });
      });
      setAttendance(initial);
    }
  }, [session]);

  const saveMutation = useMutation({
    mutationFn: async (data: { sessionId: string; attendance: AttendanceRecord[] }) => {
      return apiRequest("POST", `/api/coach/sessions/${data.sessionId}/attendance`, {
        attendance: data.attendance,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      onSave();
      onClose();
    },
    onError: async (error: Error) => {
      const msg = error.message.toLowerCase();
      if (msg.includes("network") || msg.includes("offline") || msg.includes("failed")) {
        await saveToOfflineQueue();
      } else {
        Alert.alert("Error", error.message || "Failed to save attendance");
      }
    },
  });

  const saveToOfflineQueue = async () => {
    if (!session) return;
    try {
      const existing = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue: Array<{ sessionId: string; attendance: AttendanceRecord[]; timestamp: number }> = 
        existing ? JSON.parse(existing) : [];
      
      queue.push({
        sessionId: session.id,
        attendance: Array.from(attendance.values()),
        timestamp: Date.now(),
      });
      
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      setIsOffline(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "Saved Offline",
        "Attendance saved locally and will sync when connection is restored.",
        [{ text: "OK", onPress: onClose }]
      );
    } catch (e) {
      Alert.alert("Error", "Failed to save attendance offline");
    }
  };

  const setPlayerStatus = (playerId: string, status: AttendanceStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAttendance((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(playerId) || { playerId, status: "present" };
      updated.set(playerId, { ...existing, status });
      return updated;
    });
    if (status === "late" || status === "absent") {
      setExpandedPlayer(playerId);
    } else {
      setExpandedPlayer(null);
    }
  };

  const setLateMinutes = (playerId: string, minutes: LateMinutes) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAttendance((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(playerId) || { playerId, status: "late" };
      updated.set(playerId, { ...existing, lateMinutes: minutes });
      return updated;
    });
  };

  const setAbsentReason = (playerId: string, reason: AbsentReason) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAttendance((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(playerId) || { playerId, status: "absent" };
      updated.set(playerId, { ...existing, absentReason: reason });
      return updated;
    });
  };

  const handleSave = () => {
    if (!session) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    saveMutation.mutate({
      sessionId: session.id,
      attendance: Array.from(attendance.values()),
    });
  };

  const getStatusColor = (status: AttendanceStatus) => {
    switch (status) {
      case "present":
        return Colors.dark.primary;
      case "late":
        return Colors.dark.orange;
      case "absent":
        return Colors.dark.error;
      case "holiday":
        return Colors.dark.xpCyan;
      default:
        return Colors.dark.disabled;
    }
  };

  const getStatusIcon = (status: AttendanceStatus): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "present":
        return "checkmark-circle";
      case "late":
        return "time";
      case "absent":
        return "close-circle";
      case "holiday":
        return "airplane";
      default:
        return "help-circle";
    }
  };

  const lateOptions: { value: LateMinutes; label: string }[] = [
    { value: 5, label: "5 min" },
    { value: 10, label: "10 min" },
    { value: 15, label: "15 min" },
    { value: 20, label: "20 min" },
    { value: 30, label: "30 min" },
    { value: 999, label: ">30 min" },
  ];

  const absentReasons: { value: AbsentReason; label: string }[] = [
    { value: "illness", label: "Illness" },
    { value: "injury", label: "Injury" },
    { value: "personal", label: "Personal" },
    { value: "weather", label: "Weather" },
    { value: "no_show", label: "No Show" },
    { value: "other", label: "Other" },
  ];

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  if (!visible || !session) return null;

  const players = session.players || [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundDefault, Colors.dark.backgroundRoot]}
          style={StyleSheet.absoluteFill}
        />

        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerTitle}>
            <Text style={styles.title}>Attendance</Text>
            <Text style={styles.sessionInfo}>
              {formatTime(session.startTime)} - {formatTime(session.endTime)}
            </Text>
          </View>
          <Pressable
            style={[styles.saveButton, saveMutation.isPending && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </Pressable>
        </View>

        {/* Add Players Mode */}
        {showAddPlayers ? (
          <View style={styles.addPlayersContainer}>
            <View style={styles.addPlayersHeader}>
              <Pressable onPress={() => setShowAddPlayers(false)} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
              </Pressable>
              <Text style={styles.addPlayersTitle}>Add Players</Text>
              <Pressable
                style={[styles.confirmButton, selectedPlayerIds.length === 0 && styles.confirmButtonDisabled]}
                onPress={() => addPlayersMutation.mutate(selectedPlayerIds)}
                disabled={selectedPlayerIds.length === 0 || addPlayersMutation.isPending}
              >
                {addPlayersMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.confirmButtonText}>Add ({selectedPlayerIds.length})</Text>
                )}
              </Pressable>
            </View>
            
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={Colors.dark.disabled} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search players..."
                placeholderTextColor={Colors.dark.disabled}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 ? (
                <Pressable onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={20} color={Colors.dark.disabled} />
                </Pressable>
              ) : null}
            </View>

            <KeyboardAwareScrollViewCompat style={styles.playerSelectList} showsVerticalScrollIndicator={false}>
              {filteredPlayers.map((player) => {
                const isSelected = selectedPlayerIds.includes(player.id);
                return (
                  <Pressable
                    key={player.id}
                    style={[styles.playerSelectItem, isSelected && styles.playerSelectItemActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedPlayerIds(prev =>
                        isSelected ? prev.filter(id => id !== player.id) : [...prev, player.id]
                      );
                    }}
                  >
                    <View style={styles.playerSelectInfo}>
                      {player.ballLevel ? (
                        <View style={[styles.levelBadge, { backgroundColor: getLevelColor(player.ballLevel) }]}>
                          <Text style={styles.levelText}>{player.ballLevel}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.playerSelectName}>{player.name}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                      {isSelected ? (
                        <Ionicons name="checkmark" size={16} color="#FFF" />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {filteredPlayers.length === 0 ? (
                <View style={styles.noPlayersFound}>
                  <Text style={styles.noPlayersText}>No players found</Text>
                </View>
              ) : null}
            </KeyboardAwareScrollViewCompat>
          </View>
        ) : players.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={Colors.dark.disabled} />
            <Text style={styles.emptyText}>No players in this session</Text>
            <Text style={styles.emptySubtext}>Add players to track attendance</Text>
            <Pressable
              style={styles.addPlayersButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowAddPlayers(true);
              }}
            >
              <Ionicons name="person-add" size={20} color="#FFF" />
              <Text style={styles.addPlayersButtonText}>Add Players</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.playerList}>
            {players.map((player) => {
              const record = attendance.get(player.id);
              const status = record?.status || "present";
              const isExpanded = expandedPlayer === player.id;

              return (
                <View key={player.id} style={styles.playerCard}>
                  <View style={styles.playerHeader}>
                    <View style={styles.playerInfo}>
                      <View style={[styles.levelBadge, { backgroundColor: getLevelColor(player.level) }]}>
                        <Text style={styles.levelText}>{player.level}</Text>
                      </View>
                      <Text style={styles.playerName}>{player.name}</Text>
                    </View>
                  </View>

                  {/* Status Buttons */}
                  <View style={styles.statusRow}>
                    {(["present", "late", "absent", "holiday"] as AttendanceStatus[]).map((s) => (
                      <Pressable
                        key={s}
                        style={[
                          styles.statusButton,
                          status === s && { backgroundColor: getStatusColor(s) + "30", borderColor: getStatusColor(s) },
                        ]}
                        onPress={() => setPlayerStatus(player.id, s)}
                      >
                        <Ionicons
                          name={getStatusIcon(s)}
                          size={18}
                          color={status === s ? getStatusColor(s) : Colors.dark.disabled}
                        />
                        <Text
                          style={[
                            styles.statusButtonText,
                            status === s && { color: getStatusColor(s) },
                          ]}
                        >
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Late Options */}
                  {status === "late" && isExpanded ? (
                    <View style={styles.optionsRow}>
                      <Text style={styles.optionsLabel}>How late?</Text>
                      <View style={styles.optionChips}>
                        {lateOptions.map((opt) => (
                          <Pressable
                            key={opt.value}
                            style={[
                              styles.optionChip,
                              record?.lateMinutes === opt.value && styles.optionChipActive,
                            ]}
                            onPress={() => setLateMinutes(player.id, opt.value)}
                          >
                            <Text
                              style={[
                                styles.optionChipText,
                                record?.lateMinutes === opt.value && styles.optionChipTextActive,
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {/* Absent Options */}
                  {status === "absent" && isExpanded ? (
                    <View style={styles.optionsRow}>
                      <Text style={styles.optionsLabel}>Reason</Text>
                      <View style={styles.optionChips}>
                        {absentReasons.map((opt) => (
                          <Pressable
                            key={opt.value}
                            style={[
                              styles.optionChip,
                              record?.absentReason === opt.value && styles.optionChipActiveRed,
                            ]}
                            onPress={() => setAbsentReason(player.id, opt.value)}
                          >
                            <Text
                              style={[
                                styles.optionChipText,
                                record?.absentReason === opt.value && styles.optionChipTextActive,
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {/* Offline Indicator */}
        {isOffline ? (
          <View style={styles.offlineIndicator}>
            <Ionicons name="cloud-offline-outline" size={16} color={Colors.dark.orange} />
            <Text style={styles.offlineText}>Saved offline - will sync when connected</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function getLevelColor(level: string): string {
  switch (level?.toLowerCase()) {
    case "red":
      return "#FF4444";
    case "orange":
      return "#FF851B";
    case "green":
      return "#2ECC40";
    case "yellow":
      return "#FFDC00";
    case "glow":
      return "#00D4FF";
    default:
      return Colors.dark.disabled;
  }
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
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  closeButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  sessionInfo: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    minWidth: 70,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: "#FFF",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyText: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.lg,
  },
  emptySubtext: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  playerList: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  playerCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  playerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  levelBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  levelText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: "#FFF",
    textTransform: "uppercase",
  },
  playerName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  statusRow: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  statusButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  statusButtonText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
    color: Colors.dark.disabled,
  },
  optionsRow: {
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  optionsLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    marginLeft: Spacing.xs,
  },
  optionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  optionChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  optionChipActive: {
    backgroundColor: Colors.dark.orange + "20",
    borderColor: Colors.dark.orange,
  },
  optionChipActiveRed: {
    backgroundColor: Colors.dark.error + "20",
    borderColor: Colors.dark.error,
  },
  optionChipText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  optionChipTextActive: {
    color: Colors.dark.text,
    fontWeight: "500",
  },
  offlineIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    padding: Spacing.md,
    backgroundColor: Colors.dark.orange + "10",
    borderTopWidth: 1,
    borderTopColor: Colors.dark.orange + "30",
  },
  offlineText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.orange,
  },
  addPlayersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.xl,
  },
  addPlayersButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: "#FFF",
  },
  addPlayersContainer: {
    flex: 1,
  },
  addPlayersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  backButton: {
    padding: Spacing.xs,
  },
  addPlayersTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  confirmButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    minWidth: 80,
    alignItems: "center",
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: "#FFF",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    padding: 0,
  },
  playerSelectList: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  playerSelectItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  playerSelectItemActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "10",
  },
  playerSelectInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  playerSelectName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: Colors.dark.disabled,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  noPlayersFound: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  noPlayersText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.disabled,
  },
});
