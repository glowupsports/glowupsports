import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";

interface Player {
  id: string;
  name: string;
  ballLevel?: string | null;
  profilePicture?: string | null;
}

interface SessionPlayer {
  id: string;
  playerId: string;
  sessionId: string;
  attendance?: string | null;
  player: Player;
}

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status?: string | null;
  courtId?: string | null;
  locationId?: string | null;
  coachId?: string | null;
  sessionDate?: string;
  players?: Player[];
}

interface SessionFeedback {
  id: string;
  sessionId: string;
  intensity?: string | null;
  mood?: string | null;
  coachNotes?: string | null;
}

interface PlayerSessionFeedback {
  id: string;
  playerId: string;
  sessionId: string;
  progressTrend?: string | null;
  effortLevel?: string | null;
  note?: string | null;
}

interface StandaloneSessionDetailDrawerProps {
  visible: boolean;
  session: Session | null;
  onClose: () => void;
  onOpenFeedback?: (session: Session) => void;
}

type TabId = "overview" | "timeline" | "feedback" | "progress";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "information-circle-outline" },
  { id: "timeline", label: "Timeline", icon: "calendar-outline" },
  { id: "feedback", label: "Feedback", icon: "chatbubble-outline" },
  { id: "progress", label: "Progress", icon: "trending-up-outline" },
];

const SESSION_TYPE_COLORS: Record<string, string> = {
  private: Colors.dark.sessionPrivate,
  semi_private: Colors.dark.sessionSemiPrivate,
  group: Colors.dark.sessionGroup,
  physical: Colors.dark.sessionPhysical,
  activity: Colors.dark.sessionActivity,
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  private: "Private Lesson",
  semi_private: "Semi-Private",
  group: "Group Session",
  physical: "Physical Training",
  activity: "Activity",
};

