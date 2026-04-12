import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, CardStyles, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { convertUTCTimeToLocal, formatCredits } from "@/lib/dateUtils";
import { WebCalendarPicker } from "@/components/WebCalendarPicker";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

const ADMIN_COLOR = Colors.dark.orange;

interface PlayerCredits {
  group: number;
  semi_private: number;
  private: number;
  totalDebt: number;
  hasDebt: boolean;
}

interface Player {
  id: string;
  name: string;
  ballLevel?: string | null;
  status?: string;
  sessionsAttended?: number;
  totalXpEarned?: number;
  joinedAt?: string;
  leftAt?: string | null;
  pauseFrom?: string | null;
  pauseUntil?: string | null;
  pauseReason?: string | null;
  linkedPackageId?: string | null;
  credits?: PlayerCredits;
}

interface SessionInstance {
  id: string;
  startTime: string;
  endTime: string;
  status: string | null;
  weekNumber?: number;
}

interface SeriesDetail {
  id: string;
  title: string;
  coachName?: string;
  dayOfWeek: number;
  startTime: string;
  duration: number;
  sessionType: string;
  status: string;
  weekCount: number | null;
  seriesStartDate: string;
  seriesEndDate: string | null;
  maxPlayers: number;
  xpPerSession: number;
  locationName?: string;
  courtName?: string;
  isPublic?: boolean;
  players: Player[];
  sessions: SessionInstance[];
  stats: {
    totalSessions: number;
    completedSessions: number;
    upcomingSessions: number;
    cancelledSessions: number;
  };
}

interface AdminSeriesDetailDrawerProps {
  visible: boolean;
  seriesId: string | null;
  onClose: () => void;
}

type TabId = "overview" | "timeline" | "feedback" | "progress";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "information-circle-outline" },
  { id: "timeline", label: "Timeline", icon: "calendar-outline" },
  { id: "feedback", label: "Feedback", icon: "chatbubble-outline" },
  { id: "progress", label: "Progress", icon: "trending-up-outline" },
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SESSION_TYPE_COLORS: Record<string, string> = {
  private: Colors.dark.sessionPrivate,
  semi_private: Colors.dark.sessionSemiPrivate,
  group: Colors.dark.sessionGroup,
  camp: Colors.dark.sessionPhysical,
};

