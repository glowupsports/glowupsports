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
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, getPlayerLevelColor, getPlayerLevelTextColor, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { invalidatePlayersList } from "@/lib/credit-cache";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useNetwork } from "@/context/NetworkContext";
import { showOfflineAlert } from "@/hooks/useOfflineGuard";
import { SessionSummaryModal } from "@/components/SessionSummaryModal";
import { AnimatedCheck } from "@/components/AnimatedCheck";
import { InfoTooltip } from "@/components/InfoTooltip";
import StrokeFeedbackModal from "@/coach/components/StrokeFeedbackModal";

type AttendanceStatus = "present" | "late" | "absent" | "holiday";
type LateMinutes = 5 | 10 | 15 | 20 | 30 | 999;
type AbsentReason = "illness" | "injury" | "personal" | "weather" | "no_show" | "other";

interface Player {
  id: string;
  name: string;
  level: string;
  ballLevel?: string | null;
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

const LAST_LATE_MINUTES_KEY = "coach_last_late_minutes";
const DEFAULT_LATE_MINUTES: LateMinutes = 10;

export default function AttendanceDrawer({
  visible,
  session,
  onClose,
  onSave,
  onPlayersAdded,
}: AttendanceDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isOffline, logOfflineAttempt } = useNetwork();
  const [attendance, setAttendance] = useState<Map<string, AttendanceRecord>>(new Map());
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [showAddPlayers, setShowAddPlayers] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUsedLateMinutes, setLastUsedLateMinutes] = useState<LateMinutes>(DEFAULT_LATE_MINUTES);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showStrokeFeedback, setShowStrokeFeedback] = useState(false);
  const [quickMode, setQuickMode] = useState(true);

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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
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
    const loadLastUsedLateMinutes = async () => {
      try {
        const stored = await AsyncStorage.getItem(LAST_LATE_MINUTES_KEY);
        if (stored) {
          const parsed = parseInt(stored, 10) as LateMinutes;
          if ([5, 10, 15, 20, 30, 999].includes(parsed)) {
            setLastUsedLateMinutes(parsed);
          }
        }
      } catch {}
    };
    loadLastUsedLateMinutes();
  }, []);

  const [coachXpAwarded, setCoachXpAwarded] = useState(0);
  
  const { data: coachXpData } = useQuery<{
    level: number;
    totalXp: number;
    currentLevelXp: number;
    requiredForLevel: number;
    xpPercent: number;
  }>({
    queryKey: [`/api/coach/${session?.coachId}/xp`],
    enabled: visible && !!session?.coachId,
  });

  // V2 credit batch — shows expiring-soon badges on player rows
  interface V2BatchWallet {
    balance: { group: number; semi_private: number; private: number };
    nextExpiry: string | null;
    expiringSoon: number;
  }
  const playerIdsForV2 = (session?.players || []).map((p) => p.id);
  const { data: v2Batch } = useQuery<{
    v2Enabled: boolean;
    wallets: Record<string, V2BatchWallet>;
  }>({
    queryKey: [`/api/v2/credits/wallets-batch`, playerIdsForV2.sort().join(",")],
    queryFn: async () => {
      const res = await apiRequest("POST", `/api/v2/credits/wallets-batch`, {
        playerIds: playerIdsForV2,
      });
      return res.json();
    },
    enabled: visible && playerIdsForV2.length > 0,
  });
  const v2Enabled = v2Batch?.v2Enabled === true;

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
      setCoachXpAwarded(0);
    }
  }, [session]);

  const saveMutation = useMutation({
    mutationFn: async (data: { sessionId: string; attendance: AttendanceRecord[] }) => {
      const res = await apiRequest("POST", `/api/coach/sessions/${data.sessionId}/attendance`, {
        attendance: data.attendance,
        markCompleted: true,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/profile"] });
      // Task #930 — saving attendance consumes credits; refresh the coach
      // Players list pill so the new balance is visible without a 60s wait.
      invalidatePlayersList(queryClient);
      if (data?.autoCancelled) {
        Alert.alert(
          "Les automatisch geannuleerd",
          "Alle spelers zijn op vakantie. De les is automatisch geannuleerd en er worden geen credits afgeschreven.",
          [{ text: "OK", onPress: () => { onSave(); onClose(); } }]
        );
        return;
      }
      if (data?.xpAwarded) {
        setCoachXpAwarded(data.xpAwarded);
      }
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setShowSummaryModal(true);
      }, 300);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to save attendance");
    },
  });

  const setPlayerStatus = (playerId: string, status: AttendanceStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAttendance((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(playerId) || { playerId, status: "present" };
      const newRecord = { ...existing, status };
      if (status === "late" && !existing.lateMinutes) {
        newRecord.lateMinutes = lastUsedLateMinutes;
      }
      updated.set(playerId, newRecord);
      return updated;
    });
    if (status === "late" || status === "absent") {
      setExpandedPlayer(playerId);
    } else {
      setExpandedPlayer(null);
    }
  };

  const setLateMinutes = async (playerId: string, minutes: LateMinutes) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAttendance((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(playerId) || { playerId, status: "late" };
      updated.set(playerId, { ...existing, lateMinutes: minutes });
      return updated;
    });
    setLastUsedLateMinutes(minutes);
    try {
      await AsyncStorage.setItem(LAST_LATE_MINUTES_KEY, String(minutes));
    } catch {}
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

  const handleSave = async () => {
    if (!session) return;
    
    if (isOffline) {
      await logOfflineAttempt({
        screen: "AttendanceDrawer",
        action: "save_attendance",
      });
      showOfflineAlert();
      return;
    }
    
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

  const absentReasons: { value: AbsentReason; label: string; priority?: boolean }[] = [
    { value: "no_show", label: "No Show", priority: true },
    { value: "illness", label: "Illness" },
    { value: "injury", label: "Injury" },
    { value: "personal", label: "Personal" },
    { value: "weather", label: "Weather" },
    { value: "other", label: "Other" },
  ];

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const handleSummaryClose = () => {
    setShowSummaryModal(false);
    const presentPlayers = session?.players?.filter((p) => {
      const record = attendance.get(p.id);
      return record?.status === "present" || record?.status === "late";
    }) || [];
    if (presentPlayers.length > 0) {
      setShowStrokeFeedback(true);
    } else {
      onSave();
      onClose();
    }
  };

  const handleStrokeFeedbackComplete = () => {
    setShowStrokeFeedback(false);
    onSave();
    onClose();
  };

  const handleStrokeFeedbackClose = () => {
    setShowStrokeFeedback(false);
    onSave();
    onClose();
  };

  const getPresentCount = () => {
    let count = 0;
    attendance.forEach((record) => {
      if (record.status === "present" || record.status === "late") {
        count++;
      }
    });
    return count;
  };

  const getSessionSummaryData = () => {
    const presentCount = getPresentCount();
    const xpEarned = coachXpAwarded || 25;
    const level = coachXpData?.level || 1;
    const currentLevelXp = coachXpData?.currentLevelXp || 0;
    const requiredForLevel = coachXpData?.requiredForLevel || 100;
    return {
      duration: session?.duration || 60,
      skillsPracticed: presentCount,
      xpEarned,
      currentLevel: level,
      currentXP: currentLevelXp + xpEarned,
      xpToNextLevel: Math.max(0, requiredForLevel - (currentLevelXp + xpEarned)),
      nextFocus: presentCount > 0 ? {
        skill: "Session Consistency",
        recommendation: "Keep tracking attendance to build player profiles",
      } : undefined,
    };
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

        {/* Premium Header */}
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Text style={styles.title}>Attendance</Text>
              <InfoTooltip 
                title="Attendance Rules" 
                description="Important: Absent players are still charged - the lesson counts as used. Only players marked as 'Vacation' or 'Holiday' skip credit deduction. For semi-private sessions with only 1 player present, the session auto-converts to a private session and charges a private credit."
              />
            </View>
            <Text style={styles.sessionInfo}>
              {formatTime(session.startTime)} - {formatTime(session.endTime)}
            </Text>
          </View>
          <Pressable
            style={[
              styles.saveButton, 
              (saveMutation.isPending || isOffline) && styles.saveButtonDisabled
            ]}
            onPress={handleSave}
            disabled={saveMutation.isPending || isOffline}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </Pressable>
        </View>

        {/* Progress Indicator */}
        {players.length > 0 ? (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>
                {getPresentCount()} of {players.length} attending
              </Text>
              <Pressable
                style={styles.markAllButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  players.forEach(p => setPlayerStatus(p.id, "present"));
                }}
              >
                <Ionicons name="checkmark-done" size={16} color={Colors.dark.primary} />
                <Text style={styles.markAllText}>All Present</Text>
              </Pressable>
            </View>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${(getPresentCount() / players.length) * 100}%` }
                ]} 
              />
            </View>
            
            {/* Billing upgrade notice for semi-private becoming private */}
            {session.sessionType === "semi_private" && getPresentCount() === 1 && players.length >= 2 ? (
              <View style={styles.billingNotice}>
                <Ionicons name="information-circle" size={18} color={Colors.dark.orange} />
                <Text style={styles.billingNoticeText}>
                  Billed as Private (1 attending)
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

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
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
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
                placeholderTextColor={Colors.dark.textMuted}
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
                        <View style={[styles.levelBadge, { backgroundColor: getPlayerLevelColor(player.ballLevel) }]}>
                          <Text style={styles.levelText}>{player.ballLevel}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.playerSelectName}>{player.name}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                      {isSelected ? (
                        <Ionicons name="checkmark" size={16} color={Colors.dark.buttonText} />
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
              <Ionicons name="person-add" size={20} color={Colors.dark.buttonText} />
              <Text style={styles.addPlayersButtonText}>Add Players</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.modeToggleContainer}>
              <Pressable
                style={[styles.modeToggleBtn, quickMode && styles.modeToggleBtnActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQuickMode(true);
                }}
              >
                <Ionicons name="flash" size={16} color={quickMode ? Colors.dark.buttonText : Colors.dark.disabled} />
                <Text style={[styles.modeToggleText, quickMode && styles.modeToggleTextActive]}>Quick</Text>
              </Pressable>
              <Pressable
                style={[styles.modeToggleBtn, !quickMode && styles.modeToggleBtnActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQuickMode(false);
                }}
              >
                <Ionicons name="list" size={16} color={!quickMode ? Colors.dark.buttonText : Colors.dark.disabled} />
                <Text style={[styles.modeToggleText, !quickMode && styles.modeToggleTextActive]}>Detailed</Text>
              </Pressable>
            </View>

            {quickMode ? (
              <ScrollView style={styles.playerListScroll} contentContainerStyle={styles.quickModeContainer} showsVerticalScrollIndicator={false}>
                {players.map((player) => {
                  const record = attendance.get(player.id);
                  const status = record?.status || "present";
                  const isPresent = status === "present" || status === "late";
                  const playerBallLevel = player.ballLevel ?? player.level ?? "green";
                  const levelColor = getPlayerLevelColor(playerBallLevel);
                  const levelTextColor = getPlayerLevelTextColor(playerBallLevel);

                  return (
                    <View key={player.id} style={styles.quickModeRow}>
                      <View style={styles.quickModePlayerInfo}>
                        <View style={[styles.quickModeAvatar, { backgroundColor: levelColor + "30" }]}>
                          <Text style={[styles.quickModeAvatarText, { color: levelTextColor }]}>
                            {player.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.quickModePlayerName} numberOfLines={1}>{player.name}</Text>
                        {v2Enabled && v2Batch?.wallets[player.id]?.expiringSoon ? (
                          <View style={{ marginLeft: Spacing.xs, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: `${Colors.dark.gold}25`, borderWidth: 1, borderColor: `${Colors.dark.gold}50` }}>
                            <Text style={{ fontSize: 10, color: Colors.dark.gold, fontWeight: "700" }}>
                              {v2Batch.wallets[player.id].expiringSoon} expiring
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.quickModeActions}>
                        <Pressable
                          style={[
                            styles.quickModeBtn,
                            styles.quickModePresentBtn,
                            isPresent && styles.quickModePresentBtnActive,
                          ]}
                          onPress={() => setPlayerStatus(player.id, "present")}
                        >
                          <Ionicons name="checkmark" size={24} color={isPresent ? Colors.dark.buttonText : Colors.dark.primary} />
                        </Pressable>
                        <Pressable
                          style={[
                            styles.quickModeBtn,
                            styles.quickModeAbsentBtn,
                            status === "absent" && styles.quickModeAbsentBtnActive,
                          ]}
                          onPress={() => setPlayerStatus(player.id, "absent")}
                        >
                          <Ionicons name="close" size={24} color={status === "absent" ? "#fff" : Colors.dark.error} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <ScrollView style={styles.playerListScroll} contentContainerStyle={styles.playerGridContainer} showsVerticalScrollIndicator={false}>
                <View style={styles.playersGrid}>
                  {players.map((player) => {
                const record = attendance.get(player.id);
                const status = record?.status || "present";
                const isExpanded = expandedPlayer === player.id;
                const playerBallLevel = player.ballLevel ?? player.level ?? "green";
                const levelColor = getPlayerLevelColor(playerBallLevel);
                const levelTextColor = getPlayerLevelTextColor(playerBallLevel);

                return (
                  <View key={player.id} style={styles.playerGridCard}>
                    {/* Avatar with status ring */}
                    <View style={[styles.avatarContainer, { borderColor: getStatusColor(status) }]}>
                      <View style={[styles.playerAvatar, { backgroundColor: levelColor + "30" }]}>
                        <Text style={[styles.avatarInitial, { color: levelTextColor }]}>
                          {player.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(status) }]}>
                        <Ionicons name={getStatusIcon(status)} size={10} color="#fff" />
                      </View>
                    </View>
                    
                    {/* Player name and level */}
                    <Text style={styles.gridPlayerName} numberOfLines={1}>{player.name}</Text>
                    {player.ballLevel ? (
                      <View style={[styles.gridLevelBadge, { backgroundColor: levelColor + "20" }]}>
                        <View style={[styles.gridLevelDot, { backgroundColor: levelColor }]} />
                        <Text style={[styles.gridLevelText, { color: levelTextColor }]}>
                          {player.ballLevel?.split("_")[0] || ""}
                        </Text>
                      </View>
                    ) : null}

                    {/* Compact Status Icons */}
                    <View style={styles.compactStatusRow}>
                      {(["present", "late", "absent", "holiday"] as AttendanceStatus[]).map((s) => (
                        <Pressable
                          key={s}
                          style={[
                            styles.compactStatusBtn,
                            status === s && { backgroundColor: getStatusColor(s), borderColor: getStatusColor(s) },
                          ]}
                          onPress={() => setPlayerStatus(player.id, s)}
                        >
                          <Ionicons
                            name={getStatusIcon(s)}
                            size={14}
                            color={status === s ? "#fff" : Colors.dark.textSubtle}
                          />
                        </Pressable>
                      ))}
                    </View>

                    {/* Expanded options for late/absent */}
                    {isExpanded && status === "late" ? (
                      <View style={styles.expandedOptions}>
                        <Text style={styles.expandedLabel}>How late?</Text>
                        <View style={styles.expandedChips}>
                          {lateOptions.slice(0, 4).map((opt) => (
                            <Pressable
                              key={opt.value}
                              style={[
                                styles.miniChip,
                                record?.lateMinutes === opt.value && styles.miniChipActive,
                              ]}
                              onPress={() => setLateMinutes(player.id, opt.value)}
                            >
                              <Text style={[
                                styles.miniChipText,
                                record?.lateMinutes === opt.value && styles.miniChipTextActive,
                              ]}>{opt.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ) : null}

                    {isExpanded && status === "absent" ? (
                      <View style={styles.expandedOptions}>
                        <Pressable
                          style={[
                            styles.noShowBtn,
                            record?.absentReason === "no_show" && styles.noShowBtnActive,
                          ]}
                          onPress={() => setAbsentReason(player.id, "no_show")}
                        >
                          <Ionicons 
                            name="alert-circle" 
                            size={14} 
                            color={record?.absentReason === "no_show" ? "#fff" : Colors.dark.error} 
                          />
                          <Text style={[
                            styles.noShowBtnText,
                            record?.absentReason === "no_show" && styles.noShowBtnTextActive,
                          ]}>No Show</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
                </View>
              </ScrollView>
            )}
          </>
        )}

        {/* Offline Warning */}
        {isOffline ? (
          <View style={styles.offlineIndicator}>
            <Ionicons name="wifi-outline" size={16} color={Colors.dark.accentWarning} />
            <Text style={styles.offlineText}>You're offline. Saving is disabled.</Text>
          </View>
        ) : null}

        {/* Success Animation Overlay */}
        {showSuccessAnimation ? (
          <View style={styles.successOverlay}>
            <AnimatedCheck size={80} variant="glow" />
          </View>
        ) : null}
      </View>

      {/* Session Summary Modal */}
      <SessionSummaryModal
        visible={showSummaryModal}
        onClose={handleSummaryClose}
        sessionData={getSessionSummaryData()}
      />

      {/* Stroke Feedback Modal - opened after summary */}
      <StrokeFeedbackModal
        visible={showStrokeFeedback}
        session={session ? {
          ...session,
          players: session.players?.filter((p) => {
            const record = attendance.get(p.id);
            return record?.status === "present" || record?.status === "late";
          }),
        } : null}
        onClose={handleStrokeFeedbackClose}
        onComplete={handleStrokeFeedbackComplete}
      />
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
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  closeButton: {
    padding: Spacing.xs,
  },
  headerCenter: {
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
    backgroundColor: GlowColors.primary,
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
    color: Colors.dark.buttonText,
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
  progressSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  markAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: BorderRadius.sm,
  },
  markAllText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  progressBar: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  billingNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 165, 0, 0.15)",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  billingNoticeText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.orange,
  },
  playerListScroll: {
    flex: 1,
  },
  playerGridContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  playersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  playerGridCard: {
    width: "48%",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  avatarContainer: {
    position: "relative",
    borderWidth: 3,
    borderRadius: 30,
    padding: 2,
    marginBottom: Spacing.xs,
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: "700",
  },
  statusIndicator: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  gridPlayerName: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: 2,
  },
  gridLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  gridLevelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  gridLevelText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  compactStatusRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  compactStatusBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  expandedOptions: {
    width: "100%",
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  expandedLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    marginBottom: 4,
    textAlign: "center",
  },
  expandedChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
  },
  miniChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: Backgrounds.elevated,
  },
  miniChipActive: {
    backgroundColor: Colors.dark.orange,
  },
  miniChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  miniChipTextActive: {
    color: "#fff",
  },
  noShowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: Colors.dark.error + "15",
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  noShowBtnActive: {
    backgroundColor: Colors.dark.error,
    borderColor: Colors.dark.error,
  },
  noShowBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.error,
  },
  noShowBtnTextActive: {
    color: "#fff",
  },
  playerList: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  playerCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    color: "#fff",
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
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "transparent",
  },
  statusButtonText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
    color: Colors.dark.textMuted,
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
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
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
  noShowChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.error + "15",
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
    marginBottom: Spacing.xs,
  },
  noShowChipActive: {
    backgroundColor: Colors.dark.error,
    borderColor: Colors.dark.error,
  },
  noShowChipText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  noShowChipTextActive: {
    color: Colors.dark.buttonText,
  },
  holidayInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.xpCyan + "10",
    borderRadius: BorderRadius.sm,
  },
  holidayInfoText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.xpCyan,
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
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.xl,
  },
  addPlayersButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.buttonText,
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
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
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
    backgroundColor: GlowColors.primary,
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
    color: Colors.dark.buttonText,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  playerSelectItemActive: {
    borderColor: GlowColors.primary,
    backgroundColor: GlowColors.primary + "10",
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
    backgroundColor: GlowColors.primary,
    borderColor: GlowColors.primary,
  },
  noPlayersFound: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  noPlayersText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11, 13, 16, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  modeToggleContainer: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: 3,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  modeToggleBtnActive: {
    backgroundColor: Colors.dark.primary,
  },
  modeToggleText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.disabled,
  },
  modeToggleTextActive: {
    color: Colors.dark.buttonText,
  },
  quickModeContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  quickModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  quickModePlayerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  quickModeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  quickModeAvatarText: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "700",
  },
  quickModePlayerName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  quickModeActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  quickModeBtn: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  quickModePresentBtn: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "10",
  },
  quickModePresentBtnActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  quickModeAbsentBtn: {
    borderColor: Colors.dark.error,
    backgroundColor: Colors.dark.error + "10",
  },
  quickModeAbsentBtnActive: {
    backgroundColor: Colors.dark.error,
    borderColor: Colors.dark.error,
  },
});
