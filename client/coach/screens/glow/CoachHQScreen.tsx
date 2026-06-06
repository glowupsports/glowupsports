import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import BallLevelBadge from "@/components/BallLevelBadge";
import { RosterInsightsCard } from "@/coach/components/RosterInsightsCard";
import { getApiUrl, getAuthHeaders, apiRequest } from "@/lib/query-client";
import { useCoach } from "@/coach/context/CoachContext";

interface TodaySession {
  id: string;
  playerId: string;
  playerName: string;
  playerLevel: string;
  sport?: string | null;
  startTime: string;
  endTime: string;
  type: string;
  status: "scheduled" | "in_progress" | "completed";
  sessionPlanId?: string;
  locationId?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
}

interface QuickStat {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

interface GlowPlanFocusArea {
  title: string;
  description: string;
  drillSuggestion: string;
  timeTarget: string;
  pillar: string;
  rationale: string;
}

interface GlowPlan {
  id: string;
  playerId: string;
  playerName: string;
  weekStartDate: string;
  planJson: {
    focusAreas: GlowPlanFocusArea[];
    overallRationale: string;
  } | null;
  status: string;
  coachNotes: string | null;
  generatedAt: string;
  approvedAt: string | null;
}

const PILLAR_COLORS: Record<string, string> = {
  TECHNIQUE: "#10B981",
  TACTICAL: "#F59E0B",
  PHYSICAL: "#EF4444",
  MENTAL: "#8B5CF6",
  SOCIAL: "#EC4899",
  MATCH: "#3B82F6",
};

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export default function CoachHQScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { coach, academy } = useCoach();

  const { data: todaySessions = [], refetch } = useQuery<TodaySession[]>({
    queryKey: ["/api/coach/sessions/today"],
  });

  const { data: glowPlans = [], refetch: refetchPlans } = useQuery<GlowPlan[]>({
    queryKey: ["/api/coach/players/weekly-plans"],
    queryFn: async () => {
      const url = new URL("/api/coach/players/weekly-plans", getApiUrl());
      const r = await fetch(url.toString(), { headers: getAuthHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const approvePlanMutation = useMutation({
    mutationFn: async ({ planId, status, coachNotes }: { planId: string; status: string; coachNotes?: string }) => {
      return apiRequest("PATCH", `/api/coach/players/${planId}/weekly-plan`, { status, coachNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/players/weekly-plans"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const sessionLocations = useMemo(() => {
    const seen = new Set<string>();
    const locs: { id: string; name: string }[] = [];
    for (const s of todaySessions) {
      const name = s.locationName || s.locationAddress;
      const id = s.locationId || name;
      if (name && id && !seen.has(id)) {
        seen.add(id);
        locs.push({ id, name });
      }
    }
    return locs;
  }, [todaySessions]);

  const filteredSessions = useMemo(() => {
    if (!selectedLocationFilter) return todaySessions;
    return todaySessions.filter(s => {
      const id = s.locationId || s.locationName || s.locationAddress;
      return id === selectedLocationFilter;
    });
  }, [todaySessions, selectedLocationFilter]);

  const liveSession = useMemo(
    () => todaySessions.find(s => s.status === "in_progress") ?? null,
    [todaySessions]
  );

  const quickStats: QuickStat[] = [
    { label: "Sessions Today", value: todaySessions.length, icon: "calendar-outline", color: Colors.dark.xpCyan },
    { label: "Players", value: new Set(todaySessions.map(s => s.playerId)).size, icon: "people-outline", color: Colors.dark.primary },
    { label: "Completed", value: todaySessions.filter(s => s.status === "completed").length, icon: "checkmark-circle-outline", color: Colors.dark.successNeon },
    { label: "In Progress", value: todaySessions.filter(s => s.status === "in_progress").length, icon: "play-circle-outline", color: Colors.dark.orange },
  ];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchPlans()]);
    setRefreshing(false);
  }, [refetch, refetchPlans]);

  // Auto-redirect to live session when CoachHQ comes into focus
  const hasAutoNavigated = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasAutoNavigated.current) return;
      const liveSession = todaySessions.find((s) => s.status === "in_progress");
      if (liveSession) {
        hasAutoNavigated.current = true;
        navigation.navigate("ActiveSession", {
          sessionId: liveSession.id,
          planId: liveSession.sessionPlanId,
        });
      }
    }, [todaySessions, navigation])
  );
  // Reset the auto-navigate guard once all live sessions are done
  useEffect(() => {
    const hasLive = todaySessions.some((s) => s.status === "in_progress");
    if (!hasLive) hasAutoNavigated.current = false;
  }, [todaySessions]);

