import React, { useState } from "react";
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
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { convertUTCTimeToLocal } from "@/lib/dateUtils";
import { useCoach } from "@/coach/context/CoachContext";
import { WebCalendarPicker } from "@/components/WebCalendarPicker";

interface Player {
  id: string;
  name: string;
  ballLevel?: string | null;
  status?: string; // active | paused | left
  sessionsAttended?: number;
  totalXpEarned?: number;
  joinedAt?: string;
  leftAt?: string | null;
  pauseFrom?: string | null;
  pauseUntil?: string | null;
  pauseReason?: string | null;
  linkedPackageId?: string | null;
}

interface FeedbackData {
  feedback: {
    id: string;
    sessionId: string;
    intensity: string | null;
    mood: string | null;
    coachNotes: string | null;
    sessionDate?: string;
  }[];
  playerFeedback: {
    id: string;
    playerId: string;
    sessionId: string;
    progressTrend: string | null;
    effortLevel: string | null;
    note: string | null;
  }[];
  summary: {
    total: number;
    withFeedback: number;
    intensity: Record<string, number>;
  };
}

interface ProgressData {
  players: {
    id: string;
    name: string;
    xpEarned: number;
    sessionsAttended: number;
  }[];
  totalXp: number;
  sessionsCompleted: number;
  totalSessions: number;
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
  players: Player[];
  sessions: SessionInstance[];
  stats: {
    totalSessions: number;
    completedSessions: number;
    upcomingSessions: number;
    cancelledSessions: number;
  };
}

interface SeriesDetailDrawerProps {
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
  team_training: Colors.dark.sessionPhysical,
  clinic: Colors.dark.sessionActivity,
};

function getSessionTypeColor(type: string): string {
  return SESSION_TYPE_COLORS[type] || Colors.dark.textMuted;
}

