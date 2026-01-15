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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { convertUTCTimeToLocal } from "@/lib/dateUtils";
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

type TabId = "overview" | "players" | "feedback";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "information-circle-outline" },
  { id: "players", label: "Players", icon: "people-outline" },
  { id: "feedback", label: "Feedback", icon: "chatbubble-outline" },
];

const SESSION_TYPE_COLORS: Record<string, string> = {
  private: Colors.dark.sessionPrivate,
  semi_private: Colors.dark.sessionSemiPrivate,
  group: Colors.dark.sessionGroup,
  physical: Colors.dark.sessionPhysical,
  activity: Colors.dark.sessionActivity,
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  private: "Private",
  semi_private: "Semi-Private",
  group: "Group",
  physical: "Physical",
  activity: "Activity",
};

function getBallLevelColor(level?: string | null): string {
  switch (level?.toUpperCase()) {
    case "BLUE": return "#3B82F6";
    case "RED": return "#EF4444";
    case "ORANGE": return "#F97316";
    case "GREEN": return "#22C55E";
    case "YELLOW": return "#EAB308";
    case "GLOW": return Colors.dark.gold;
    default: return Colors.dark.textMuted;
  }
}

export default function StandaloneSessionDetailDrawer({
  visible,
  session,
  onClose,
  onOpenFeedback,
}: StandaloneSessionDetailDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { academy, coach: currentCoach } = useCoach();
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

  const typeColor = session ? (SESSION_TYPE_COLORS[session.sessionType] || Colors.dark.sessionPrivate) : Colors.dark.sessionPrivate;
  const typeLabel = session ? (SESSION_TYPE_LABELS[session.sessionType] || session.sessionType) : "";

  const sessionDate = session?.sessionDate 
    ? new Date(session.sessionDate) 
    : session?.startTime 
      ? new Date(session.startTime) 
      : null;

  const formattedDate = sessionDate
    ? sessionDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })
    : "Unknown Date";

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const isCompleted = session?.status === "completed";
  const hasFeedback = !!feedbackData?.sessionFeedback;

  const handleAddFeedback = () => {
    if (session && onOpenFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onOpenFeedback(session);
    }
  };

  const players = session?.players || sessionPlayers.map(sp => sp.player);

  if (!visible || !session) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={[typeColor + "15", "transparent"]}
          style={styles.headerGradient}
        />
        
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerContent}>
            <View style={[styles.typeBadge, { backgroundColor: typeColor + "20" }]}>
              <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
              <Text style={[styles.typeText, { color: typeColor }]}>{typeLabel}</Text>
            </View>
            <Text style={styles.dateTitle}>{formattedDate}</Text>
            <Text style={styles.timeSubtitle}>
              {formatTime(session.startTime)} - {formatTime(session.endTime)} ({session.duration}min)
            </Text>
          </View>
        </View>

        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab(tab.id);
              }}
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={activeTab === tab.id ? Colors.dark.xpCyan : Colors.dark.textMuted}
              />
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === "overview" && (
            <View style={styles.overviewTab}>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, { borderColor: typeColor + "40" }]}>
                  <Ionicons name="people" size={24} color={typeColor} />
                  <Text style={styles.statValue}>{players.length}</Text>
                  <Text style={styles.statLabel}>Players</Text>
                </View>
                <View style={[styles.statCard, { borderColor: isCompleted ? Colors.dark.primary + "40" : Colors.dark.gold + "40" }]}>
                  <Ionicons 
                    name={isCompleted ? "checkmark-circle" : "time"} 
                    size={24} 
                    color={isCompleted ? Colors.dark.primary : Colors.dark.gold} 
                  />
                  <Text style={styles.statValue}>{isCompleted ? "Done" : "Pending"}</Text>
                  <Text style={styles.statLabel}>Status</Text>
                </View>
                <View style={[styles.statCard, { borderColor: hasFeedback ? Colors.dark.xpCyan + "40" : Colors.dark.textMuted + "40" }]}>
                  <Ionicons 
                    name={hasFeedback ? "chatbubble" : "chatbubble-outline"} 
                    size={24} 
                    color={hasFeedback ? Colors.dark.xpCyan : Colors.dark.textMuted} 
                  />
                  <Text style={styles.statValue}>{hasFeedback ? "Yes" : "No"}</Text>
                  <Text style={styles.statLabel}>Feedback</Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Session Info</Text>
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Ionicons name="calendar-outline" size={18} color={Colors.dark.textMuted} />
                    <Text style={styles.infoLabel}>Date</Text>
                    <Text style={styles.infoValue}>{formattedDate}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={18} color={Colors.dark.textMuted} />
                    <Text style={styles.infoLabel}>Time</Text>
                    <Text style={styles.infoValue}>{formatTime(session.startTime)} - {formatTime(session.endTime)}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="hourglass-outline" size={18} color={Colors.dark.textMuted} />
                    <Text style={styles.infoLabel}>Duration</Text>
                    <Text style={styles.infoValue}>{session.duration} minutes</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="tennisball-outline" size={18} color={Colors.dark.textMuted} />
                    <Text style={styles.infoLabel}>Type</Text>
                    <Text style={[styles.infoValue, { color: typeColor }]}>{typeLabel}</Text>
                  </View>
                </View>
              </View>

              {!hasFeedback && (
                <Pressable style={styles.addFeedbackButton} onPress={handleAddFeedback}>
                  <LinearGradient
                    colors={[Colors.dark.gold, Colors.dark.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.addFeedbackGradient}
                  >
                    <Ionicons name="flash" size={20} color="#000" />
                    <Text style={styles.addFeedbackText}>Add Feedback</Text>
                  </LinearGradient>
                </Pressable>
              )}
            </View>
          )}

          {activeTab === "players" && (
            <View style={styles.playersTab}>
              {playersLoading ? (
                <ActivityIndicator color={Colors.dark.xpCyan} size="large" />
              ) : players.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
                  <Text style={styles.emptyText}>No players in this session</Text>
                </View>
              ) : (
                players.map((player) => {
                  const ballLevelColor = getBallLevelColor(player.ballLevel);
                  return (
                    <View key={player.id} style={styles.playerCard}>
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
            </View>
          )}

          {activeTab === "feedback" && (
            <View style={styles.feedbackTab}>
              {feedbackLoading ? (
                <ActivityIndicator color={Colors.dark.xpCyan} size="large" />
              ) : !hasFeedback ? (
                <View style={styles.emptyState}>
                  <Ionicons name="chatbubble-outline" size={48} color={Colors.dark.textMuted} />
                  <Text style={styles.emptyText}>No feedback yet</Text>
                  <Pressable style={styles.addFeedbackButton} onPress={handleAddFeedback}>
                    <LinearGradient
                      colors={[Colors.dark.gold, Colors.dark.primary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.addFeedbackGradient}
                    >
                      <Ionicons name="flash" size={20} color="#000" />
                      <Text style={styles.addFeedbackText}>Add Feedback</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.feedbackContent}>
                  <View style={styles.feedbackCard}>
                    <Text style={styles.feedbackCardTitle}>Session Overview</Text>
                    {feedbackData.sessionFeedback?.intensity && (
                      <View style={styles.feedbackRow}>
                        <Text style={styles.feedbackLabel}>Intensity:</Text>
                        <Text style={styles.feedbackValue}>{feedbackData.sessionFeedback.intensity}</Text>
                      </View>
                    )}
                    {feedbackData.sessionFeedback?.mood && (
                      <View style={styles.feedbackRow}>
                        <Text style={styles.feedbackLabel}>Mood:</Text>
                        <Text style={styles.feedbackValue}>{feedbackData.sessionFeedback.mood}</Text>
                      </View>
                    )}
                    {feedbackData.sessionFeedback?.coachNotes && (
                      <View style={styles.feedbackNotesContainer}>
                        <Text style={styles.feedbackLabel}>Notes:</Text>
                        <Text style={styles.feedbackNotes}>{feedbackData.sessionFeedback.coachNotes}</Text>
                      </View>
                    )}
                  </View>

                  {feedbackData.playerFeedback && feedbackData.playerFeedback.length > 0 && (
                    <View style={styles.feedbackCard}>
                      <Text style={styles.feedbackCardTitle}>Player Feedback</Text>
                      {feedbackData.playerFeedback.map((pf) => {
                        const player = players.find(p => p.id === pf.playerId);
                        return (
                          <View key={pf.id} style={styles.playerFeedbackItem}>
                            <Text style={styles.playerFeedbackName}>{player?.name || "Unknown"}</Text>
                            {pf.progressTrend && (
                              <View style={styles.feedbackRow}>
                                <Text style={styles.feedbackLabel}>Progress:</Text>
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
                                <Text style={styles.feedbackLabel}>Effort:</Text>
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
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundElevated,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerContent: {
    alignItems: "flex-start",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  typeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.xs,
  },
  typeText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  dateTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  timeSubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    marginBottom: Spacing.md,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginRight: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: Colors.dark.xpCyan,
  },
  tabText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    marginLeft: Spacing.xs,
  },
  tabTextActive: {
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  overviewTab: {},
  statsGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: Spacing.xs,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  infoCard: {
    backgroundColor: Colors.dark.backgroundElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  infoLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.textMuted,
    marginLeft: Spacing.sm,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  addFeedbackButton: {
    marginTop: Spacing.md,
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
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  playersTab: {},
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.background,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
  playerAvatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  playerInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 4,
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
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  feedbackTab: {},
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  feedbackContent: {},
  feedbackCard: {
    backgroundColor: Colors.dark.backgroundElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  feedbackCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  feedbackRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
  },
  feedbackLabel: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  feedbackValue: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  feedbackNotesContainer: {
    marginTop: Spacing.sm,
  },
  feedbackNotes: {
    fontSize: 14,
    color: Colors.dark.text,
    marginTop: 4,
    lineHeight: 20,
  },
  playerFeedbackItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  playerFeedbackName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.xs,
  },
  playerFeedbackNote: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    fontStyle: "italic",
  },
});