function getBallLevelColor(level?: string | null): string {
  switch (level?.toUpperCase()) {
    case "BLUE": return "#3B82F6";
    case "RED": return "#EF4444";
    case "ORANGE": return "#F97316";
    case "GREEN": return "#22C55E";
    case "YELLOW": return "#EAB308";
    case "ADULT":
    case "GLOW": return "#00E5FF"; // Cyan for adult players
    default: return Colors.dark.textMuted;
  }
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function StandaloneSessionDetailDrawer({
  visible,
  session,
  onClose,
  onOpenFeedback,
}: StandaloneSessionDetailDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { academy } = useCoach();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data: sessionPlayers = [], isLoading: playersLoading } = useQuery<SessionPlayer[]>({
    queryKey: [`/api/coach/sessions/${session?.id}/players`],
    enabled: !!session?.id && visible,
  });

  const { data: feedbackData, isLoading: feedbackLoading } = useQuery<{
    sessionFeedback: SessionFeedback | null;
    playerFeedback: PlayerSessionFeedback[];
  }>({
    queryKey: [`/api/coach/sessions/${session?.id}/feedback`],
    enabled: !!session?.id && visible,
  });

  const accentColor = session ? (SESSION_TYPE_COLORS[session.sessionType] || Colors.dark.sessionPrivate) : Colors.dark.sessionPrivate;
  const typeLabel = session ? (SESSION_TYPE_LABELS[session.sessionType] || session.sessionType) : "";

  const sessionDate = session?.sessionDate 
    ? new Date(session.sessionDate) 
    : session?.startTime 
      ? new Date(session.startTime) 
      : null;

  const dayName = sessionDate ? DAY_NAMES[sessionDate.getDay()] : "";

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const displayTitle = useMemo(() => {
    if (!session) return "";
    const time = formatTime(session.startTime);
    return `${typeLabel} - ${dayName} ${time}`;
  }, [session, typeLabel, dayName]);

  const isCompleted = session?.status === "completed";
  const hasFeedback = !!feedbackData?.sessionFeedback;

  const handleTabPress = (tabId: TabId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tabId);
  };

  const handleAddFeedback = () => {
    if (session && onOpenFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onClose();
      setTimeout(() => onOpenFeedback(session), 100);
    }
  };

  const players = session?.players || sessionPlayers.map(sp => sp.player);

  const stats = {
    completed: isCompleted ? 1 : 0,
    upcoming: isCompleted ? 0 : 1,
    cancelled: 0,
    total: 1,
  };

  const xpPerSession = session?.sessionType === "private" ? 25 : session?.sessionType === "group" ? 20 : 20;

  const renderOverviewTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, stats.completed > 0 && styles.statCardHighlight]}>
          <Text style={[styles.statValue, stats.completed > 0 && styles.statValueHighlight]}>{stats.completed}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={[styles.statCard, stats.upcoming > 0 && styles.statCardUpcoming]}>
          <Text style={[styles.statValue, stats.upcoming > 0 && styles.statValueUpcoming]}>{stats.upcoming}</Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
        <View style={[styles.statCard, stats.cancelled > 0 && styles.statCardCancelled]}>
          <Text style={[styles.statValue, stats.cancelled > 0 && styles.statValueCancelled]}>{stats.cancelled}</Text>
          <Text style={styles.statLabel}>Cancelled</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Schedule</Text>
      <View style={styles.scheduleCard}>
        <View style={styles.scheduleRow}>
          <Ionicons name="calendar-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.scheduleText}>
            {sessionDate?.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </Text>
        </View>
        <View style={styles.scheduleRow}>
          <Ionicons name="time-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.scheduleText}>
            {session ? `${formatTime(session.startTime)} - ${formatTime(session.endTime)}` : ""}
          </Text>
        </View>
        <View style={styles.scheduleRow}>
          <Ionicons name="hourglass-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.scheduleText}>{session?.duration} minutes</Text>
        </View>
        <View style={styles.scheduleRow}>
          <Ionicons name="flash-outline" size={16} color={Colors.dark.gold} />
          <Text style={styles.scheduleText}>{xpPerSession} XP per session</Text>
        </View>
      </View>

      <View style={styles.playersHeader}>
        <Text style={styles.sectionTitle}>Active Players ({players.length})</Text>
      </View>
      {players.length === 0 ? (
        <View style={styles.emptyPlayers}>
          <Text style={styles.emptyPlayersText}>No players assigned</Text>
        </View>
      ) : (
        players.map((player) => {
          const ballLevelColor = getBallLevelColor(player.ballLevel);
          return (
            <View key={player.id} style={styles.playerRow}>
              <View style={[styles.playerAvatar, { borderColor: ballLevelColor }]}>
                <Text style={styles.playerAvatarText}>
                  {player.name?.charAt(0)?.toUpperCase() || "?"}
                </Text>
              </View>
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{player.name}</Text>
                {player.ballLevel && (
                  <View style={[styles.ballLevelBadge, { backgroundColor: ballLevelColor + "20" }]}>
                    <View style={[styles.ballLevelDot, { backgroundColor: ballLevelColor }]} />
                    <Text style={[styles.ballLevelText, { color: ballLevelColor }]}>
                      {player.ballLevel}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })
      )}

      {!hasFeedback && (
        <Pressable style={styles.addFeedbackButton} onPress={handleAddFeedback}>
          <LinearGradient
            colors={[Colors.dark.gold, Colors.dark.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.addFeedbackGradient}
          >
            <Ionicons name="flash" size={20} color={Colors.dark.buttonText} />
            <Text style={styles.addFeedbackText}>Add Feedback</Text>
          </LinearGradient>
        </Pressable>
      )}
    </View>
  );

  const renderTimelineTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.timelineItem}>
        <View style={[styles.timelineIndicator, { backgroundColor: accentColor }]}>
          <Ionicons 
            name={isCompleted ? "checkmark-circle" : "time"} 
            size={20} 
            color={Colors.dark.buttonText} 
          />
        </View>
        <View style={styles.timelineContent}>
          <Text style={styles.timelineDate}>
            {sessionDate?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          <Text style={styles.timelineTime}>
            {session ? `${formatTime(session.startTime)} - ${formatTime(session.endTime)}` : ""}
          </Text>
          <View style={[styles.timelineStatus, { backgroundColor: (isCompleted ? Colors.dark.primary : Colors.dark.gold) + "20" }]}>
            <Text style={[styles.timelineStatusText, { color: isCompleted ? Colors.dark.primary : Colors.dark.gold }]}>
              {isCompleted ? "Completed" : "Scheduled"}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderFeedbackTab = () => {
    if (feedbackLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      );
    }

    if (!hasFeedback) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubble-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyStateText}>No feedback yet</Text>
          <Pressable style={styles.addFeedbackButton} onPress={handleAddFeedback}>
            <LinearGradient
              colors={[Colors.dark.gold, Colors.dark.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.addFeedbackGradient}
            >
              <Ionicons name="flash" size={20} color={Colors.dark.buttonText} />
              <Text style={styles.addFeedbackText}>Add Feedback</Text>
            </LinearGradient>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        <View style={styles.feedbackCard}>
          <Text style={styles.feedbackCardTitle}>Session Feedback</Text>
          {feedbackData?.sessionFeedback?.intensity && (
            <View style={styles.feedbackRow}>
              <Text style={styles.feedbackLabel}>Intensity</Text>
              <Text style={styles.feedbackValue}>{feedbackData.sessionFeedback.intensity}</Text>
            </View>
          )}
          {feedbackData?.sessionFeedback?.mood && (
            <View style={styles.feedbackRow}>
              <Text style={styles.feedbackLabel}>Mood</Text>
              <Text style={styles.feedbackValue}>{feedbackData.sessionFeedback.mood}</Text>
            </View>
          )}
          {feedbackData?.sessionFeedback?.coachNotes && (
            <View style={styles.feedbackNotesContainer}>
              <Text style={styles.feedbackLabel}>Notes</Text>
              <Text style={styles.feedbackNotes}>{feedbackData.sessionFeedback.coachNotes}</Text>
            </View>
          )}
        </View>

        {feedbackData?.playerFeedback && feedbackData.playerFeedback.length > 0 && (
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackCardTitle}>Player Feedback</Text>
            {feedbackData.playerFeedback.map((pf) => {
              const player = players.find(p => p.id === pf.playerId);
              return (
                <View key={pf.id} style={styles.playerFeedbackItem}>
                  <Text style={styles.playerFeedbackName}>{player?.name || "Unknown"}</Text>
                  {pf.progressTrend && (
                    <View style={styles.feedbackRow}>
                      <Text style={styles.feedbackLabel}>Progress</Text>
                      <Text style={[
                        styles.feedbackValue,
                        pf.progressTrend === "up" && { color: Colors.dark.primary },
                        pf.progressTrend === "down" && { color: Colors.dark.error },
                      ]}>
                        {pf.progressTrend === "up" ? "▲ Improving" : pf.progressTrend === "down" ? "▼ Declining" : "→ Stable"}
                      </Text>
                    </View>
                  )}
                  {pf.effortLevel && (
                    <View style={styles.feedbackRow}>
                      <Text style={styles.feedbackLabel}>Effort</Text>
                      <Text style={styles.feedbackValue}>{pf.effortLevel}</Text>
                    </View>
                  )}
                  {pf.note && (
                    <Text style={styles.playerFeedbackNote}>{pf.note}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderProgressTab = () => (
    <View style={styles.tabContent}>
      {players.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="trending-up-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyStateText}>No players to track</Text>
        </View>
      ) : (
        <View style={styles.progressList}>
          {players.map((player) => (
            <View key={player.id} style={styles.progressPlayerRow}>
              <View style={styles.progressPlayerInfo}>
                <Text style={styles.progressPlayerName}>{player.name}</Text>
                <Text style={styles.progressPlayerSessions}>1 session</Text>
              </View>
              <View style={styles.playerXpBadge}>
                <Ionicons name="star" size={14} color={Colors.dark.gold} />
                <Text style={styles.playerXpValue}>{xpPerSession}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview": return renderOverviewTab();
      case "timeline": return renderTimelineTab();
      case "feedback": return renderFeedbackTab();
      case "progress": return renderProgressTab();
      default: return null;
    }
  };

  if (!visible || !session) return null;

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

          <View style={styles.header}>
            <LinearGradient
              colors={[accentColor + "30", "transparent"]}
              style={styles.headerGradient}
            />
            <View style={styles.headerContent}>
              <View style={styles.headerTop}>
                <View style={[styles.statusBadge, { backgroundColor: accentColor + "30" }]}>
                  <Text style={[styles.statusText, { color: accentColor }]}>
                    {isCompleted ? "COMPLETED" : "SCHEDULED"}
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={Colors.dark.text} />
                </Pressable>
              </View>
              <Text style={styles.title}>{displayTitle}</Text>
              <Text style={styles.subtitle}>
                {sessionDate?.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} - {session.sessionType.replace("_", " ")}
              </Text>
            </View>
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
                  size={18}
                  color={activeTab === tab.id ? accentColor : Colors.dark.textMuted}
                />
                <Text style={[styles.tabLabel, activeTab === tab.id && { color: accentColor }]}>
                  {tab.label}
                </Text>
                {activeTab === tab.id && (
                  <View style={[styles.tabIndicator, { backgroundColor: accentColor }]} />
                )}
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
        </View>
      </View>
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
    backgroundColor: Backgrounds.overlay,
    zIndex: 1,
  },
  drawer: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "90%",
    minHeight: "60%",
    zIndex: 2,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderBottomWidth: 0,
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
    borderColor: Colors.dark.backgroundRoot,
  },
  statCardHighlight: {
    borderColor: Colors.dark.primary + "50",
  },
  statCardUpcoming: {
    borderColor: Colors.dark.gold + "50",
  },
  statCardCancelled: {
    borderColor: Colors.dark.error + "50",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  statValueHighlight: {
    color: Colors.dark.primary,
  },
  statValueUpcoming: {
    color: Colors.dark.gold,
  },
  statValueCancelled: {
    color: Colors.dark.error,
  },
  statLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
  },
  sectionTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  scheduleCard: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  scheduleText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  playersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  emptyPlayers: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: "center",
  },
  emptyPlayersText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    marginRight: Spacing.md,
  },
  playerAvatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  ballLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  ballLevelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  ballLevelText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  addFeedbackButton: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  addFeedbackGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  addFeedbackText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  timelineItem: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  timelineIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineContent: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  timelineDate: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  timelineTime: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  timelineStatus: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  timelineStatusText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyStateText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  feedbackCard: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  feedbackCardTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
    paddingBottom: Spacing.sm,
  },
  feedbackRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
  },
  feedbackLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
  },
  feedbackValue: {
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  feedbackNotesContainer: {
    marginTop: Spacing.sm,
  },
  feedbackNotes: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.text,
    marginTop: 4,
    lineHeight: 18,
  },
  playerFeedbackItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  playerFeedbackName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.xs,
  },
  playerFeedbackNote: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    fontStyle: "italic",
  },
  progressList: {},
  progressPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  progressPlayerInfo: {
    flex: 1,
  },
  progressPlayerName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  progressPlayerSessions: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  playerXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  playerXpValue: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
});