export default function SeriesDetailDrawer({
  visible,
  seriesId,
  onClose,
}: SeriesDetailDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { academy } = useCoach();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [joinDate, setJoinDate] = useState<Date>(new Date());
  const [playerSearch, setPlayerSearch] = useState("");
  const [showPackageSelection, setShowPackageSelection] = useState(false);
  const [selectedPackageTemplateId, setSelectedPackageTemplateId] = useState<string | null>(null);
  const [showAttendanceBackfill, setShowAttendanceBackfill] = useState(false);
  const [selectedAttendance, setSelectedAttendance] = useState<Record<string, boolean>>({});

  const { data: series, isLoading } = useQuery<SeriesDetail>({
    queryKey: [`/api/coach/series/${seriesId}`],
    enabled: !!seriesId && visible,
  });

  const { data: feedbackData, isLoading: feedbackLoading } = useQuery<FeedbackData>({
    queryKey: [`/api/coach/series/${seriesId}/feedback`],
    enabled: !!seriesId && visible && activeTab === "feedback",
  });

  const { data: progressData, isLoading: progressLoading } = useQuery<ProgressData>({
    queryKey: [`/api/coach/series/${seriesId}/progress`],
    enabled: !!seriesId && visible && activeTab === "progress",
  });

  // Query all players for the add player modal
  interface AvailablePlayer {
    id: string;
    name: string;
    ballLevel?: string | null;
    profilePhotoUrl?: string | null;
  }
  const { data: allPlayers = [] } = useQuery<AvailablePlayer[]>({
    queryKey: ["/api/players"],
    enabled: showAddPlayerModal,
  });

  // Query package templates for package assignment
  interface PackageTemplate {
    id: string;
    name: string;
    credits: number;
    price: string;
    currency: string;
    validityDays: number;
  }
  const { data: packageTemplates = [] } = useQuery<PackageTemplate[]>({
    queryKey: ["/api/billing/package-templates"],
    enabled: showPackageSelection,
  });

  // Filter players not already in the series
  const existingPlayerIds = new Set(series?.players?.map(p => p.id) || []);
  const filteredPlayers = allPlayers.filter(p => 
    !existingPlayerIds.has(p.id) && 
    p.name.toLowerCase().includes(playerSearch.toLowerCase())
  );

  // Mutation to add player to series (with optional package assignment)
  const addPlayerMutation = useMutation({
    mutationFn: async (data: { 
      playerId: string; 
      joinDate: string; 
      attendedSessionIds: string[];
      packageTemplateId?: string | null;
    }) => {
      // Add player to class - backend handles package creation if templateId provided
      return apiRequest("POST", `/api/coach/series/${seriesId}/players`, {
        playerId: data.playerId,
        joinDate: data.joinDate,
        attendedSessionIds: data.attendedSessionIds,
        packageTemplateId: data.packageTemplateId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${seriesId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/package-templates"] });
      setShowAddPlayerModal(false);
      setShowPackageSelection(false);
      setShowAttendanceBackfill(false);
      setSelectedPlayerId(null);
      setSelectedPackageTemplateId(null);
      setJoinDate(new Date());
      setSelectedAttendance({});
      setPlayerSearch("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // Get past sessions for attendance backfill
  const getPastSessionsSinceJoinDate = () => {
    if (!series) return [];
    
    const toDateOnly = (d: Date) => {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    const joinDateOnly = toDateOnly(joinDate);
    const now = new Date();
    
    return series.sessions.filter(s => {
      const sessionDate = new Date(s.startTime);
      const sessionDateOnly = toDateOnly(sessionDate);
      return sessionDateOnly >= joinDateOnly && sessionDate < now && s.status === "completed";
    });
  };

  const handleAddPlayerPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAddPlayerModal(true);
  };

  const handlePlayerSelect = (playerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlayerId(playerId);
  };

  const handleContinueToPackage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPackageSelection(true);
  };

  const handleContinueToBackfill = () => {
    const pastSessions = getPastSessionsSinceJoinDate();
    if (pastSessions.length > 0) {
      setShowAttendanceBackfill(true);
    } else {
      handleSavePlayer();
    }
  };

  const handleSkipPackage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPackageTemplateId(null);
    handleContinueToBackfill();
  };

  const handleSelectPackage = (templateId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPackageTemplateId(templateId);
    handleContinueToBackfill();
  };

  const handleSavePlayer = () => {
    if (!selectedPlayerId) return;
    const attendedSessionIds = Object.entries(selectedAttendance)
      .filter(([_, attended]) => attended)
      .map(([sessionId]) => sessionId);
    
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    addPlayerMutation.mutate({
      playerId: selectedPlayerId,
      joinDate: formatLocalDate(joinDate),
      attendedSessionIds,
      packageTemplateId: selectedPackageTemplateId,
    });
  };

  const handleTabPress = (tabId: TabId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tabId);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr: string) => {
    // First convert UTC time to local academy time
    const timezone = academy?.timezone || "Asia/Dubai";
    const localTime = convertUTCTimeToLocal(timeStr, timezone);
    
    const [hours, minutes] = localTime.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
  };

  const accentColor = series ? getSessionTypeColor(series.sessionType) : Colors.dark.successNeon;

  const renderOverviewTab = () => {
    if (!series) return null;

    return (
      <View style={styles.tabContent}>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderColor: accentColor }]}>
            <Text style={[styles.statValue, { color: accentColor }]}>
              {series.stats.completedSessions}
            </Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={[styles.statCard, { borderColor: Colors.dark.successNeon }]}>
            <Text style={[styles.statValue, { color: Colors.dark.successNeon }]}>
              {series.stats.upcomingSessions}
            </Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>
          <View style={[styles.statCard, { borderColor: Colors.dark.accentWarning }]}>
            <Text style={[styles.statValue, { color: Colors.dark.accentWarning }]}>
              {series.stats.cancelledSessions}
            </Text>
            <Text style={styles.statLabel}>Cancelled</Text>
          </View>
          <View style={[styles.statCard, { borderColor: Colors.dark.textMuted }]}>
            <Text style={[styles.statValue, { color: Colors.dark.text }]}>
              {series.stats.totalSessions}
            </Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color={Colors.dark.textMuted} />
            <Text style={styles.infoText}>
              {DAY_NAMES[series.dayOfWeek]}s at {formatTime(series.startTime)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={Colors.dark.textMuted} />
            <Text style={styles.infoText}>{series.duration} minutes</Text>
          </View>
          {series.locationName ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={styles.infoText}>
                {series.locationName}
                {series.courtName ? ` - ${series.courtName}` : ""}
              </Text>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <Ionicons name="trophy-outline" size={16} color={Colors.dark.textMuted} />
            <Text style={styles.infoText}>{series.xpPerSession} XP per session</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          {(() => {
            const activePlayers = series.players.filter(p => p.status === "active");
            const pausedPlayers = series.players.filter(p => p.status === "paused");
            const formerPlayers = series.players.filter(p => p.status === "left");
            const canAddMore = activePlayers.length < series.maxPlayers;
            
            return (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>
                    Active Players ({activePlayers.length}/{series.maxPlayers})
                  </Text>
                  {canAddMore ? (
                    <Pressable 
                      onPress={handleAddPlayerPress}
                      style={styles.addPlayerButton}
                    >
                      <Ionicons name="add-circle" size={20} color={Colors.dark.successNeon} />
                      <Text style={styles.addPlayerButtonText}>Add</Text>
                    </Pressable>
                  ) : null}
                </View>
                {activePlayers.length === 0 ? (
                  <Pressable onPress={handleAddPlayerPress} style={styles.emptyAddButton}>
                    <Ionicons name="person-add-outline" size={24} color={Colors.dark.successNeon} />
                    <Text style={styles.emptyAddText}>Tap to add a player</Text>
                  </Pressable>
                ) : (
                  activePlayers.map((player) => (
                    <View key={player.id} style={styles.playerRow}>
                      <View style={[styles.playerAvatar, { backgroundColor: Colors.dark.successNeon + "30" }]}>
                        <Text style={[styles.playerInitial, { color: Colors.dark.successNeon }]}>
                          {player.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.playerInfo}>
                        <Text style={styles.playerName}>{player.name}</Text>
                        <Text style={styles.playerStats}>
                          {player.joinedAt ? `Since ${formatDate(player.joinedAt)}` : ""} 
                          {player.sessionsAttended ? ` - ${player.sessionsAttended} sessions` : ""}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
                
                {pausedPlayers.length > 0 ? (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>
                      On Vacation ({pausedPlayers.length})
                    </Text>
                    {pausedPlayers.map((player) => (
                      <View key={player.id} style={[styles.playerRow, { opacity: 0.7 }]}>
                        <View style={[styles.playerAvatar, { backgroundColor: Colors.dark.gold + "30" }]}>
                          <Ionicons name="airplane-outline" size={16} color={Colors.dark.gold} />
                        </View>
                        <View style={styles.playerInfo}>
                          <Text style={styles.playerName}>{player.name}</Text>
                          <Text style={[styles.playerStats, { color: Colors.dark.gold }]}>
                            {player.pauseFrom && player.pauseUntil 
                              ? `${formatDate(player.pauseFrom)} - ${formatDate(player.pauseUntil)}`
                              : player.pauseReason || "On vacation"}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </>
                ) : null}
                
                {formerPlayers.length > 0 ? (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>
                      Former Players ({formerPlayers.length})
                    </Text>
                    {formerPlayers.map((player) => (
                      <View key={player.id} style={[styles.playerRow, { opacity: 0.5 }]}>
                        <View style={[styles.playerAvatar, { backgroundColor: Colors.dark.backgroundTertiary }]}>
                          <Text style={[styles.playerInitial, { color: Colors.dark.textMuted }]}>
                            {player.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.playerInfo}>
                          <Text style={[styles.playerName, { color: Colors.dark.textMuted }]}>
                            {player.name}
                          </Text>
                          <Text style={styles.playerStats}>
                            {player.joinedAt && player.leftAt 
                              ? `${formatDate(player.joinedAt)} - ${formatDate(player.leftAt)}`
                              : player.sessionsAttended ? `${player.sessionsAttended} sessions attended` : ""}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </>
                ) : null}
              </>
            );
          })()}
        </View>
      </View>
    );
  };

  const renderTimelineTab = () => {
    if (!series) return null;

    const sortedSessions = [...series.sessions].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return (
      <View style={styles.tabContent}>
        {sortedSessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No sessions scheduled yet</Text>
          </View>
        ) : (
          sortedSessions.map((session, index) => {
            const isCompleted = session.status === "completed";
            const isCancelled = session.status === "cancelled";
            const isPast = new Date(session.startTime) < new Date();
            const isToday = new Date(session.startTime).toDateString() === new Date().toDateString();

            return (
              <View key={session.id} style={styles.timelineItem}>
                <View style={styles.timelineConnector}>
                  <View
                    style={[
                      styles.timelineDot,
                      isCompleted && { backgroundColor: Colors.dark.successNeon },
                      isCancelled && { backgroundColor: Colors.dark.error },
                      isToday && { backgroundColor: accentColor },
                      !isPast && !isToday && { backgroundColor: Colors.dark.textMuted },
                    ]}
                  />
                  {index < sortedSessions.length - 1 ? (
                    <View style={styles.timelineLine} />
                  ) : null}
                </View>
                <View style={styles.timelineContent}>
                  <View style={styles.timelineHeader}>
                    <Text
                      style={[
                        styles.timelineDate,
                        isToday && { color: accentColor, fontWeight: "700" },
                      ]}
                    >
                      {isToday ? "Today" : formatDate(session.startTime)}
                    </Text>
                    <Text
                      style={[
                        styles.timelineStatus,
                        isCompleted && { color: Colors.dark.successNeon },
                        isCancelled && { color: Colors.dark.error },
                      ]}
                    >
                      {isCompleted
                        ? "Completed"
                        : isCancelled
                        ? "Cancelled"
                        : isPast
                        ? "Missed"
                        : "Scheduled"}
                    </Text>
                  </View>
                  <Text style={styles.timelineTime}>
                    Week {session.weekNumber || index + 1}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    );
  };

  const renderFeedbackTab = () => {
    if (feedbackLoading) {
      return (
        <View style={styles.tabContent}>
          <ActivityIndicator size="large" color={Colors.dark.successNeon} />
        </View>
      );
    }

    if (!feedbackData || feedbackData.summary.withFeedback === 0) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyState}>
            <Ionicons name="chatbubble-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No feedback recorded yet</Text>
            <Text style={styles.emptySubtext}>
              Complete sessions and add feedback to track progress
            </Text>
          </View>
        </View>
      );
    }

    const { summary, feedback } = feedbackData;

    return (
      <View style={styles.tabContent}>
        <View style={styles.feedbackSummary}>
          <View style={styles.feedbackStat}>
            <Text style={styles.feedbackStatValue}>{summary.withFeedback}</Text>
            <Text style={styles.feedbackStatLabel}>Sessions with Feedback</Text>
          </View>
          <View style={styles.feedbackStat}>
            <Text style={styles.feedbackStatValue}>{summary.total - summary.withFeedback}</Text>
            <Text style={styles.feedbackStatLabel}>Pending Feedback</Text>
          </View>
        </View>
        
        {Object.keys(summary.intensity).length > 0 ? (
          <View style={styles.intensityBreakdown}>
            <Text style={styles.sectionTitle}>Intensity Breakdown</Text>
            <View style={styles.intensityRow}>
              {Object.entries(summary.intensity).map(([level, count]) => (
                <View key={level} style={styles.intensityChip}>
                  <Ionicons 
                    name={level === "intense" ? "flame" : level === "normal" ? "fitness" : "leaf"} 
                    size={16} 
                    color={level === "intense" ? Colors.dark.error : level === "normal" ? Colors.dark.gold : Colors.dark.successNeon} 
                  />
                  <Text style={styles.intensityText}>{level}: {count}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Recent Feedback</Text>
        {feedback.slice(0, 5).map((fb) => (
          <View key={fb.id} style={styles.feedbackCard}>
            <View style={styles.feedbackHeader}>
              <Text style={styles.feedbackDate}>
                {fb.sessionDate ? formatDate(fb.sessionDate) : "Session"}
              </Text>
              {fb.intensity ? (
                <View style={[styles.intensityBadge, { backgroundColor: fb.intensity === "intense" ? Colors.dark.error + "20" : fb.intensity === "normal" ? Colors.dark.gold + "20" : Colors.dark.successNeon + "20" }]}>
                  <Text style={[styles.intensityBadgeText, { color: fb.intensity === "intense" ? Colors.dark.error : fb.intensity === "normal" ? Colors.dark.gold : Colors.dark.successNeon }]}>
                    {fb.intensity}
                  </Text>
                </View>
              ) : null}
            </View>
            {fb.coachNotes ? (
              <Text style={styles.feedbackNote} numberOfLines={2}>{fb.coachNotes}</Text>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  const renderProgressTab = () => {
    if (progressLoading) {
      return (
        <View style={styles.tabContent}>
          <ActivityIndicator size="large" color={Colors.dark.gold} />
        </View>
      );
    }

    if (!progressData || progressData.players.length === 0) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyState}>
            <Ionicons name="trending-up-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No progress data yet</Text>
            <Text style={styles.emptySubtext}>
              Complete sessions to track player XP gains
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        <View style={styles.progressSummary}>
          <View style={styles.progressStat}>
            <Text style={styles.progressStatValue}>{progressData.totalXp.toLocaleString()}</Text>
            <Text style={styles.progressStatLabel}>Total XP Earned</Text>
          </View>
          <View style={styles.progressStat}>
            <Text style={styles.progressStatValue}>{progressData.sessionsCompleted}/{progressData.totalSessions}</Text>
            <Text style={styles.progressStatLabel}>Sessions Complete</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Player Leaderboard</Text>
        {progressData.players.map((player, index) => (
          <View key={player.id} style={styles.playerProgressCard}>
            <View style={styles.playerRank}>
              <Text style={styles.rankNumber}>{index + 1}</Text>
            </View>
            <View style={styles.playerProgressInfo}>
              <Text style={styles.playerProgressName}>{player.name}</Text>
              <Text style={styles.playerProgressSessions}>{player.sessionsAttended} sessions</Text>
            </View>
            <View style={styles.playerXpBadge}>
              <Ionicons name="star" size={14} color={Colors.dark.gold} />
              <Text style={styles.playerXpValue}>{player.xpEarned.toLocaleString()}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return renderOverviewTab();
      case "timeline":
        return renderTimelineTab();
      case "feedback":
        return renderFeedbackTab();
      case "progress":
        return renderProgressTab();
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.drawer, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {isLoading || !series ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.dark.successNeon} />
            </View>
          ) : (
            <>
              <View style={styles.header}>
                <LinearGradient
                  colors={[accentColor + "30", "transparent"]}
                  style={styles.headerGradient}
                />
                <View style={styles.headerContent}>
                  <View style={styles.headerTop}>
                    <View style={[styles.statusBadge, { backgroundColor: accentColor + "30" }]}>
                      <Text style={[styles.statusText, { color: accentColor }]}>
                        {series.status.toUpperCase()}
                      </Text>
                    </View>
                    <Pressable onPress={onClose} style={styles.closeButton}>
                      <Ionicons name="close" size={24} color={Colors.dark.text} />
                    </Pressable>
                  </View>
                  <Text style={styles.title}>{series.title}</Text>
                  <Text style={styles.subtitle}>
                    {DAY_NAMES[series.dayOfWeek]}s at {formatTime(series.startTime)} - {series.sessionType.replace("_", " ")}
                  </Text>
                </View>
              </View>

              <View style={styles.tabBar}>
                {TABS.map((tab) => (
                  <Pressable
                    key={tab.id}
                    style={[
                      styles.tab,
                      activeTab === tab.id && styles.tabActive,
                    ]}
                    onPress={() => handleTabPress(tab.id)}
                  >
                    <Ionicons
                      name={tab.icon as any}
                      size={18}
                      color={
                        activeTab === tab.id
                          ? accentColor
                          : Colors.dark.textMuted
                      }
                    />
                    <Text
                      style={[
                        styles.tabLabel,
                        activeTab === tab.id && { color: accentColor },
                      ]}
                    >
                      {tab.label}
                    </Text>
                    {activeTab === tab.id ? (
                      <View style={[styles.tabIndicator, { backgroundColor: accentColor }]} />
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {renderTabContent()}
              </ScrollView>
            </>
          )}
        </View>
      </View>

      {/* Add Player Modal */}
      <Modal
        visible={showAddPlayerModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddPlayerModal(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowAddPlayerModal(false)} />
          <View style={[styles.drawer, { paddingBottom: insets.bottom + Spacing.md }]}>
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
            
            <View style={styles.addPlayerHeader}>
              <Text style={styles.addPlayerTitle}>
                {showAttendanceBackfill ? "Mark Attendance" : showPackageSelection ? "Assign Package" : selectedPlayerId ? "Set Join Date" : "Add Player"}
              </Text>
              <Pressable onPress={() => {
                setShowAddPlayerModal(false);
                setShowPackageSelection(false);
                setShowAttendanceBackfill(false);
                setSelectedPlayerId(null);
                setSelectedPackageTemplateId(null);
                setPlayerSearch("");
              }}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            {showAttendanceBackfill ? (
              // Attendance backfill screen
              <ScrollView style={styles.addPlayerContent} contentContainerStyle={{ paddingBottom: 100 }}>
                <Text style={styles.backfillSubtitle}>
                  Mark which past sessions this player attended since {joinDate.toLocaleDateString()}
                </Text>
                {getPastSessionsSinceJoinDate().map((session) => (
                  <Pressable
                    key={session.id}
                    style={[
                      styles.attendanceRow,
                      selectedAttendance[session.id] && styles.attendanceRowSelected,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedAttendance(prev => ({
                        ...prev,
                        [session.id]: !prev[session.id],
                      }));
                    }}
                  >
                    <View style={styles.attendanceCheck}>
                      {selectedAttendance[session.id] ? (
                        <Ionicons name="checkmark-circle" size={24} color={Colors.dark.successNeon} />
                      ) : (
                        <Ionicons name="ellipse-outline" size={24} color={Colors.dark.textMuted} />
                      )}
                    </View>
                    <View style={styles.attendanceInfo}>
                      <Text style={styles.attendanceDate}>{formatDate(session.startTime)}</Text>
                      <Text style={styles.attendanceWeek}>Week {session.weekNumber || "?"}</Text>
                    </View>
                  </Pressable>
                ))}
                
                <Pressable
                  style={[styles.saveButton, addPlayerMutation.isPending && styles.saveButtonDisabled]}
                  onPress={handleSavePlayer}
                  disabled={addPlayerMutation.isPending}
                >
                  {addPlayerMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      Save ({Object.values(selectedAttendance).filter(Boolean).length} sessions attended)
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            ) : showPackageSelection ? (
              // Package selection screen
              <ScrollView style={styles.addPlayerContent} contentContainerStyle={{ paddingBottom: 100 }}>
                <Text style={styles.backfillSubtitle}>
                  Optionally assign a credit package to this player
                </Text>
                
                {packageTemplates.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="cube-outline" size={40} color={Colors.dark.textMuted} />
                    <Text style={styles.emptyText}>No packages available</Text>
                    <Text style={styles.emptySubtext}>Create packages in billing settings</Text>
                  </View>
                ) : (
                  packageTemplates.map((template) => (
                    <Pressable
                      key={template.id}
                      style={[
                        styles.packageCard,
                        selectedPackageTemplateId === template.id && styles.packageCardSelected,
                      ]}
                      onPress={() => handleSelectPackage(template.id)}
                    >
                      <View style={styles.packageInfo}>
                        <Text style={styles.packageName}>{template.name}</Text>
                        <Text style={styles.packageDetails}>
                          {template.credits} credits - Valid {template.validityDays} days
                        </Text>
                      </View>
                      <Text style={styles.packagePrice}>
                        {template.currency} {parseFloat(template.price).toFixed(0)}
                      </Text>
                    </Pressable>
                  ))
                )}
                
                <Pressable
                  style={styles.skipButton}
                  onPress={handleSkipPackage}
                >
                  <Text style={styles.skipButtonText}>Skip - Add Without Package</Text>
                </Pressable>
              </ScrollView>
            ) : selectedPlayerId ? (
              // Join date picker screen
              <View style={styles.addPlayerContent}>
                <Text style={styles.selectedPlayerName}>
                  {allPlayers.find(p => p.id === selectedPlayerId)?.name}
                </Text>
                
                <Text style={styles.dateLabel}>When did they join this class?</Text>
                {Platform.OS === "web" ? (
                  <WebCalendarPicker
                    value={joinDate}
                    onChange={setJoinDate}
                    maximumDate={new Date()}
                  />
                ) : (
                  <>
                    <Pressable 
                      style={styles.datePickerButton}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={20} color={Colors.dark.successNeon} />
                      <Text style={styles.datePickerText}>{joinDate.toLocaleDateString()}</Text>
                    </Pressable>
                    
                    {showDatePicker ? (
                      <DateTimePicker
                        value={joinDate}
                        mode="date"
                        display="default"
                        onChange={(_, date) => {
                          setShowDatePicker(false);
                          if (date) setJoinDate(date);
                        }}
                        maximumDate={new Date()}
                      />
                    ) : null}
                  </>
                )}
                
                <Pressable
                  style={[styles.saveButton, { marginTop: Spacing.xl }]}
                  onPress={handleContinueToPackage}
                >
                  <Text style={styles.saveButtonText}>Continue</Text>
                </Pressable>
              </View>
            ) : (
              // Player selection screen
              <View style={styles.addPlayerContent}>
                <View style={styles.searchContainer}>
                  <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search players..."
                    placeholderTextColor={Colors.dark.textMuted}
                    value={playerSearch}
                    onChangeText={setPlayerSearch}
                  />
                </View>
                
                <ScrollView style={styles.playerList}>
                  {filteredPlayers.length === 0 ? (
                    <Text style={styles.noPlayersText}>
                      {playerSearch ? "No matching players" : "No available players"}
                    </Text>
                  ) : (
                    filteredPlayers.map((player) => (
                      <Pressable
                        key={player.id}
                        style={styles.selectablePlayerRow}
                        onPress={() => handlePlayerSelect(player.id)}
                      >
                        <View style={[styles.playerAvatar, { backgroundColor: Colors.dark.successNeon + "30" }]}>
                          <Text style={[styles.playerInitial, { color: Colors.dark.successNeon }]}>
                            {player.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.playerInfo}>
                          <Text style={styles.playerName}>{player.name}</Text>
                          {player.ballLevel ? (
                            <Text style={styles.playerStats}>{player.ballLevel}</Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  drawer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "90%",
    minHeight: "60%",
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.textMuted,
    borderRadius: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
  },
  header: {
    position: "relative",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  headerContent: {
    position: "relative",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
  },
  closeButton: {
    padding: Spacing.xs,
  },
  title: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
    marginHorizontal: Spacing.lg,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    position: "relative",
  },
  tabActive: {},
  tabLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  tabContent: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
  },
  statValue: {
    fontSize: Typography.h1.fontSize,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  statLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  infoSection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  infoText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
  },
  playerInitial: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  playerStats: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyText: {
    fontSize: Typography.h4.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  timelineItem: {
    flexDirection: "row",
    marginBottom: Spacing.md,
  },
  timelineConnector: {
    width: 24,
    alignItems: "center",
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.dark.textMuted,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    marginTop: Spacing.xs,
  },
  timelineContent: {
    flex: 1,
    marginLeft: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  timelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timelineDate: {
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  timelineStatus: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  timelineTime: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  feedbackSummary: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  feedbackStat: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  feedbackStatValue: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.successNeon,
  },
  feedbackStatLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  intensityBreakdown: {
    marginBottom: Spacing.lg,
  },
  intensityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  intensityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  intensityText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.text,
    textTransform: "capitalize",
  },
  feedbackCard: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  feedbackHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  feedbackDate: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  intensityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  intensityBadgeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  feedbackNote: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  progressSummary: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  progressStat: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  progressStatValue: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  progressStatLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  playerProgressCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  playerRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.gold + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  rankNumber: {
    fontSize: Typography.small.fontSize,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  playerProgressInfo: {
    flex: 1,
  },
  playerProgressName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerProgressSessions: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  playerXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.gold + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  playerXpValue: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  // Add Player Modal styles
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  addPlayerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.successNeon + "20",
    borderRadius: BorderRadius.md,
  },
  addPlayerButtonText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.successNeon,
  },
  emptyAddButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.dark.successNeon + "50",
  },
  emptyAddText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.successNeon,
  },
  addPlayerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  addPlayerTitle: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  addPlayerContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.sm,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  playerList: {
    flex: 1,
  },
  noPlayersText: {
    textAlign: "center",
    color: Colors.dark.textMuted,
    paddingVertical: Spacing.xl,
  },
  selectablePlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  selectedPlayerName: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  dateLabel: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.successNeon + "30",
  },
  datePickerText: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  webDateInput: {
    flex: 1,
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.successNeon,
    padding: 0,
    marginLeft: Spacing.sm,
  },
  saveButton: {
    backgroundColor: Colors.dark.successNeon,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  backfillSubtitle: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  attendanceRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  attendanceRowSelected: {
    borderWidth: 1,
    borderColor: Colors.dark.successNeon,
  },
  attendanceCheck: {
    marginRight: Spacing.md,
  },
  attendanceInfo: {
    flex: 1,
  },
  attendanceDate: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  attendanceWeek: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  packageCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  packageCardSelected: {
    borderColor: Colors.dark.successNeon,
  },
  packageInfo: {
    flex: 1,
  },
  packageName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  packageDetails: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  packagePrice: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "700",
    color: Colors.dark.successNeon,
  },
  skipButton: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  skipButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    textDecorationLine: "underline",
  },
});