export default function AdminSeriesDetailDrawer({
  visible,
  seriesId,
  onClose,
}: AdminSeriesDetailDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerActionMenuId, setPlayerActionMenuId] = useState<string | null>(null);
  const [pausingPlayerId, setPausingPlayerId] = useState<string | null>(null);
  const [pauseFromDate, setPauseFromDate] = useState<Date>(new Date());
  const [pauseUntilDate, setPauseUntilDate] = useState<Date>(new Date());
  const [pauseReason, setPauseReason] = useState("");
  const [showPauseFromPicker, setShowPauseFromPicker] = useState(false);
  const [showPauseUntilPicker, setShowPauseUntilPicker] = useState(false);
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);
  const [removeDate, setRemoveDate] = useState<Date>(new Date());
  const [showRemoveDatePicker, setShowRemoveDatePicker] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionInstance | null>(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attendanceState, setAttendanceState] = useState<Record<string, "present" | "late" | "absent" | "holiday" | null>>({});

  const { data: series, isLoading } = useQuery<SeriesDetail>({
    queryKey: [`/api/admin/series/${seriesId}`],
    enabled: !!seriesId && visible,
  });

  const { data: timeline = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/series/${seriesId}/timeline`],
    enabled: !!seriesId && visible && activeTab === "timeline",
  });

  const { data: feedback = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/series/${seriesId}/feedback`],
    enabled: !!seriesId && visible && activeTab === "feedback",
  });

  const { data: progress = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/series/${seriesId}/progress`],
    enabled: !!seriesId && visible && activeTab === "progress",
  });

  const { data: allPlayers = [] } = useQuery<any[]>({
    queryKey: ["/api/players"],
    enabled: showAddPlayerModal,
  });

  const addPlayerMutation = useMutation({
    mutationFn: async ({ playerId }: { playerId: string }) => {
      return apiRequest("POST", `/api/admin/series/${seriesId}/players`, { playerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/series"] });
      setShowAddPlayerModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const removePlayerMutation = useMutation({
    mutationFn: async ({ playerId }: { playerId: string }) => {
      return apiRequest("DELETE", `/api/admin/series/${seriesId}/players/${playerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/series"] });
      setRemovingPlayerId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const pausePlayerMutation = useMutation({
    mutationFn: async ({ playerId, pauseFrom, pauseUntil, pauseReason }: { playerId: string; pauseFrom: string; pauseUntil: string; pauseReason: string }) => {
      return apiRequest("POST", `/api/admin/series/${seriesId}/players/${playerId}/pause`, {
        pauseFrom,
        pauseUntil,
        pauseReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/series"] });
      setPausingPlayerId(null);
      setPauseReason("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const unpausePlayerMutation = useMutation({
    mutationFn: async ({ playerId }: { playerId: string }) => {
      return apiRequest("POST", `/api/admin/series/${seriesId}/players/${playerId}/unpause`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/series"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteSeriesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/admin/series/${seriesId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/series"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    },
    onError: (error) => {
      console.error("[DeleteSeries] Error:", error);
      if (Platform.OS === "web") {
        window.alert("Failed to delete class. Please try again.");
      }
    },
  });

  const { data: sessionAttendance = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/sessions/${selectedSession?.id}/attendance`],
    enabled: !!selectedSession && showAttendanceModal,
  });

  const saveAttendanceMutation = useMutation({
    mutationFn: async (attendance: { playerId: string; status: string }[]) => {
      return apiRequest("POST", `/api/admin/sessions/${selectedSession?.id}/attendance`, { attendance });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/series/${seriesId}/timeline`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/sessions/${selectedSession?.id}/attendance`] });
      setShowAttendanceModal(false);
      setSelectedSession(null);
      setAttendanceState({});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async (isPublic: boolean) => {
      const response = await apiRequest("PATCH", `/api/owner/series/${seriesId}/visibility`, { isPublic });
      if (!response.ok) throw new Error("Failed to update visibility");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner/public-listings"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleTabPress = (tabId: TabId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tabId);
  };

  const handleSessionPress = (session: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedSession(session);
    setShowAttendanceModal(true);
    setAttendanceState({});
  };

  const handleSaveAttendance = async () => {
    const attendance = Object.entries(attendanceState)
      .filter(([_, status]) => status !== null)
      .map(([playerId, status]) => ({ playerId, status: status as string }));
    
    if (attendance.length > 0) {
      saveAttendanceMutation.mutate(attendance);
    } else {
      setShowAttendanceModal(false);
      setSelectedSession(null);
    }
  };

  const handleDeleteSeries = async () => {
    const confirmDelete = Platform.OS === "web" && typeof window !== "undefined"
      ? window.confirm("Delete this entire class? This will cancel all sessions. This action cannot be undone.")
      : await new Promise<boolean>((resolve) => {
          const Alert = require("react-native").Alert;
          Alert.alert(
            "Delete Class",
            "This will cancel all sessions. This action cannot be undone.",
            [
              { text: "Cancel", onPress: () => resolve(false), style: "cancel" },
              { text: "Delete", onPress: () => resolve(true), style: "destructive" },
            ]
          );
        });

    if (confirmDelete) {
      deleteSeriesMutation.mutate();
    }
  };

  const activePlayers = series?.players?.filter(p => p.status === "active") || [];
  const pausedPlayers = series?.players?.filter(p => p.status === "paused") || [];

  const availablePlayers = useMemo(() => {
    const existingIds = new Set(series?.players?.map(p => p.id) || []);
    return allPlayers.filter(p =>
      !existingIds.has(p.id) &&
      p.name.toLowerCase().includes(playerSearch.toLowerCase())
    );
  }, [allPlayers, series?.players, playerSearch]);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Dubai" });
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={[`${ADMIN_COLOR}20`, "transparent"]}
          style={styles.headerGradient}
        />

        <View style={styles.header}>
          <View style={styles.dragIndicator} />
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={ADMIN_COLOR} />
          </View>
        ) : series ? (
          <>
            <View style={styles.titleSection}>
              <View style={[styles.statusBadge, { backgroundColor: series.status === "active" ? `${Colors.dark.green}30` : `${Colors.dark.textMuted}30` }]}>
                <Text style={[styles.statusText, { color: series.status === "active" ? Colors.dark.green : Colors.dark.textMuted }]}>
                  {series.status.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.title}>{series.title}</Text>
              <Text style={styles.subtitle}>
                {DAY_NAMES[series.dayOfWeek]}s at {formatTime(series.startTime)} - {series.sessionType}
              </Text>
              {series.coachName ? (
                <View style={styles.coachRow}>
                  <Ionicons name="person-outline" size={14} color={ADMIN_COLOR} />
                  <Text style={styles.coachName}>{series.coachName}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.tabBar}>
              {TABS.map((tab) => (
                <Pressable
                  key={tab.id}
                  style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                  onPress={() => handleTabPress(tab.id)}
                >
                  <Ionicons
                    name={tab.icon as any}
                    size={20}
                    color={activeTab === tab.id ? ADMIN_COLOR : Colors.dark.textMuted}
                  />
                  <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <ScrollView
              style={styles.content}
              contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 100 }]}
              showsVerticalScrollIndicator={false}
            >
              {activeTab === "overview" && (
                <View style={styles.tabContent}>
                  <View style={styles.statsGrid}>
                    <View style={[styles.statCard, CardStyles.elevated]}>
                      <Text style={[styles.statValue, { color: Colors.dark.green }]}>{series.stats.completedSessions}</Text>
                      <Text style={styles.statLabel}>Completed</Text>
                    </View>
                    <View style={[styles.statCard, CardStyles.elevated]}>
                      <Text style={[styles.statValue, { color: Colors.dark.cyan }]}>{series.stats.upcomingSessions}</Text>
                      <Text style={styles.statLabel}>Upcoming</Text>
                    </View>
                    <View style={[styles.statCard, CardStyles.elevated]}>
                      <Text style={[styles.statValue, { color: Colors.dark.red }]}>{series.stats.cancelledSessions}</Text>
                      <Text style={styles.statLabel}>Cancelled</Text>
                    </View>
                    <View style={[styles.statCard, CardStyles.elevated]}>
                      <Text style={styles.statValue}>{series.stats.totalSessions}</Text>
                      <Text style={styles.statLabel}>Total</Text>
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Schedule</Text>
                    <View style={styles.infoRow}>
                      <Ionicons name="calendar-outline" size={16} color={Colors.dark.textMuted} />
                      <Text style={styles.infoText}>{DAY_NAMES[series.dayOfWeek]}s at {formatTime(series.startTime)}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Ionicons name="time-outline" size={16} color={Colors.dark.textMuted} />
                      <Text style={styles.infoText}>{series.duration} minutes</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Ionicons name="flash-outline" size={16} color={Colors.dark.textMuted} />
                      <Text style={styles.infoText}>{series.xpPerSession} XP per session</Text>
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Marketplace Visibility</Text>
                    <View style={[styles.infoRow, { justifyContent: "space-between", alignItems: "center" }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Ionicons name="globe-outline" size={16} color={series.isPublic ? "#2ECC71" : Colors.dark.textMuted} />
                        <Text style={[styles.infoText, { color: series.isPublic ? "#2ECC71" : Colors.dark.textMuted }]}>
                          {series.isPublic ? "Listed in Marketplace" : "Private (not listed)"}
                        </Text>
                      </View>
                      <Pressable
                        style={[styles.addButton, { backgroundColor: series.isPublic ? `${Colors.dark.red}20` : `#2ECC7120`, paddingHorizontal: 12 }]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          toggleVisibilityMutation.mutate(!series.isPublic);
                        }}
                        disabled={toggleVisibilityMutation.isPending}
                      >
                        <Text style={{ color: series.isPublic ? Colors.dark.red : "#2ECC71", fontSize: 12, fontWeight: "600" }}>
                          {series.isPublic ? "Make Private" : "Make Public"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Active Players ({activePlayers.length}/{series.maxPlayers})</Text>
                      <Pressable
                        style={styles.addButton}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setShowAddPlayerModal(true);
                        }}
                      >
                        <Ionicons name="add" size={20} color={ADMIN_COLOR} />
                      </Pressable>
                    </View>

                    {activePlayers.length === 0 ? (
                      <Text style={styles.emptyText}>No active players</Text>
                    ) : (
                      activePlayers.map((player) => (
                        <View key={player.id} style={styles.playerRow}>
                          <View style={styles.playerInfo}>
                            <View style={styles.playerAvatar}>
                              <Text style={styles.playerInitial}>{player.name.charAt(0)}</Text>
                            </View>
                            <View>
                              <Text style={styles.playerName}>{player.name}</Text>
                              {player.joinedAt ? (
                                <Text style={styles.playerMeta}>Since {formatDate(player.joinedAt)}</Text>
                              ) : null}
                            </View>
                          </View>
                          <View style={styles.playerActions}>
                            {player.credits?.hasDebt ? (
                              <View style={styles.debtBadge}>
                                <Text style={styles.debtText}>-{formatCredits(player.credits.totalDebt)}</Text>
                              </View>
                            ) : null}
                            <Pressable
                              style={styles.actionButton}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setPlayerActionMenuId(playerActionMenuId === player.id ? null : player.id);
                              }}
                            >
                              <Ionicons name="ellipsis-vertical" size={18} color={Colors.dark.textMuted} />
                            </Pressable>
                          </View>
                          {playerActionMenuId === player.id ? (
                            <View style={styles.actionMenu}>
                              <Pressable
                                style={styles.actionMenuItem}
                                onPress={() => {
                                  setPlayerActionMenuId(null);
                                  setPausingPlayerId(player.id);
                                }}
                              >
                                <Ionicons name="pause-circle-outline" size={18} color={Colors.dark.orange} />
                                <Text style={styles.actionMenuText}>Pause</Text>
                              </Pressable>
                              <Pressable
                                style={styles.actionMenuItem}
                                onPress={() => {
                                  setPlayerActionMenuId(null);
                                  setRemovingPlayerId(player.id);
                                }}
                              >
                                <Ionicons name="person-remove-outline" size={18} color={Colors.dark.red} />
                                <Text style={[styles.actionMenuText, { color: Colors.dark.red }]}>Remove</Text>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      ))
                    )}

                    {pausedPlayers.length > 0 ? (
                      <>
                        <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>Paused Players ({pausedPlayers.length})</Text>
                        {pausedPlayers.map((player) => (
                          <View key={player.id} style={[styles.playerRow, styles.pausedPlayerRow]}>
                            <View style={styles.playerInfo}>
                              <View style={[styles.playerAvatar, { backgroundColor: Colors.dark.orange }]}>
                                <Text style={styles.playerInitial}>{player.name.charAt(0)}</Text>
                              </View>
                              <View>
                                <Text style={styles.playerName}>{player.name}</Text>
                                <Text style={styles.playerMeta}>
                                  Paused {player.pauseUntil ? `until ${formatDate(player.pauseUntil)}` : "indefinitely"}
                                </Text>
                              </View>
                            </View>
                            <Pressable
                              style={styles.unpauseButton}
                              onPress={() => unpausePlayerMutation.mutate({ playerId: player.id })}
                            >
                              <Ionicons name="play" size={16} color={Colors.dark.green} />
                              <Text style={styles.unpauseText}>Resume</Text>
                            </Pressable>
                          </View>
                        ))}
                      </>
                    ) : null}
                  </View>

                  <Pressable
                    style={styles.deleteButton}
                    onPress={handleDeleteSeries}
                  >
                    <Ionicons name="trash-outline" size={20} color={Colors.dark.red} />
                    <Text style={styles.deleteButtonText}>Delete Entire Class</Text>
                  </Pressable>
                </View>
              )}

              {activeTab === "timeline" && (
                <View style={styles.tabContent}>
                  {timeline.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
                      <Text style={styles.emptyStateText}>No sessions yet</Text>
                    </View>
                  ) : (
                    timeline.map((session: any, index: number) => {
                      const statusColor = session.status === "completed" ? Colors.dark.green : session.status === "cancelled" ? Colors.dark.red : session.status === "scheduled" ? ADMIN_COLOR : Colors.dark.cyan;
                      const needsAttendance = session.status === "scheduled" && new Date(session.date) <= new Date();
                      return (
                        <Pressable 
                          key={session.id} 
                          style={[styles.timelineItem, needsAttendance && styles.timelineItemHighlight]}
                          onPress={() => handleSessionPress(session)}
                        >
                          <View style={[styles.timelineDot, { backgroundColor: statusColor }]} />
                          <View style={styles.timelineContent}>
                            <Text style={styles.timelineDate}>{formatDate(session.date)}</Text>
                            <Text style={styles.timelineWeek}>Week {session.weekNumber}</Text>
                          </View>
                          <View style={[styles.timelineStatus, { backgroundColor: `${statusColor}20` }]}>
                            <Text style={[styles.timelineStatusText, { color: statusColor }]}>
                              {needsAttendance ? "Needs Attendance" : session.status}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={statusColor} />
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              )}

              {activeTab === "feedback" && (
                <View style={styles.tabContent}>
                  {feedback.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="chatbubble-outline" size={48} color={Colors.dark.textMuted} />
                      <Text style={styles.emptyStateText}>No feedback recorded yet</Text>
                      <Text style={styles.emptyStateSubtext}>Complete sessions and add feedback to track progress</Text>
                    </View>
                  ) : (
                    feedback.map((f: any) => (
                      <View key={f.id} style={[styles.feedbackCard, CardStyles.elevated]}>
                        <View style={styles.feedbackHeader}>
                          <Text style={styles.feedbackPlayer}>{f.playerName}</Text>
                          <Text style={styles.feedbackDate}>{formatDate(f.sessionDate)}</Text>
                        </View>
                        {f.coachNotes ? (
                          <Text style={styles.feedbackNotes}>{f.coachNotes}</Text>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              )}

              {activeTab === "progress" && (
                <View style={styles.tabContent}>
                  {progress.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="trending-up-outline" size={48} color={Colors.dark.textMuted} />
                      <Text style={styles.emptyStateText}>No progress data yet</Text>
                      <Text style={styles.emptyStateSubtext}>Complete sessions to track player XP gains</Text>
                    </View>
                  ) : (
                    progress.map((p: any) => (
                      <View key={p.playerId} style={[styles.progressCard, CardStyles.elevated]}>
                        <View style={styles.progressInfo}>
                          <Text style={styles.progressName}>{p.playerName}</Text>
                          <Text style={styles.progressMeta}>{p.sessionsAttended} sessions attended</Text>
                        </View>
                        <View style={styles.progressXP}>
                          <Text style={styles.progressXPValue}>+{p.totalXpEarned}</Text>
                          <Text style={styles.progressXPLabel}>XP</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </ScrollView>
          </>
        ) : null}

        <Modal
          visible={showAddPlayerModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowAddPlayerModal(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAddPlayerModal(false)} />
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add Player</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search players..."
                placeholderTextColor={Colors.dark.textMuted}
                value={playerSearch}
                onChangeText={setPlayerSearch}
              />
              <ScrollView style={styles.playerList}>
                {availablePlayers.map((player) => (
                  <Pressable
                    key={player.id}
                    style={styles.playerOption}
                    onPress={() => addPlayerMutation.mutate({ playerId: player.id })}
                  >
                    <View style={styles.playerAvatar}>
                      <Text style={styles.playerInitial}>{player.name.charAt(0)}</Text>
                    </View>
                    <Text style={styles.playerOptionName}>{player.name}</Text>
                  </Pressable>
                ))}
                {availablePlayers.length === 0 ? (
                  <Text style={styles.noPlayersText}>No players available</Text>
                ) : null}
              </ScrollView>
              <Pressable style={styles.modalCancel} onPress={() => setShowAddPlayerModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal
          visible={!!pausingPlayerId}
          animationType="fade"
          transparent
          onRequestClose={() => setPausingPlayerId(null)}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPausingPlayerId(null)} />
            <KeyboardAwareScrollViewCompat>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Pause Player</Text>

                <Text style={styles.inputLabel}>From</Text>
                {Platform.OS === "web" ? (
                  <WebCalendarPicker
                    value={pauseFromDate}
                    onChange={(date) => {
                      setPauseFromDate(date);
                      if (date > pauseUntilDate) {
                        setPauseUntilDate(date);
                      }
                    }}
                  />
                ) : (
                  <>
                    <Pressable style={styles.dateButton} onPress={() => setShowPauseFromPicker(true)}>
                      <Text style={styles.dateButtonText}>{pauseFromDate.toLocaleDateString()}</Text>
                    </Pressable>
                    {showPauseFromPicker ? (
                      <DateTimePicker
                        value={pauseFromDate}
                        mode="date"
                        onChange={(e, date) => {
                          setShowPauseFromPicker(false);
                          if (date) {
                            setPauseFromDate(date);
                            if (date > pauseUntilDate) {
                              setPauseUntilDate(date);
                            }
                          }
                        }}
                      />
                    ) : null}
                  </>
                )}

                <Text style={styles.inputLabel}>Until</Text>
                {Platform.OS === "web" ? (
                  <WebCalendarPicker
                    value={pauseUntilDate}
                    onChange={setPauseUntilDate}
                    minimumDate={pauseFromDate}
                  />
                ) : (
                  <>
                    <Pressable style={styles.dateButton} onPress={() => setShowPauseUntilPicker(true)}>
                      <Text style={styles.dateButtonText}>{pauseUntilDate.toLocaleDateString()}</Text>
                    </Pressable>
                    {showPauseUntilPicker ? (
                      <DateTimePicker
                        value={pauseUntilDate}
                        mode="date"
                        minimumDate={pauseFromDate}
                        onChange={(e, date) => {
                          setShowPauseUntilPicker(false);
                          if (date) setPauseUntilDate(date);
                        }}
                      />
                    ) : null}
                  </>
                )}

                <Text style={styles.inputLabel}>Reason (optional)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., Vacation, Injury"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={pauseReason}
                  onChangeText={setPauseReason}
                />

                <View style={styles.modalActions}>
                  <Pressable style={styles.modalCancelBtn} onPress={() => setPausingPlayerId(null)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={styles.modalConfirmBtn}
                    onPress={() => {
                      if (pausingPlayerId) {
                        pausePlayerMutation.mutate({
                          playerId: pausingPlayerId,
                          pauseFrom: pauseFromDate.toISOString().split("T")[0],
                          pauseUntil: pauseUntilDate.toISOString().split("T")[0],
                          pauseReason,
                        });
                      }
                    }}
                  >
                    <Text style={styles.modalConfirmText}>Pause Player</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAwareScrollViewCompat>
          </View>
        </Modal>

        <Modal
          visible={!!removingPlayerId}
          animationType="fade"
          transparent
          onRequestClose={() => setRemovingPlayerId(null)}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setRemovingPlayerId(null)} />
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Remove Player</Text>
              <Text style={styles.modalSubtitle}>Are you sure you want to remove this player from the class?</Text>

              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancelBtn} onPress={() => setRemovingPlayerId(null)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalConfirmBtn, { backgroundColor: Colors.dark.red }]}
                  onPress={() => {
                    if (removingPlayerId) {
                      removePlayerMutation.mutate({ playerId: removingPlayerId });
                    }
                  }}
                >
                  <Text style={styles.modalConfirmText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showAttendanceModal}
          animationType="slide"
          transparent
          onRequestClose={() => {
            setShowAttendanceModal(false);
            setSelectedSession(null);
          }}
        >
          <View style={styles.attendanceOverlay}>
            <Pressable 
              style={styles.attendanceBackdrop} 
              onPress={() => {
                setShowAttendanceModal(false);
                setSelectedSession(null);
              }} 
            />
            <View style={[styles.attendanceContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <LinearGradient
                colors={[`${ADMIN_COLOR}15`, "transparent"]}
                style={styles.attendanceGlow}
              />
              
              <View style={styles.attendanceHeader}>
                <View>
                  <Text style={styles.attendanceTitle}>Mark Attendance</Text>
                  {selectedSession ? (
                    <Text style={styles.attendanceSubtitle}>
                      {formatDate((selectedSession as any).date || selectedSession.startTime)} - Week {selectedSession.weekNumber || "?"}
                    </Text>
                  ) : null}
                </View>
                <Pressable 
                  onPress={() => {
                    setShowAttendanceModal(false);
                    setSelectedSession(null);
                  }} 
                  style={styles.attendanceCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color={Colors.dark.text} />
                </Pressable>
              </View>
              
              <ScrollView style={styles.attendanceList} showsVerticalScrollIndicator={false}>
                {series?.players?.filter(p => p.status === "active").map((player) => {
                  const existingAttendance = sessionAttendance.find((a: any) => a.playerId === player.id);
                  const currentStatus = attendanceState[player.id] ?? existingAttendance?.status ?? null;
                  
                  const getStatusColor = (status: string) => {
                    switch (status) {
                      case "present": return Colors.dark.primary;
                      case "late": return Colors.dark.orange;
                      case "absent": return Colors.dark.error;
                      case "holiday": return Colors.dark.xpCyan;
                      default: return Colors.dark.disabled;
                    }
                  };
                  
                  const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => {
                    switch (status) {
                      case "present": return "checkmark-circle";
                      case "late": return "time";
                      case "absent": return "close-circle";
                      case "holiday": return "snow";
                      default: return "ellipse-outline";
                    }
                  };
                  
                  return (
                    <View key={player.id} style={styles.attendancePlayerCard}>
                      <View style={styles.attendancePlayerInfo}>
                        <View style={[styles.attendancePlayerAvatar, { backgroundColor: `${ADMIN_COLOR}30` }]}>
                          <Text style={[styles.attendancePlayerInitial, { color: ADMIN_COLOR }]}>
                            {player.name.charAt(0)}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.attendancePlayerName}>{player.name}</Text>
                          <Text style={styles.attendancePlayerCredits}>
                            Credits: {player.credits ? formatCredits(player.credits.group + player.credits.private + player.credits.semi_private) : 0}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.attendanceStatusRow}>
                        {(["present", "late", "absent", "holiday"] as const).map((status) => (
                          <Pressable
                            key={status}
                            style={[
                              styles.attendanceStatusBtn,
                              currentStatus === status && { 
                                backgroundColor: getStatusColor(status) + "30", 
                                borderColor: getStatusColor(status) 
                              },
                            ]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setAttendanceState(prev => ({ ...prev, [player.id]: status }));
                            }}
                          >
                            <Ionicons 
                              name={getStatusIcon(status)}
                              size={16} 
                              color={currentStatus === status ? getStatusColor(status) : Colors.dark.disabled} 
                            />
                            <Text style={[
                              styles.attendanceStatusText,
                              currentStatus === status && { color: getStatusColor(status) },
                            ]}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              
              <Pressable
                style={[styles.saveAttendanceBtn, saveAttendanceMutation.isPending && styles.saveAttendanceBtnDisabled]}
                onPress={handleSaveAttendance}
                disabled={saveAttendanceMutation.isPending}
              >
                <LinearGradient
                  colors={[ADMIN_COLOR, Colors.dark.accentOrange]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.saveAttendanceGradient}
                >
                  {saveAttendanceMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={22} color={Colors.dark.buttonText} />
                      <Text style={styles.saveAttendanceText}>Save Attendance</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  header: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    position: "relative",
  },
  dragIndicator: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.textMuted,
    borderRadius: 2,
  },
  closeButton: {
    position: "absolute",
    right: Spacing.lg,
    top: Spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  titleSection: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  coachName: {
    ...Typography.small,
    color: ADMIN_COLOR,
    fontWeight: "500",
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    gap: 4,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: ADMIN_COLOR,
  },
  tabText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: ADMIN_COLOR,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
  },
  tabContent: {},
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    width: "48%",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  statValue: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${ADMIN_COLOR}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  infoText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  emptyText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
    position: "relative",
  },
  pausedPlayerRow: {
    opacity: 0.7,
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.green,
    alignItems: "center",
    justifyContent: "center",
  },
  playerInitial: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  playerMeta: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  playerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  debtBadge: {
    backgroundColor: `${Colors.dark.red}20`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  debtText: {
    ...Typography.caption,
    color: Colors.dark.red,
    fontWeight: "600",
  },
  actionButton: {
    padding: Spacing.xs,
  },
  actionMenu: {
    position: "absolute",
    right: 0,
    top: "100%",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    zIndex: 100,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  actionMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  actionMenuText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  unpauseButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: `${Colors.dark.green}20`,
    borderRadius: BorderRadius.sm,
  },
  unpauseText: {
    ...Typography.caption,
    color: Colors.dark.green,
    fontWeight: "600",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: `${Colors.dark.red}15`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.red}30`,
    marginTop: Spacing.lg,
  },
  deleteButtonText: {
    ...Typography.body,
    color: Colors.dark.red,
    fontWeight: "600",
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.md,
  },
  timelineContent: {
    flex: 1,
  },
  timelineDate: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  timelineWeek: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  timelineStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  timelineStatusText: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  emptyStateText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptyStateSubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  feedbackCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  feedbackHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  feedbackPlayer: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  feedbackDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  feedbackNotes: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  progressInfo: {
    flex: 1,
  },
  progressName: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  progressMeta: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  progressXP: {
    alignItems: "center",
  },
  progressXPValue: {
    ...Typography.h3,
    color: ADMIN_COLOR,
  },
  progressXPLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  modalSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  searchInput: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  playerList: {
    maxHeight: 300,
  },
  playerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  playerOptionName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  noPlayersText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingVertical: Spacing.lg,
  },
  modalCancel: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  modalCancelText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  inputLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  dateButton: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  dateButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  textInput: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  modalCancelBtn: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  modalConfirmBtn: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: ADMIN_COLOR,
    alignItems: "center",
  },
  modalConfirmText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  timelineItemHighlight: {
    backgroundColor: `${ADMIN_COLOR}10`,
    borderLeftWidth: 3,
    borderLeftColor: ADMIN_COLOR,
  },
  attendanceOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    zIndex: 9999,
  },
  attendanceBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.card,
    zIndex: 1,
  },
  attendanceContent: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderBottomWidth: 0,
    zIndex: 10,
    maxHeight: "80%",
  },
  attendanceGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  attendanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  attendanceTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  attendanceSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  attendanceCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  attendanceList: {
    maxHeight: 400,
    marginBottom: Spacing.lg,
  },
  attendancePlayerCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  attendancePlayerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  attendancePlayerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  attendancePlayerInitial: {
    fontSize: 16,
    fontWeight: "700",
  },
  attendancePlayerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  attendancePlayerCredits: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  attendanceStatusRow: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  attendanceStatusBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  attendanceStatusText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  saveAttendanceBtn: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  saveAttendanceBtnDisabled: {
    opacity: 0.6,
  },
  saveAttendanceGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  saveAttendanceText: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
});
