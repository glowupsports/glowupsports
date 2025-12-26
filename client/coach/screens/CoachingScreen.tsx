import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface ProgressSummary {
  skillArea: string;
  avgRating: number;
  trend: string;
}

interface PlayerWithProgress {
  id: string;
  name: string;
  ballLevel: string | null;
  progressSummary: ProgressSummary[];
  totalNotes: number;
  recentNote?: {
    content: string;
    category: string | null;
    createdAt: string | null;
  };
}

type TabType = "today" | "progress" | "plans";
type ProgressTrend = "up" | "stable" | "down";
type EffortLevel = "high" | "normal" | "low";
type Intensity = "light" | "normal" | "intense";

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status: string | null;
}

interface SessionFeedback {
  sessionId: string;
  intensity: Intensity;
  focusTags: string[];
  generalNote: string;
  playerFeedback: PlayerFeedback[];
}

interface PlayerFeedback {
  playerId: string;
  playerName: string;
  progressTrend: ProgressTrend;
  effortLevel: EffortLevel;
  note: string;
}

export default function CoachingScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>("today");

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Coaching</Text>
      </View>

      <View style={styles.tabBar}>
        {([
          { id: "today", label: "Vandaag", icon: "today-outline" },
          { id: "progress", label: "Voortgang", icon: "trending-up-outline" },
          { id: "plans", label: "Plannen", icon: "document-text-outline" },
        ] as const).map((tab) => (
          <Pressable
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(tab.id);
            }}
          >
            <Ionicons
              name={tab.icon as keyof typeof Ionicons.glyphMap}
              size={20}
              color={activeTab === tab.id ? Colors.dark.primary : Colors.dark.tabIconDefault}
            />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "today" ? (
        <TodayFeedbackTab insets={insets} />
      ) : activeTab === "progress" ? (
        <ProgressTab insets={insets} />
      ) : (
        <PlansTab insets={insets} />
      )}
    </View>
  );
}