  const handleSessionPress = (session: TodaySession) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const now = new Date();
    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    const isActiveOrStarting =
      session.status === "in_progress" ||
      (start <= now && end >= now) ||
      (start > now && start.getTime() - now.getTime() < 30 * 60 * 1000);
    if (isActiveOrStarting) {
      navigation.navigate("ActiveSession", {
        sessionId: session.id,
        planId: session.sessionPlanId,
      });
    } else if (session.sessionPlanId) {
      navigation.navigate("ActiveSession", {
        sessionId: session.id,
        planId: session.sessionPlanId,
      });
    } else {
      navigation.navigate("SessionPlan", { sessionId: session.id, playerId: session.playerId });
    }
  };

  const getStatusColor = (status: TodaySession["status"]) => {
    switch (status) {
      case "completed": return Colors.dark.successNeon;
      case "in_progress": return Colors.dark.orange;
      default: return Colors.dark.xpCyan;
    }
  };

  const getStatusLabel = (status: TodaySession["status"]) => {
    switch (status) {
      case "completed": return "Done";
      case "in_progress": return "Live";
      default: return "Scheduled";
    }
  };

  const getStatusIcon = (status: TodaySession["status"]): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "completed": return "checkmark-circle";
      case "in_progress": return "radio-button-on";
      default: return "time-outline";
    }
  };

  const formatTime = (time: string) => {
    return time.substring(0, 5);
  };

  const greeting = getTimeOfDayGreeting();
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const heroName = coach?.name ? coach.name.split(" ")[0] : "Coach";
  const academyLabel = academy?.name ?? null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingBottom: insets.bottom + Spacing.xl,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.dark.primary}
        />
      }
    >
      {/* ── Hero Header ── */}
      <LinearGradient
        colors={["#0B0D10", "#131A0A", "#1A2B06"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: headerHeight + Spacing.xl }]}
      >
        {/* Decorative glow orb */}
        <View style={styles.heroGlowOrb} pointerEvents="none" />

        <ThemedText style={styles.heroGreeting}>{greeting}, {heroName}</ThemedText>
        {academyLabel ? (
          <ThemedText style={styles.heroAcademy}>{academyLabel}</ThemedText>
        ) : null}
        <ThemedText style={styles.heroDate}>{dateLabel}</ThemedText>

        {liveSession ? (
          <Pressable
            style={styles.livePill}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              navigation.navigate("ActiveSession", {
                sessionId: liveSession.id,
                planId: liveSession.sessionPlanId,
              });
            }}
          >
            <View style={styles.liveDot} />
            <ThemedText style={styles.livePillText}>
              Live: {liveSession.playerName}
            </ThemedText>
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.buttonText} />
          </Pressable>
        ) : null}
      </LinearGradient>

      <View style={styles.bodyContent}>
        {/* ── Stats Grid ── */}
        <View style={styles.statsGrid}>
          {quickStats.map((stat, index) => (
            <Card key={index} style={styles.statCard}>
              <View style={[styles.statIconCircle, { backgroundColor: stat.color + "20" }]}>
                <Ionicons name={stat.icon} size={22} color={stat.color} />
              </View>
              <ThemedText style={[styles.statValue, { color: stat.color }]}>{stat.value}</ThemedText>
              <ThemedText style={styles.statLabel}>{stat.label}</ThemedText>
            </Card>
          ))}
        </View>

        {/* ── Today's Sessions ── */}
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Today&apos;s Sessions</ThemedText>
          <Pressable
            onPress={() => navigation.navigate("AllSessions")}
            style={styles.viewAllButton}
          >
            <ThemedText style={styles.viewAllText}>View All</ThemedText>
            <Ionicons name="chevron-forward" size={16} color={Colors.dark.primary} />
          </Pressable>
        </View>

        {sessionLocations.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.locationFilterScroll}
          >
            <Pressable
              style={[styles.locationFilterChip, selectedLocationFilter === null && styles.locationFilterChipActive]}
              onPress={() => setSelectedLocationFilter(null)}
            >
              <ThemedText style={[styles.locationFilterChipText, selectedLocationFilter === null && styles.locationFilterChipTextActive]}>All</ThemedText>
            </Pressable>
            {sessionLocations.map((loc) => (
              <Pressable
                key={loc.id}
                style={[styles.locationFilterChip, selectedLocationFilter === loc.id && styles.locationFilterChipActive]}
                onPress={() => setSelectedLocationFilter(selectedLocationFilter === loc.id ? null : loc.id)}
              >
                <Ionicons name="location-outline" size={12} color={selectedLocationFilter === loc.id ? Colors.dark.primary : Colors.dark.disabled} />
                <ThemedText style={[styles.locationFilterChipText, selectedLocationFilter === loc.id && styles.locationFilterChipTextActive]} numberOfLines={1}>{loc.name}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {filteredSessions.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={48} color={Colors.dark.disabled} />
            <ThemedText style={styles.emptyText}>{selectedLocationFilter ? "No sessions at this location today" : "No sessions scheduled for today"}</ThemedText>
            {selectedLocationFilter ? null : (
              <Pressable style={styles.addButton}>
                <Ionicons name="add" size={20} color={Colors.dark.buttonText} />
                <ThemedText style={styles.addButtonText}>Schedule Session</ThemedText>
              </Pressable>
            )}
          </Card>
        ) : (
          filteredSessions.map((session) => {
            const statusColor = getStatusColor(session.status);
            const initials = session.playerName
              ? session.playerName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
              : "?";

            return (
              <Pressable
                key={session.id}
                style={styles.sessionCard}
                onPress={() => handleSessionPress(session)}
              >
                {/* Coloured left border stripe */}
                <View style={[styles.sessionStripe, { backgroundColor: statusColor }]} />

                <View style={styles.sessionInner}>
                  {/* Top row: avatar + name/type + status chip */}
                  <View style={styles.sessionTopRow}>
                    <View style={[styles.playerAvatar, { backgroundColor: statusColor + "25" }]}>
                      <ThemedText style={[styles.playerAvatarText, { color: statusColor }]}>{initials}</ThemedText>
                    </View>

                    <View style={styles.playerMeta}>
                      <View style={styles.playerNameRow}>
                        <ThemedText style={styles.playerName} numberOfLines={1}>{session.playerName}</ThemedText>
                        <BallLevelBadge levelId={session.playerLevel} sport={session.sport} size="small" showLabel={false} />
                      </View>
                      <ThemedText style={styles.sessionType}>{session.type}</ThemedText>
                    </View>

                    <View style={[styles.statusChip, { backgroundColor: statusColor + "20", borderColor: statusColor + "40" }]}>
                      <Ionicons name={getStatusIcon(session.status)} size={11} color={statusColor} />
                      <ThemedText style={[styles.statusChipText, { color: statusColor }]}>{getStatusLabel(session.status)}</ThemedText>
                    </View>
                  </View>

                  {/* Bottom row: time + location */}
                  <View style={styles.sessionMetaRow}>
                    <View style={styles.sessionMetaItem}>
                      <Ionicons name="time-outline" size={13} color={Colors.dark.disabled} />
                      <ThemedText style={styles.sessionMetaText}>
                        {formatTime(session.startTime)} – {formatTime(session.endTime)}
                      </ThemedText>
                    </View>
                    {(session.locationName || session.locationAddress) ? (
                      <View style={styles.sessionMetaItem}>
                        <Ionicons name="location-outline" size={13} color={Colors.dark.disabled} />
                        <ThemedText style={styles.sessionMetaText} numberOfLines={1}>
                          {session.locationName || session.locationAddress}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })
        )}

        <RosterInsightsCard />

        {/* Glow Plans — Weekly AI Training Plans */}
        <View style={styles.glowPlansSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.glowPlansTitleRow}>
              <Ionicons name="flash" size={18} color="#C8FF3D" />
              <ThemedText style={styles.sectionTitle}>Glow Plans</ThemedText>
            </View>
            <ThemedText style={styles.glowPlansSubtitle}>Weekly AI training plans</ThemedText>
          </View>

          {glowPlans.length === 0 ? (
            <Card style={styles.glowPlansEmptyCard}>
              <Ionicons name="flash-outline" size={32} color={Colors.dark.disabled} />
              <ThemedText style={styles.glowPlansEmptyText}>No plans yet for this week</ThemedText>
              <ThemedText style={styles.glowPlansEmptySubtext}>Plans are auto-generated Monday morning. You can also generate them manually from a player&apos;s profile.</ThemedText>
            </Card>
          ) : (
            glowPlans.map((plan) => {
              const isExpanded = expandedPlanId === plan.id;
              const isDraft = plan.status === "draft";
              const focusAreas = plan.planJson?.focusAreas ?? [];
              return (
                <Card key={plan.id} style={styles.glowPlanCard}>
                  <Pressable
                    style={styles.glowPlanCardHeader}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setExpandedPlanId(isExpanded ? null : plan.id);
                    }}
                  >
                    <View style={styles.glowPlanPlayerInfo}>
                      <ThemedText style={styles.glowPlanPlayerName}>{plan.playerName}</ThemedText>
                      <View style={[styles.glowPlanStatusBadge, { backgroundColor: isDraft ? Colors.dark.orange + "20" : Colors.dark.successNeon + "20" }]}>
                        <ThemedText style={[styles.glowPlanStatusText, { color: isDraft ? Colors.dark.orange : Colors.dark.successNeon }]}>
                          {isDraft ? "Pending Review" : "Approved"}
                        </ThemedText>
                      </View>
                    </View>
                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.dark.disabled} />
                  </Pressable>

                  <View style={styles.glowPlanFocusPreview}>
                    {focusAreas.slice(0, isExpanded ? focusAreas.length : 2).map((area, idx) => {
                      const pillarColor = PILLAR_COLORS[area.pillar?.toUpperCase()] || Colors.dark.primary;
                      return (
                        <View key={idx} style={[styles.glowPlanFocusRow, { borderLeftColor: pillarColor }]}>
                          <View style={styles.glowPlanFocusRowHeader}>
                            <View style={[styles.glowPlanPillarChip, { backgroundColor: pillarColor + "20" }]}>
                              <ThemedText style={[styles.glowPlanPillarChipText, { color: pillarColor }]}>{area.pillar}</ThemedText>
                            </View>
                            <ThemedText style={styles.glowPlanTimeTarget}>{area.timeTarget}</ThemedText>
                          </View>
                          <ThemedText style={styles.glowPlanFocusTitle}>{area.title}</ThemedText>
                          {isExpanded ? (
                            <>
                              <ThemedText style={styles.glowPlanFocusDesc}>{area.description}</ThemedText>
                              <View style={styles.glowPlanDrillRow}>
                                <Ionicons name="barbell-outline" size={12} color={Colors.dark.disabled} />
                                <ThemedText style={styles.glowPlanDrillText}>{area.drillSuggestion}</ThemedText>
                              </View>
                            </>
                          ) : null}
                        </View>
                      );
                    })}
                    {!isExpanded && focusAreas.length > 2 ? (
                      <ThemedText style={styles.glowPlanMoreText}>+{focusAreas.length - 2} more focus area{focusAreas.length - 2 !== 1 ? "s" : ""}</ThemedText>
                    ) : null}
                  </View>

                  {isDraft ? (
                    <View style={styles.glowPlanActions}>
                      <Pressable
                        style={[styles.glowPlanActionBtn, { backgroundColor: Colors.dark.successNeon + "20" }]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          approvePlanMutation.mutate({ planId: plan.id, status: "active" });
                        }}
                      >
                        <Ionicons name="checkmark-circle-outline" size={16} color={Colors.dark.successNeon} />
                        <ThemedText style={[styles.glowPlanActionText, { color: Colors.dark.successNeon }]}>Approve</ThemedText>
                      </Pressable>
                      <Pressable
                        style={[styles.glowPlanActionBtn, { backgroundColor: Colors.dark.disabled + "20" }]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          Alert.alert("Archive Plan", "Archive this plan and mark it inactive?", [
                            { text: "Cancel", style: "cancel" },
                            { text: "Archive", style: "destructive", onPress: () => approvePlanMutation.mutate({ planId: plan.id, status: "archived" }) },
                          ]);
                        }}
                      >
                        <Ionicons name="archive-outline" size={16} color={Colors.dark.disabled} />
                        <ThemedText style={[styles.glowPlanActionText, { color: Colors.dark.disabled }]}>Archive</ThemedText>
                      </Pressable>
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}
        </View>

        <View style={styles.quickActions}>
          <ThemedText style={styles.sectionTitle}>Quick Actions</ThemedText>
          <View style={styles.actionsRow}>
            <Pressable
              style={styles.quickActionCard}
              onPress={() => navigation.navigate("LevelCards")}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.dark.ballRed + "20" }]}>
                <Ionicons name="layers-outline" size={24} color={Colors.dark.ballRed} />
              </View>
              <ThemedText style={styles.actionLabel}>Level Cards</ThemedText>
            </Pressable>

            <Pressable
              style={styles.quickActionCard}
              onPress={() => navigation.navigate("MatchLogging")}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                <Ionicons name="trophy-outline" size={24} color={Colors.dark.xpCyan} />
              </View>
              <ThemedText style={styles.actionLabel}>Log Match</ThemedText>
            </Pressable>

            <Pressable
              style={styles.quickActionCard}
              onPress={() => navigation.navigate("EvidenceCapture")}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.dark.primary + "20" }]}>
                <Ionicons name="videocam-outline" size={24} color={Colors.dark.primary} />
              </View>
              <ThemedText style={styles.actionLabel}>Capture Evidence</ThemedText>
            </Pressable>

            <Pressable
              style={styles.quickActionCard}
              onPress={() => navigation.navigate("LessonTemplateLibrary")}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.dark.orange + "20" }]}>
                <Ionicons name="book-outline" size={24} color={Colors.dark.orange} />
              </View>
              <ThemedText style={styles.actionLabel}>Lesson Templates</ThemedText>
            </Pressable>

            <Pressable
              style={styles.quickActionCard}
              onPress={() => navigation.navigate("PlayerProgress")}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.dark.gold + "20" }]}>
                <Ionicons name="trending-up-outline" size={24} color={Colors.dark.gold} />
              </View>
              <ThemedText style={styles.actionLabel}>Progress</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },

  // ── Hero ──
  hero: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing["2xl"],
    overflow: "hidden",
    position: "relative",
  },
  heroGlowOrb: {
    position: "absolute",
    right: -60,
    top: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: Colors.dark.primary + "12",
  },
  heroGreeting: {
    fontSize: 30,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: -0.5,
  },
  heroAcademy: {
    fontSize: 13,
    color: Colors.dark.primary,
    fontWeight: "600",
    marginTop: 2,
    opacity: 0.85,
  },
  heroDate: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.xs,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.orange,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xl,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  livePillText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },

  // ── Body ──
  bodyContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },

  // ── Stats ──
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  statIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    fontWeight: "500",
  },

  // ── Section header ──
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  viewAllText: {
    fontSize: 14,
    color: Colors.dark.primary,
  },

  // ── Location filter ──
  locationFilterScroll: {
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
    flexDirection: "row",
  },
  locationFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: "transparent",
  },
  locationFilterChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
  locationFilterChipText: {
    fontSize: 12,
    color: Colors.dark.disabled,
  },
  locationFilterChipTextActive: {
    color: Colors.dark.primary,
  },

  // ── Session card ──
  sessionCard: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  sessionStripe: {
    width: 4,
    borderTopLeftRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.lg,
  },
  sessionInner: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sessionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  playerAvatarText: {
    fontSize: 15,
    fontWeight: "700",
  },
  playerMeta: {
    flex: 1,
    gap: 2,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  playerName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    flexShrink: 1,
  },
  sessionType: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  sessionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  sessionMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sessionMetaText: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
  },

  // ── Empty ──
  emptyCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },

  // ── Quick Actions ──
  quickActions: {
    marginTop: Spacing.xl,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  quickActionCard: {
    flex: 1,
    minWidth: "45%",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    gap: Spacing.sm,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 12,
    color: Colors.dark.text,
    textAlign: "center",
  },

  // ── Glow Plans ──
  glowPlansSection: {
    marginTop: Spacing.xl,
  },
  glowPlansTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  glowPlansSubtitle: {
    fontSize: 12,
    color: Colors.dark.disabled,
  },
  glowPlansEmptyCard: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  glowPlansEmptyText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.7,
    fontWeight: "600",
  },
  glowPlansEmptySubtext: {
    fontSize: 12,
    color: Colors.dark.disabled,
    textAlign: "center",
    lineHeight: 18,
  },
  glowPlanCard: {
    marginBottom: Spacing.md,
    padding: 0,
    overflow: "hidden",
  },
  glowPlanCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  glowPlanPlayerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  glowPlanPlayerName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  glowPlanStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  glowPlanStatusText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  glowPlanFocusPreview: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  glowPlanFocusRow: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    borderLeftWidth: 3,
    gap: 4,
  },
  glowPlanFocusRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  glowPlanPillarChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  glowPlanPillarChipText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  glowPlanTimeTarget: {
    fontSize: 10,
    color: Colors.dark.disabled,
  },
  glowPlanFocusTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  glowPlanFocusDesc: {
    fontSize: 12,
    color: Colors.dark.disabled,
    lineHeight: 17,
    marginTop: 2,
  },
  glowPlanDrillRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginTop: 4,
  },
  glowPlanDrillText: {
    fontSize: 11,
    color: Colors.dark.disabled,
    flex: 1,
    fontStyle: "italic",
    lineHeight: 15,
  },
  glowPlanMoreText: {
    fontSize: 11,
    color: Colors.dark.disabled,
    textAlign: "center",
    paddingVertical: Spacing.xs,
  },
  glowPlanActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  glowPlanActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  glowPlanActionText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