function TodayFeedbackTab({ insets }: { insets: { bottom: number } }) {
  const { calendarData, isLoading } = useCoach();
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [intensity, setIntensity] = useState<Intensity>("normal");
  const [focusTags, setFocusTags] = useState<string[]>([]);
  const [generalNote, setGeneralNote] = useState("");

  const today = new Date();
  const todaysSessions = useMemo(() => {
    if (!calendarData?.ownSessions) return [];
    return calendarData.ownSessions
      .filter((session) => {
        const sessionDate = new Date(session.startTime);
        const endTime = new Date(session.endTime);
        return (
          sessionDate.getFullYear() === today.getFullYear() &&
          sessionDate.getMonth() === today.getMonth() &&
          sessionDate.getDate() === today.getDate() &&
          session.status !== "cancelled" &&
          endTime < new Date()
        );
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [calendarData?.ownSessions, today]);

  const availableTags = ["Movement", "Forehand", "Backhand", "Serve", "Volley", "Mental", "Footwork"];

  const toggleTag = (tag: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFocusTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const saveFeedbackMutation = useMutation({
    mutationFn: async (data: { sessionId: string; feedback: any }) => {
      return apiRequest("POST", `/api/coach/sessions/${data.sessionId}/feedback`, data.feedback);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      setSelectedSession(null);
      setIntensity("normal");
      setFocusTags([]);
      setGeneralNote("");
    },
    onError: (error: Error) => {
      Alert.alert("Fout", error.message || "Feedback opslaan mislukt");
    },
  });

  const handleSaveFeedback = () => {
    if (!selectedSession) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    saveFeedbackMutation.mutate({
      sessionId: selectedSession.id,
      feedback: {
        intensity,
        focusTags,
        generalNote,
      },
    });
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  if (selectedSession) {
    return (
      <ScrollView
        style={styles.feedbackForm}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.backRow} onPress={() => setSelectedSession(null)}>
          <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
          <Text style={styles.backText}>Terug naar overzicht</Text>
        </Pressable>

        <View style={styles.feedbackHeader}>
          <Text style={styles.feedbackTitle}>Session Feedback</Text>
          <Text style={styles.feedbackTime}>
            {formatTime(selectedSession.startTime)} - {formatTime(selectedSession.endTime)}
          </Text>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>Intensiteit</Text>
          <View style={styles.intensityRow}>
            {([
              { value: "light", label: "Light", color: Colors.dark.primary },
              { value: "normal", label: "Normal", color: Colors.dark.orange },
              { value: "intense", label: "Intense", color: Colors.dark.error },
            ] as const).map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.intensityButton,
                  intensity === opt.value && { backgroundColor: opt.color + "20", borderColor: opt.color },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIntensity(opt.value);
                }}
              >
                <View style={[styles.intensityDot, { backgroundColor: opt.color }]} />
                <Text
                  style={[
                    styles.intensityText,
                    intensity === opt.value && { color: opt.color },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>Focus gebieden</Text>
          <View style={styles.tagsGrid}>
            {availableTags.map((tag) => (
              <Pressable
                key={tag}
                style={[styles.tagChip, focusTags.includes(tag) && styles.tagChipActive]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[styles.tagText, focusTags.includes(tag) && styles.tagTextActive]}>
                  {tag}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>Algemene notitie (optioneel)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Korte notitie over de sessie..."
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={generalNote}
            onChangeText={setGeneralNote}
            multiline
            maxLength={200}
          />
        </View>

        <Pressable
          style={[styles.saveButton, saveFeedbackMutation.isPending && styles.saveButtonDisabled]}
          onPress={handleSaveFeedback}
          disabled={saveFeedbackMutation.isPending}
        >
          {saveFeedbackMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#FFF" />
              <Text style={styles.saveButtonText}>Feedback Opslaan</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionTitle}>Lessen van vandaag</Text>
      {todaysSessions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.dark.primary} />
          <Text style={styles.emptyText}>Geen afgeronde lessen vandaag</Text>
          <Text style={styles.emptySubtext}>Feedback verschijnt hier na elke les</Text>
        </View>
      ) : (
        todaysSessions.map((session) => {
          const needsFeedback = session.status !== "completed";
          return (
            <Pressable
              key={session.id}
              style={styles.sessionCard}
              onPress={() => needsFeedback && setSelectedSession(session)}
            >
              <View style={styles.sessionTime}>
                <Text style={styles.sessionTimeText}>{formatTime(session.startTime)}</Text>
                <Text style={styles.sessionDuration}>{session.duration}m</Text>
              </View>
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionType}>
                  {session.sessionType === "private"
                    ? "Prive"
                    : session.sessionType === "semi_private"
                    ? "Semi-Prive"
                    : session.sessionType === "group"
                    ? "Groep"
                    : session.sessionType}
                </Text>
                {needsFeedback ? (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingText}>Feedback open</Text>
                  </View>
                ) : (
                  <View style={styles.doneBadge}>
                    <Ionicons name="checkmark" size={14} color={Colors.dark.primary} />
                    <Text style={styles.doneText}>Afgerond</Text>
                  </View>
                )}
              </View>
              {needsFeedback ? (
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
              ) : null}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

function ProgressTab({ insets }: { insets: { bottom: number } }) {
  const { data: playersWithProgress = [], isLoading } = useQuery<PlayerWithProgress[]>({
    queryKey: ["/api/coach/players/progress"],
  });

  const SKILL_AREAS = [
    { key: "forehand", label: "Forehand", icon: "tennisball-outline" },
    { key: "backhand", label: "Backhand", icon: "tennisball-outline" },
    { key: "serve", label: "Service", icon: "arrow-up-outline" },
    { key: "volley", label: "Volley", icon: "hand-right-outline" },
    { key: "movement", label: "Beweging", icon: "footsteps-outline" },
    { key: "mental", label: "Mentaal", icon: "bulb-outline" },
  ];

  const getTrendIcon = (trend: string): keyof typeof Ionicons.glyphMap => {
    switch (trend) {
      case "up": return "trending-up";
      case "down": return "trending-down";
      default: return "remove";
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "up": return Colors.dark.primary;
      case "down": return Colors.dark.error;
      default: return Colors.dark.tabIconDefault;
    }
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return Colors.dark.primary;
    if (rating >= 3) return Colors.dark.gold;
    if (rating >= 2) return "#FF851B";
    return Colors.dark.error;
  };

  const getLevelColor = (level: string | null) => {
    switch (level?.toLowerCase()) {
      case "red": return "#FF4444";
      case "orange": return "#FF851B";
      case "green": return "#2ECC40";
      case "yellow": return "#FFDC00";
      case "glow": return "#00D4FF";
      default: return Colors.dark.disabled;
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Voortgang laden...</Text>
      </View>
    );
  }

  if (playersWithProgress.length === 0) {
    return (
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Speler Voortgang</Text>
        <View style={styles.emptyCard}>
          <Ionicons name="trending-up-outline" size={48} color={Colors.dark.xpCyan} />
          <Text style={styles.emptyText}>Geen spelers gevonden</Text>
          <Text style={styles.emptySubtext}>
            Voeg spelers toe om hun voortgang bij te houden
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionTitle}>Speler Voortgang</Text>
      <Text style={styles.sectionSubtitle}>{playersWithProgress.length} spelers</Text>

      {playersWithProgress.map((player) => {
        const hasProgress = player.progressSummary.some(p => p.avgRating > 0);
        
        return (
          <View key={player.id} style={styles.progressCard}>
            <View style={styles.progressCardHeader}>
              <View style={styles.playerAvatarSmall}>
                <Text style={styles.playerInitialSmall}>{player.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.progressPlayerInfo}>
                <Text style={styles.progressPlayerName}>{player.name}</Text>
                <View style={styles.progressMeta}>
                  {player.ballLevel ? (
                    <View style={styles.levelBadge}>
                      <View style={[styles.levelDotSmall, { backgroundColor: getLevelColor(player.ballLevel) }]} />
                      <Text style={styles.levelBadgeText}>{player.ballLevel}</Text>
                    </View>
                  ) : null}
                  {player.totalNotes > 0 ? (
                    <View style={styles.notesBadge}>
                      <Ionicons name="document-text-outline" size={12} color={Colors.dark.tabIconDefault} />
                      <Text style={styles.notesBadgeText}>{player.totalNotes}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {hasProgress ? (
              <View style={styles.skillGrid}>
                {SKILL_AREAS.map((skill) => {
                  const progress = player.progressSummary.find(p => p.skillArea === skill.key);
                  const rating = progress?.avgRating || 0;
                  const trend = progress?.trend || "stable";

                  return (
                    <View key={skill.key} style={styles.skillItem}>
                      <View style={styles.skillHeader}>
                        <Ionicons
                          name={skill.icon as keyof typeof Ionicons.glyphMap}
                          size={14}
                          color={Colors.dark.tabIconDefault}
                        />
                        <Text style={styles.skillLabel}>{skill.label}</Text>
                      </View>
                      <View style={styles.skillRating}>
                        {rating > 0 ? (
                          <>
                            <Text style={[styles.ratingValue, { color: getRatingColor(rating) }]}>
                              {rating.toFixed(1)}
                            </Text>
                            <Ionicons
                              name={getTrendIcon(trend)}
                              size={14}
                              color={getTrendColor(trend)}
                            />
                          </>
                        ) : (
                          <Text style={styles.noRating}>-</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.noProgressCard}>
                <Ionicons name="analytics-outline" size={24} color={Colors.dark.disabled} />
                <Text style={styles.noProgressText}>Nog geen voortgang</Text>
              </View>
            )}

            {player.recentNote ? (
              <View style={styles.recentNoteCard}>
                <Ionicons name="document-text-outline" size={14} color={Colors.dark.tabIconDefault} />
                <Text style={styles.recentNoteText} numberOfLines={2}>
                  {player.recentNote.content}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function PlansTab({ insets }: { insets: { bottom: number } }) {
  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionTitle}>Lesvoorbereiding</Text>
      <View style={styles.emptyCard}>
        <Ionicons name="document-text-outline" size={48} color={Colors.dark.gold} />
        <Text style={styles.emptyText}>Session Templates</Text>
        <Text style={styles.emptySubtext}>
          Maak templates voor je lessen en koppel ze aan je kalender
        </Text>
        <Pressable style={styles.createTemplateButton}>
          <Ionicons name="add-circle-outline" size={20} color={Colors.dark.primary} />
          <Text style={styles.createTemplateText}>Template maken</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xs,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  tabActive: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  tabText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  tabTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  emptyCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyText: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  emptySubtext: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  sessionTime: {
    alignItems: "center",
    minWidth: 50,
  },
  sessionTimeText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  sessionDuration: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  sessionInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  sessionType: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  pendingBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.dark.orange + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  pendingText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.orange,
    fontWeight: "500",
  },
  doneBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
  },
  doneText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.primary,
  },
  feedbackForm: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  backText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  feedbackHeader: {
    marginBottom: Spacing.xl,
  },
  feedbackTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  feedbackTime: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  feedbackSection: {
    marginBottom: Spacing.xl,
  },
  feedbackLabel: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  intensityRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  intensityButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  intensityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  intensityText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  tagsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  tagChip: {
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tagChipActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  tagText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  tagTextActive: {
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  noteInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    minHeight: 80,
    textAlignVertical: "top",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: "#FFF",
  },
  createTemplateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  createTemplateText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  sectionSubtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.lg,
  },
  progressCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  progressCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  playerAvatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  playerInitialSmall: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  progressPlayerInfo: {
    flex: 1,
  },
  progressPlayerName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  progressMeta: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: 2,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  levelDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  levelBadgeText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    textTransform: "capitalize",
  },
  notesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  notesBadgeText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  skillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  skillItem: {
    width: "31%",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  skillHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  skillLabel: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
  },
  skillRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingValue: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "700",
  },
  noRating: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.disabled,
  },
  noProgressCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
  },
  noProgressText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.disabled,
  },
  recentNoteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  recentNoteText: {
    flex: 1,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    fontStyle: "italic",
  },
});
