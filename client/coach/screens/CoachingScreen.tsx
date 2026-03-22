import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

const TAB_BAR_HEIGHT = 80;
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { convertUTCTimeToLocal } from "@/lib/dateUtils";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ObservationTrendChart } from "@/components/ObservationTrendChart";
import { NeoLoadoutPanel, NeoGlowBadge } from "@/components/NeoLoadoutPanel";
import { CoachingSeriesSection } from "@/coach/components/CoachingSeriesSection";
import SeriesDetailDrawer from "@/coach/components/SeriesDetailDrawer";
import StandaloneSessionDetailDrawer from "@/coach/components/StandaloneSessionDetailDrawer";
import CreateSessionWizard from "@/coach/components/CreateSessionWizard";
import QuickFeedbackModal from "@/coach/components/QuickFeedbackModal";

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
  totalXp: number;
  recentNote?: {
    content: string;
    category: string | null;
    createdAt: string | null;
  };
}

type TabType = "series" | "weekPlanner" | "today" | "progress" | "plans" | "levels" | "templates" | "levelCards" | "matchLog" | "sessionPlan";
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

interface SkillDomain {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  icon: string | null;
  sortOrder: number | null;
}

interface PlayerSkillState {
  id: string;
  playerId: string;
  domainId: string;
  progressValue: number;
  trend: string | null;
  momentum: string | null;
  confidenceScore: number | null;
  assessmentStatus: string | null;
  isFrozen: boolean | null;
  domain: SkillDomain | null;
  domainXp: number;
  observationCount: number;
  avgDelta: number;
  lastObservation: string | null;
}

interface PlayerXpData {
  totalXp: number;
  transactions: { id: string; xpAmount: number; source: string; description: string | null; createdAt: string }[];
}

interface ObservationTrend {
  domainId: string;
  history: { date: string; delta: number; direction: string }[];
  streakUp: number;
  streakDown: number;
  hasSpeedrunWarning: boolean;
  improvementRate: number;
  hasData: boolean;
  domain?: SkillDomain | null;
}

export default function CoachingScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<TabType>("series");
  const { coach } = useCoach();
  // Fetch coach XP and stats
  const { data: xpData } = useQuery<{ level: number; totalXp: number; currentLevelXp: number; nextLevelXp: number; xpProgress: number }>({
    queryKey: [`/api/coach/${coach?.id}/xp`],
    enabled: !!coach?.id,
  });

  const { data: statsData } = useQuery<{ sessionsCount: number; playersCount: number }>({
    queryKey: [`/api/coach/${coach?.id}/stats`],
    enabled: !!coach?.id,
  });
  const headerPulse = useSharedValue(0.4);
  const iconGlow = useSharedValue(1);

  useEffect(() => {
    headerPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    iconGlow.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const headerGlowStyle = useAnimatedStyle(() => ({
    opacity: headerPulse.value,
  }));

  const iconPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconGlow.value }],
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundRoot]}
        style={StyleSheet.absoluteFill}
      />

      {/* Compact Header */}
      
      <View style={styles.compactHeader}>
        <View style={styles.compactHeaderLeft}>
          <View style={styles.compactLevelBadge}>
            <Text style={styles.compactLevelText}>{xpData?.level ?? coach?.level ?? 1}</Text>
          </View>
          <View>
            <Text style={styles.compactTitle}>COACHING HQ</Text>
            <View style={styles.compactXpRow}>
              <View style={styles.compactXpBar}>
                <View style={[styles.compactXpFill, { width: `${xpData?.xpProgress ?? 65}%` }]} />
              </View>
              <Text style={styles.compactXpText}>{(xpData?.totalXp ?? coach?.totalXp ?? 0).toLocaleString()} XP</Text>
            </View>
          </View>
        </View>
        <View style={styles.compactHeaderRight}>
          <Text style={styles.compactStatValue}>{statsData?.sessionsCount ?? 0}</Text>
          <Text style={styles.compactStatLabel}>SESSIONS</Text>
        </View>
      </View>
      

      {/* Compact Pill Tabs */}
      
      <View style={styles.pillTabContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillTabScroll}
        >
          {([
            { id: "series", label: "Classes", icon: "layers", color: Colors.dark.xpCyan },
            { id: "weekPlanner", label: "Week View", icon: "calendar-outline", color: Colors.dark.primary },
            { id: "plans", label: "Plans", icon: "bulb", color: Colors.dark.gold },
          ] as const).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[styles.pillTab, isActive && styles.pillTabActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveTab(tab.id);
                }}
              >
                <View style={[
                  styles.pillTabIconContainer,
                  { backgroundColor: isActive ? (tab.color + "30") : Colors.dark.backgroundSecondary }
                ]}>
                  <Ionicons
                    name={tab.icon as keyof typeof Ionicons.glyphMap}
                    size={14}
                    color={isActive ? tab.color : Colors.dark.textMuted}
                  />
                </View>
                <Text style={[styles.pillTabText, isActive && styles.pillTabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      

      {/* Glow Tools Quick Access Row */}
      
      <View style={styles.glowToolsContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.glowToolsScroll}
        >
          <Pressable
            style={[styles.glowToolButton, activeTab === "templates" && styles.glowToolButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(activeTab === "templates" ? "series" : "templates");
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.xpCyan + "20" }, activeTab === "templates" && { backgroundColor: Colors.dark.xpCyan + "40" }]}>
              <Ionicons name="book-outline" size={18} color={Colors.dark.xpCyan} />
            </View>
            <Text style={[styles.glowToolLabel, activeTab === "templates" && { color: Colors.dark.xpCyan }]}>Templates</Text>
          </Pressable>

          <Pressable
            style={[styles.glowToolButton, activeTab === "levelCards" && styles.glowToolButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(activeTab === "levelCards" ? "series" : "levelCards");
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.primary + "20" }, activeTab === "levelCards" && { backgroundColor: Colors.dark.primary + "40" }]}>
              <Ionicons name="layers-outline" size={18} color={Colors.dark.primary} />
            </View>
            <Text style={[styles.glowToolLabel, activeTab === "levelCards" && { color: Colors.dark.primary }]}>Level Cards</Text>
          </Pressable>

          <Pressable
            style={styles.glowToolButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("EvidenceCapture", {});
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.successNeon + "20" }]}>
              <Ionicons name="videocam-outline" size={18} color={Colors.dark.successNeon} />
            </View>
            <Text style={styles.glowToolLabel}>Evidence</Text>
          </Pressable>

          <Pressable
            style={[styles.glowToolButton, activeTab === "matchLog" && styles.glowToolButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(activeTab === "matchLog" ? "series" : "matchLog");
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.orange + "20" }, activeTab === "matchLog" && { backgroundColor: Colors.dark.orange + "40" }]}>
              <Ionicons name="tennisball-outline" size={18} color={Colors.dark.orange} />
            </View>
            <Text style={[styles.glowToolLabel, activeTab === "matchLog" && { color: Colors.dark.orange }]}>Match Log</Text>
          </Pressable>

          <Pressable
            style={[styles.glowToolButton, activeTab === "sessionPlan" && styles.glowToolButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(activeTab === "sessionPlan" ? "series" : "sessionPlan");
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.gold + "20" }, activeTab === "sessionPlan" && { backgroundColor: Colors.dark.gold + "40" }]}>
              <Ionicons name="clipboard-outline" size={18} color={Colors.dark.gold} />
            </View>
            <Text style={[styles.glowToolLabel, activeTab === "sessionPlan" && { color: Colors.dark.gold }]}>Session Plan</Text>
          </Pressable>
        </ScrollView>
      </View>
      

      {activeTab === "series" ? (
        <SeriesTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "weekPlanner" ? (
        <WeekPlannerTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "today" ? (
        <TodayFeedbackTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "progress" ? (
        <ProgressTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "plans" ? (
        <PlansTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "levels" ? (
        <GlowLevelsTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "templates" ? (
        <TemplatesTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "levelCards" ? (
        <LevelCardsTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "matchLog" ? (
        <MatchLogTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "sessionPlan" ? (
        <SessionPlanTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : (
        <SeriesTab insets={insets} tabBarHeight={tabBarHeight} />
      )}
    </View>
  );
}

interface SessionPlayer {
  id: string;
  playerId: string;
  player: { id: string; name: string; ballLevel: string | null };
}

type SkillChipState = "stable" | "up" | "down";

interface SkillProgress {
  [skill: string]: SkillChipState;
}

type QuickSignal = "focused" | "smart_decisions" | "good_teammate" | "took_initiative" | "showed_respect" | "listened_well" | "fair_play";
type SocialIssue = "disruptive" | "poor_attitude" | "disrespect";

interface PlayerFeedbackState {
  playerId: string;
  playerName: string;
  progressTrend: ProgressTrend;
  effortLevel: EffortLevel;
  note: string;
  skillProgress: SkillProgress;
  quickSignals: QuickSignal[];
  socialIssue: SocialIssue | null;
}

interface DomainImpact {
  technical: "up" | "stable" | "down";
  mental: "up" | "stable" | "down";
  physical: "up" | "stable" | "down";
  social: "up" | "stable" | "down";
  tactical: "up" | "stable" | "down";
}

// XP rewards for providing feedback (to motivate coaches)
// Values based on session complexity and player count
const FEEDBACK_XP_REWARDS: Record<string, number> = {
  private: 25,
  semi_private: 35,
  group: 50,
  camp: 75,
  team_training: 60,
  clinic: 45,
  match: 30,
  assessment: 40,
  // Default fallback for unknown types
  default: 20,
};

function SeriesTab({ insets, tabBarHeight }: { insets: { bottom: number }; tabBarHeight: number }) {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [showSeriesDetail, setShowSeriesDetail] = useState(false);
  const [showCreateWizard, setShowCreateWizard] = useState(false);

  const handleSeriesPress = (series: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSeriesId(series.id);
    setShowSeriesDetail(true);
  };

  const handleCreatePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCreateWizard(true);
  };

  const handleCloseDetail = () => {
    setShowSeriesDetail(false);
    setSelectedSeriesId(null);
  };

  return (
    <>
      <ScrollView
        style={seriesStyles.scrollView}
        contentContainerStyle={[
          seriesStyles.scrollContent,
          { paddingBottom: tabBarHeight + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <CoachingSeriesSection
          onSeriesPress={handleSeriesPress}
          onCreatePress={handleCreatePress}
        />
      </ScrollView>
      <SeriesDetailDrawer
        visible={showSeriesDetail}
        seriesId={selectedSeriesId}
        onClose={handleCloseDetail}
      />
      <CreateSessionWizard
        visible={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
        createSeriesMode={true}
      />
    </>
  );
}

const seriesStyles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
  },
});

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getBallColor(level: string | null | undefined): string {
  switch (level?.toLowerCase()) {
    case "red": return "#FF4D4D";
    case "orange": return "#FF851B";
    case "green": return "#C8FF3D";
    case "yellow": return "#FFD700";
    case "blue": return "#4FC3F7";
    case "glow": return "#E040FB";
    default: return Colors.dark.textMuted;
  }
}

function getSessionTypeBadge(type: string | null | undefined) {
  switch (type) {
    case "group": return { label: "Group", color: Colors.dark.orange };
    case "private": return { label: "Private", color: Colors.dark.primary };
    case "semi_private": return { label: "Semi", color: Colors.dark.xpCyan };
    default: return { label: type || "Session", color: Colors.dark.textMuted };
  }
}

function WeekPlannerTab({ insets, tabBarHeight }: { insets: { bottom: number }; tabBarHeight: number }) {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [showSeriesDetail, setShowSeriesDetail] = useState(false);
  const { academy } = useCoach();
  const timezone = academy?.timezone || "Asia/Dubai";

  const { data: allSeries, isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ["/api/coach/series"],
  });

  const todayDayIndex = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone });
    const dayName = formatter.format(new Date());
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return dayMap[dayName] ?? new Date().getDay();
  }, [timezone]);

  const dayGroups = useMemo(() => {
    if (!allSeries) return [];
    const activeSeries = allSeries.filter((s: any) => s.status === "active" && s.dayOfWeek >= 0);
    const grouped = new Map<number, any[]>();
    for (const s of activeSeries) {
      const day = s.dayOfWeek;
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day)!.push(s);
    }
    for (const [, items] of grouped) {
      items.sort((a: any, b: any) => {
        const timeA = convertUTCTimeToLocal(a.startTime || "00:00", timezone);
        const timeB = convertUTCTimeToLocal(b.startTime || "00:00", timezone);
        return timeA.localeCompare(timeB);
      });
    }
    const orderedDays = [];
    for (let i = 0; i < 7; i++) {
      const dayIndex = (todayDayIndex + i) % 7;
      if (grouped.has(dayIndex)) {
        orderedDays.push({ day: dayIndex, series: grouped.get(dayIndex)! });
      }
    }
    return orderedDays;
  }, [allSeries, todayDayIndex, timezone]);

  const totalActive = useMemo(() => {
    if (!allSeries) return 0;
    return allSeries.filter((s: any) => s.status === "active" && s.dayOfWeek >= 0).length;
  }, [allSeries]);

  const totalPlayers = useMemo(() => {
    if (!allSeries) return 0;
    const uniquePlayerIds = new Set<string>();
    allSeries.filter((s: any) => s.status === "active" && s.dayOfWeek >= 0).forEach((s: any) => {
      (s.playerPreview || []).forEach((p: any) => uniquePlayerIds.add(p.id));
    });
    return uniquePlayerIds.size;
  }, [allSeries]);

  const totalPaused = useMemo(() => {
    if (!allSeries) return 0;
    return allSeries
      .filter((s: any) => s.status === "active" && s.dayOfWeek >= 0)
      .reduce((sum: number, s: any) => sum + (s.pausedCount || 0), 0);
  }, [allSeries]);

  const handleSeriesPress = (series: any) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedSeriesId(series.id);
    setShowSeriesDetail(true);
  };

  if (isLoading) {
    return (
      <View style={wpStyles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={wpStyles.loadingText}>Loading week overview...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={wpStyles.loadingContainer}>
        <Ionicons name="cloud-offline-outline" size={48} color={Colors.dark.textMuted} />
        <Text style={wpStyles.loadingText}>Could not load classes</Text>
        <Pressable
          style={{ backgroundColor: Colors.dark.primary + "20", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 }}
          onPress={() => refetch()}
        >
          <Text style={{ color: Colors.dark.primary, fontWeight: "600" }}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={wpStyles.scrollView}
        contentContainerStyle={[
          wpStyles.scrollContent,
          { paddingBottom: tabBarHeight + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={wpStyles.summaryRow}>
          <View style={wpStyles.summaryCard}>
            <Text style={wpStyles.summaryValue}>{totalActive}</Text>
            <Text style={wpStyles.summaryLabel}>Groups</Text>
          </View>
          <View style={wpStyles.summaryCard}>
            <Text style={wpStyles.summaryValue}>{totalPlayers}</Text>
            <Text style={wpStyles.summaryLabel}>Players</Text>
          </View>
          {totalPaused > 0 ? (
            <View style={[wpStyles.summaryCard, wpStyles.summaryCardPaused]}>
              <Text style={[wpStyles.summaryValue, { color: Colors.dark.orange }]}>{totalPaused}</Text>
              <Text style={wpStyles.summaryLabel}>On Holiday</Text>
            </View>
          ) : null}
        </View>

        {dayGroups.map(({ day, series: daySeries }) => {
          const isToday = day === todayDayIndex;
          return (
            <View key={day} style={wpStyles.daySection}>
              <View style={wpStyles.dayHeader}>
                <Text style={[wpStyles.dayTitle, isToday && { color: Colors.dark.primary }]}>
                  {DAY_NAMES[day]}
                </Text>
                {isToday ? (
                  <View style={wpStyles.todayBadge}>
                    <Text style={wpStyles.todayBadgeText}>TODAY</Text>
                  </View>
                ) : null}
                <Text style={wpStyles.dayCount}>{daySeries.length} {daySeries.length === 1 ? "class" : "classes"}</Text>
              </View>

              {daySeries.map((s: any) => {
                const badge = getSessionTypeBadge(s.sessionType);
                const players = s.playerPreview || [];
                const localStart = s.startTime ? convertUTCTimeToLocal(s.startTime, timezone) : "?";
                const endTime = (() => {
                  if (!localStart || localStart === "?" || !s.duration) return "";
                  const [h, m] = localStart.split(":").map(Number);
                  const totalMin = h * 60 + m + s.duration;
                  const eh = Math.floor(totalMin / 60) % 24;
                  const em = totalMin % 60;
                  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
                })();

                const maxCapacity = s.sessionType === "private" ? 1
                  : s.sessionType === "semi_private" ? Math.min(s.maxPlayers || 2, 3)
                  : s.maxPlayers || 6;

                return (
                  <Pressable
                    key={s.id}
                    style={({ pressed }) => [wpStyles.groupCard, pressed && { opacity: 0.85 }]}
                    onPress={() => handleSeriesPress(s)}
                  >
                    <View style={wpStyles.groupCardHeader}>
                      <View style={[wpStyles.typeBadge, { backgroundColor: badge.color + "25", borderColor: badge.color + "50" }]}>
                        <Text style={[wpStyles.typeBadgeText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                      <Text style={wpStyles.groupTime}>{localStart} - {endTime}</Text>
                      <View style={wpStyles.groupCapacity}>
                        <Text style={[
                          wpStyles.capacityText,
                          s.playerCount >= maxCapacity && { color: Colors.dark.orange },
                        ]}>
                          {s.playerCount}/{maxCapacity}
                        </Text>
                        <Ionicons name="people" size={14} color={Colors.dark.textMuted} />
                      </View>
                    </View>

                    {s.courtName || s.title ? (
                      <Text style={wpStyles.groupSubtitle} numberOfLines={1}>
                        {s.courtName ? `${s.courtName}` : ""}{s.title ? ` \u2022 ${s.title}` : ""}
                      </Text>
                    ) : null}

                    <View style={wpStyles.playerList}>
                      {players.map((p: any) => (
                        <View key={p.id} style={wpStyles.playerRow}>
                          <View style={[wpStyles.ballDot, { backgroundColor: getBallColor(p.ballLevel) }]} />
                          <Text style={wpStyles.playerName} numberOfLines={1}>{p.name}</Text>
                          {p.ballLevel ? (
                            <Text style={[wpStyles.playerBallLevel, { color: getBallColor(p.ballLevel) }]}>
                              {p.ballLevel}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                      {players.length === 0 ? (
                        <Text style={wpStyles.noPlayersText}>No active players</Text>
                      ) : null}
                    </View>

                    {s.pausedCount > 0 ? (
                      <View style={wpStyles.pausedRow}>
                        <Ionicons name="pause-circle-outline" size={14} color={Colors.dark.orange} />
                        <Text style={wpStyles.pausedText}>
                          {s.pausedCount} on holiday
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        {dayGroups.length === 0 ? (
          <View style={wpStyles.emptyContainer}>
            <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={wpStyles.emptyText}>No active classes found</Text>
          </View>
        ) : null}
      </ScrollView>

      <SeriesDetailDrawer
        visible={showSeriesDetail}
        seriesId={selectedSeriesId}
        onClose={() => {
          setShowSeriesDetail(false);
          setSelectedSeriesId(null);
        }}
      />
    </>
  );
}

const wpStyles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textMuted,
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: Spacing.md,
    alignItems: "center",
  },
  summaryCardPaused: {
    borderColor: "rgba(255,133,27,0.2)",
  },
  summaryValue: {
    color: Colors.dark.text,
    fontSize: 24,
    fontWeight: "700",
  },
  summaryLabel: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  daySection: {
    marginBottom: Spacing.xl,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  dayTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: "700",
  },
  todayBadge: {
    backgroundColor: Colors.dark.primary + "25",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  todayBadgeText: {
    color: Colors.dark.primary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  dayCount: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    marginLeft: "auto",
  },
  groupCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  groupCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  typeBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  groupTime: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  groupCapacity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  capacityText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  groupSubtitle: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginBottom: Spacing.sm,
  },
  playerList: {
    gap: 4,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 3,
  },
  ballDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  playerName: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    flex: 1,
  },
  playerBallLevel: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  noPlayersText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontStyle: "italic",
  },
  pausedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  pausedText: {
    color: Colors.dark.orange,
    fontSize: 12,
    fontWeight: "500",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: Spacing.md,
  },
  emptyText: {
    color: Colors.dark.textMuted,
    fontSize: 16,
  },
});

function TodayFeedbackTab({ insets, tabBarHeight }: { insets: { bottom: number }; tabBarHeight: number }) {
  const { coach } = useCoach();
  const queryClient = useQueryClient();
  
  // Period toggle: week or month view
  type ViewPeriod = "week" | "month";
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>("week");
  
  // Week/month offset for navigation (0 = current period, -1 = previous, +1 = next)
  const [periodOffset, setPeriodOffset] = useState(0);
  
  // Calculate the date string and query view based on period type
  const getPeriodDateString = (offset: number, period: ViewPeriod) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === "week") {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + (offset * 7)); // Sunday of the target week
      return weekStart.toISOString().split('T')[0];
    } else {
      const monthStart = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      return monthStart.toISOString().split('T')[0];
    }
  };
  
  const periodDateString = getPeriodDateString(periodOffset, viewPeriod);
  
  // Fetch calendar data for the selected period - this is separate from CoachContext
  const { data: periodCalendarData, isLoading } = useQuery<{ ownSessions: any[] }>({
    queryKey: [`/api/coach/calendar?date=${periodDateString}&view=${viewPeriod}`],
    enabled: !!coach?.id,
  });
  
  // Reset offset when switching period type
  const handlePeriodChange = (newPeriod: ViewPeriod) => {
    if (newPeriod !== viewPeriod) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setViewPeriod(newPeriod);
      setPeriodOffset(0);
    }
  };
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [detailSession, setDetailSession] = useState<any>(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>("normal");
  const [mood, setMood] = useState<"good" | "neutral" | "low">("neutral");
  const [focusTags, setFocusTags] = useState<string[]>([]);
  const [generalNote, setGeneralNote] = useState("");
  const [playerFeedback, setPlayerFeedback] = useState<PlayerFeedbackState[]>([]);
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());
  const [showSuccess, setShowSuccess] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState<string | null>(null); // playerId for skill selector
  // Per-player skill group expansion state: { playerId: Set<groupKey> }
  const [playerExpandedSkillGroups, setPlayerExpandedSkillGroups] = useState<Record<string, Set<string>>>({});
  // Status filter
  const [statusFilter, setStatusFilter] = useState<"all" | "complete" | "open" | "pending">("all");
  
  // Track expanded state for day accordions (moved to top to fix hook order)
  const [expandedDays, setExpandedDays] = useState<Set<string | number>>(new Set());

  const { data: sessionPlayers = [] } = useQuery<SessionPlayer[]>({
    queryKey: [`/api/coach/sessions/${selectedSession?.id}/players`],
    enabled: !!selectedSession,
  });

  // Determine if this is a private session (1 player) or group session (>1 player)
  const isPrivateSession = sessionPlayers.length === 1;

  // Default skills for tracking
  const skillChips = ["Forehand", "Backhand", "Serve", "Volley", "Movement", "Mental"];
  
  // Skill Groups for collapsible sections
  const skillGroups = [
    { key: "Technical", label: "Technical", skills: ["Forehand", "Backhand", "Serve", "Volley"] },
    { key: "Physical", label: "Physical", skills: ["Movement"] },
    { key: "Mental", label: "Mental", skills: ["Mental"] },
  ];
  
  const toggleSkillGroup = (playerId: string, groupKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerExpandedSkillGroups(prev => {
      const currentPlayerGroups = prev[playerId] || new Set(["Technical"]); // Default Technical open
      const next = new Set(currentPlayerGroups);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return { ...prev, [playerId]: next };
    });
  };
  
  const getPlayerExpandedGroups = (playerId: string): Set<string> => {
    return playerExpandedSkillGroups[playerId] || new Set(["Technical"]); // Default Technical open
  };

  React.useEffect(() => {
    if (sessionPlayers.length > 0) {
      const validPlayers = sessionPlayers.filter((sp) => sp.player && sp.player.name);
      setPlayerFeedback(
        validPlayers.map((sp) => ({
          playerId: sp.playerId,
          playerName: sp.player.name,
          progressTrend: "stable" as ProgressTrend,
          effortLevel: "normal" as EffortLevel,
          note: "",
          skillProgress: {},
          quickSignals: [],
          socialIssue: null,
        }))
      );
      // For private sessions, expand all players by default
      // For group sessions, collapse all players by default
      if (validPlayers.length === 1) {
        setExpandedPlayers(new Set(validPlayers.map(sp => sp.playerId)));
      } else {
        setExpandedPlayers(new Set());
      }
    }
  }, [sessionPlayers]);

  const togglePlayerExpanded = (playerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedPlayers(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const applyEffortToAll = (effortLevel: EffortLevel) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlayerFeedback(prev => prev.map(pf => ({ ...pf, effortLevel })));
  };

  const setAsExpected = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPlayerFeedback(prev => prev.map(pf => ({
      ...pf,
      progressTrend: "stable" as ProgressTrend,
      effortLevel: "normal" as EffortLevel,
      skillProgress: {},
      quickSignals: [],
      socialIssue: null,
    })));
    setIntensity("normal");
    setMood("neutral");
    setShowSkillSelector(null);
  };

  const toggleQuickSignal = (playerId: string, signal: QuickSignal) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerFeedback(prev => prev.map(pf => {
      if (pf.playerId !== playerId) return pf;
      const hasSignal = pf.quickSignals.includes(signal);
      return {
        ...pf,
        quickSignals: hasSignal 
          ? pf.quickSignals.filter(s => s !== signal)
          : [...pf.quickSignals, signal],
      };
    }));
  };

  const setSocialIssue = (playerId: string, issue: SocialIssue | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlayerFeedback(prev => prev.map(pf => {
      if (pf.playerId !== playerId) return pf;
      return { ...pf, socialIssue: pf.socialIssue === issue ? null : issue };
    }));
  };

  const calculateDomainImpact = (pf: PlayerFeedbackState): DomainImpact => {
    let technical: "up" | "stable" | "down" = "stable";
    let mental: "up" | "stable" | "down" = "stable";
    let physical: "up" | "stable" | "down" = "stable";
    let social: "up" | "stable" | "down" = "stable";
    let tactical: "up" | "stable" | "down" = "stable";

    const technicalSkills = ["Forehand", "Backhand", "Serve", "Volley"];
    const hasUpTechnical = technicalSkills.some(s => pf.skillProgress[s] === "up");
    const hasDownTechnical = technicalSkills.some(s => pf.skillProgress[s] === "down");
    if (hasUpTechnical) technical = "up";
    else if (hasDownTechnical) technical = "down";

    if (pf.skillProgress["Mental"] === "up" || mood === "good" || pf.quickSignals.includes("focused")) mental = "up";
    else if (pf.skillProgress["Mental"] === "down" || mood === "low") mental = "down";
    else if (pf.effortLevel === "high") mental = "up";

    if (pf.skillProgress["Movement"] === "up" || pf.effortLevel === "high" || intensity === "intense") physical = "up";
    else if (pf.skillProgress["Movement"] === "down" || pf.effortLevel === "low") physical = "down";

    const socialSignals: QuickSignal[] = ["good_teammate", "took_initiative", "showed_respect", "listened_well", "fair_play"];
    const hasSocialSignal = socialSignals.some(s => pf.quickSignals.includes(s));
    if (hasSocialSignal) social = "up";
    else if (pf.socialIssue) social = "down";
    // Passive Social growth: group sessions with normal+ effort = passive growth
    else if (sessionPlayers.length > 1 && pf.effortLevel === "high") social = "up";
    else if (sessionPlayers.length > 1 && pf.effortLevel !== "low") social = "stable";

    if (pf.quickSignals.includes("smart_decisions") || focusTags.includes("Positioning") || focusTags.includes("Shot choice")) tactical = "up";
    else if (pf.skillProgress["Shot choice"] === "up" || pf.skillProgress["Positioning"] === "up") tactical = "up";

    return { technical, mental, physical, social, tactical };
  };

  const cycleSkillState = (playerId: string, skill: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerFeedback(prev => prev.map(pf => {
      if (pf.playerId !== playerId) return pf;
      const currentState = pf.skillProgress[skill] || "stable";
      // Cycle: stable -> up -> down -> stable
      let nextState: SkillChipState = "stable";
      if (currentState === "stable") nextState = "up";
      else if (currentState === "up") nextState = "down";
      else nextState = "stable";
      
      const newSkillProgress = { ...pf.skillProgress };
      if (nextState === "stable") {
        delete newSkillProgress[skill];
      } else {
        newSkillProgress[skill] = nextState;
      }
      return { ...pf, skillProgress: newSkillProgress };
    }));
  };

  const getSkillChipStyle = (state: SkillChipState | undefined) => {
    switch (state) {
      case "up": return { backgroundColor: Colors.dark.primary + "20", borderColor: Colors.dark.primary };
      case "down": return { backgroundColor: Colors.dark.error + "20", borderColor: Colors.dark.error };
      default: return {};
    }
  };

  const getSkillChipIcon = (state: SkillChipState | undefined): keyof typeof Ionicons.glyphMap | null => {
    switch (state) {
      case "up": return "trending-up";
      case "down": return "trending-down";
      default: return null;
    }
  };

  const getSkillChipColor = (state: SkillChipState | undefined) => {
    switch (state) {
      case "up": return Colors.dark.primary;
      case "down": return Colors.dark.error;
      default: return Colors.dark.tabIconDefault;
    }
  };

  const updatePlayerFeedback = (
    playerId: string,
    field: keyof PlayerFeedbackState,
    value: string
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerFeedback((prev) =>
      prev.map((pf) => {
        if (pf.playerId !== playerId) return pf;
        
        // When progressTrend changes, auto-apply to focus skills
        if (field === "progressTrend" && focusTags.length > 0) {
          const newSkillProgress: SkillProgress = { ...pf.skillProgress };
          const currentTrend = pf.progressTrend;
          
          // Only auto-apply if switching from stable to up/down (initial selection)
          // Don't overwrite if already set (respects manual refinements)
          if (currentTrend === "stable" && (value === "up" || value === "down")) {
            // Apply the trend to all focus skills
            for (const skill of focusTags) {
              if (!(skill in newSkillProgress)) {
                newSkillProgress[skill] = value as SkillChipState;
              }
            }
          } else if (value === "stable") {
            // Clear skills when going back to stable
            for (const skill of focusTags) {
              delete newSkillProgress[skill];
            }
          }
          // If switching between up/down, keep existing skill selections
          
          return { ...pf, [field]: value, skillProgress: newSkillProgress } as PlayerFeedbackState;
        }
        
        return { ...pf, [field]: value } as PlayerFeedbackState;
      })
    );
    
    // Close skill selector when going to stable
    if (field === "progressTrend" && value === "stable") {
      setShowSkillSelector(null);
    }
  };

  // Helper to check if a session has feedback submitted (status is "completed")
  const hasSessionFeedback = (session: any) => session.status === "completed";

  // Get XP for a session type
  const getSessionXp = (sessionType: string): number => {
    return FEEDBACK_XP_REWARDS[sessionType] || FEEDBACK_XP_REWARDS.default;
  };

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

  const { data: domains = [] } = useQuery<SkillDomain[]>({
    queryKey: ["/api/progress/domains"],
  });
  
  // Filter STANDALONE sessions from the period calendar data (moved to top to fix hook order)
  const periodSessions = useMemo(() => {
    if (!periodCalendarData?.ownSessions) return [];
    
    return periodCalendarData.ownSessions
      .filter((session: any) => {
        const isStandalone = !session.seriesId;
        return isStandalone && session.status !== "cancelled";
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [periodCalendarData?.ownSessions]);
  
  // Apply status filter (moved to top to fix hook order)
  const filteredPeriodSessions = useMemo(() => {
    const hasSessionFeedbackCheck = (session: any) => session.status === "completed";
    if (statusFilter === "all") return periodSessions;
    return periodSessions.filter((session) => {
      const hasFeedback = hasSessionFeedbackCheck(session);
      switch (statusFilter) {
        case "complete": return hasFeedback;
        case "open": return !hasFeedback;
        case "pending": return !hasFeedback;
        default: return true;
      }
    });
  }, [periodSessions, statusFilter]);
  
  // Group by day of week (for week view) or by date (for month view) - moved to top
  const groupedByDay = useMemo(() => {
    const groups: Record<number | string, any[]> = {};
    for (const session of filteredPeriodSessions) {
      const sessionDate = new Date(session.startTime);
      const groupKey = viewPeriod === "week" 
        ? sessionDate.getDay() 
        : sessionDate.toISOString().split('T')[0];
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(session);
    }
    return groups;
  }, [filteredPeriodSessions, viewPeriod]);
  
  // Sort keys - for week view these are numbers (0-6), for month view these are date strings
  const sortedDays = useMemo(() => {
    const keys = Object.keys(groupedByDay);
    if (viewPeriod === "week") {
      return keys.map(Number).sort((a, b) => a - b);
    } else {
      return keys.sort((a, b) => a.localeCompare(b));
    }
  }, [groupedByDay, viewPeriod]);
  
  // Period status counts (moved to top to fix hook order)
  const periodStatusCounts = useMemo(() => {
    const hasSessionFeedbackCheck = (session: any) => session.status === "completed";
    const complete = periodSessions.filter(s => hasSessionFeedbackCheck(s)).length;
    const open = periodSessions.filter(s => !hasSessionFeedbackCheck(s)).length;
    return { complete, open, all: periodSessions.length };
  }, [periodSessions]);

  const saveFeedbackMutation = useMutation({
    mutationFn: async (data: { sessionId: string; feedback: any }) => {
      // Save session feedback
      await apiRequest("POST", `/api/coach/sessions/${data.sessionId}/feedback`, data.feedback);
      
      // Submit skill observations to Progress Engine V2 for each player
      const coachId = coach?.id;
      if (coachId && domains.length > 0) {
        for (const pf of data.feedback.playerFeedback) {
          // Derive direction from per-skill progress
          const skillProgress = pf.skillProgress || {};
          const upCount = Object.values(skillProgress).filter(s => s === "up").length;
          const downCount = Object.values(skillProgress).filter(s => s === "down").length;
          const overallDirection = upCount > downCount ? "up" : downCount > upCount ? "down" : "stable";
          
          const technicalDomain = domains.find(d => d.name === "technical");
          const mentalDomain = domains.find(d => d.name === "mental");
          
          const observations = [];
          
          // Technical domain observation based on per-skill progress
          if (technicalDomain) {
            const technicalSkills = ["Forehand", "Backhand", "Serve", "Volley"];
            const techUpCount = technicalSkills.filter(s => skillProgress[s] === "up").length;
            const techDownCount = technicalSkills.filter(s => skillProgress[s] === "down").length;
            const techDirection = techUpCount > techDownCount ? "up" : techDownCount > techUpCount ? "down" : overallDirection;
            
            observations.push({
              domainId: technicalDomain.id,
              direction: techDirection,
              effortLevel: pf.effortLevel,
              note: pf.note || null,
            });
          }
          
          // Mental domain observation based on mood or Mental skill
          if (mentalDomain) {
            const mentalSkillDirection = skillProgress["Mental"];
            const moodDirection = data.feedback.mood === "good" ? "up" : data.feedback.mood === "low" ? "down" : null;
            const mentalDirection = mentalSkillDirection || moodDirection || "stable";
            
            observations.push({
              domainId: mentalDomain.id,
              direction: mentalDirection,
              effortLevel: pf.effortLevel,
              note: null,
            });
          }

          if (observations.length > 0) {
            try {
              await apiRequest("POST", `/api/coach/sessions/${data.sessionId}/observations`, {
                playerId: pf.playerId,
                coachId,
                observations,
              });
            } catch (err) {
              console.error("Failed to submit observations for player:", pf.playerId, err);
            }
          }
        }
      }
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/progress/domains"] });
      // Show success overlay briefly
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setSelectedSession(null);
        setIntensity("normal");
        setMood("neutral");
        setFocusTags([]);
        setGeneralNote("");
        setPlayerFeedback([]);
      }, 1200);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to save feedback");
    },
  });

  const handleSaveFeedback = () => {
    if (!selectedSession) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Derive progressTrend from skillProgress for each player (for backward compatibility)
    const enrichedPlayerFeedback = playerFeedback.map(pf => {
      const upCount = Object.values(pf.skillProgress).filter(s => s === "up").length;
      const downCount = Object.values(pf.skillProgress).filter(s => s === "down").length;
      const derivedTrend: ProgressTrend = upCount > downCount ? "up" : downCount > upCount ? "down" : "stable";
      return { ...pf, progressTrend: derivedTrend };
    });
    
    saveFeedbackMutation.mutate({
      sessionId: selectedSession.id,
      feedback: {
        intensity,
        mood,
        focusTags,
        generalNote,
        playerFeedback: enrichedPlayerFeedback,
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
      <View style={{ flex: 1 }}>
        {showSuccess ? (
          <View style={styles.successOverlay}>
            <View style={styles.successContent}>
              <Ionicons name="checkmark-circle" size={64} color={Colors.dark.primary} />
              <Text style={styles.successText}>Feedback Saved</Text>
              <Text style={styles.successSubtext}>Progress updated for all players</Text>
            </View>
          </View>
        ) : null}
        <ScrollView
          style={styles.feedbackForm}
          contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
          showsVerticalScrollIndicator={false}
        >
          <Pressable style={styles.backRow} onPress={() => setSelectedSession(null)}>
            <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
            <Text style={styles.backText}>Back to overview</Text>
          </Pressable>

        <View style={styles.feedbackHeader}>
          <Text style={styles.feedbackTitle}>Session Feedback</Text>
          <Text style={styles.feedbackTime}>
            {formatTime(selectedSession.startTime)} - {formatTime(selectedSession.endTime)}
          </Text>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>Intensity</Text>
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
          <Text style={styles.feedbackLabel}>Observed Mood</Text>
          <View style={styles.intensityRow}>
            {([
              { value: "good", label: "Good", icon: "happy-outline" as const, color: Colors.dark.primary },
              { value: "neutral", label: "Neutral", icon: "remove-outline" as const, color: Colors.dark.orange },
              { value: "low", label: "Low", icon: "sad-outline" as const, color: Colors.dark.error },
            ] as const).map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.intensityButton,
                  mood === opt.value && { backgroundColor: opt.color + "20", borderColor: opt.color },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMood(opt.value);
                }}
              >
                <Ionicons name={opt.icon} size={18} color={mood === opt.value ? opt.color : Colors.dark.disabled} />
                <Text
                  style={[
                    styles.intensityText,
                    mood === opt.value && { color: opt.color },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>Session Focus (optional)</Text>
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

        {playerFeedback.length > 0 && (
          <View style={styles.feedbackSection}>
            <View style={styles.feedbackLabelRow}>
              <Text style={styles.feedbackLabel}>Player Feedback</Text>
              {playerFeedback.length > 1 ? (
                <View style={styles.quickActionsRow}>
                  <Pressable
                    style={styles.applyAllButton}
                    onPress={() => applyEffortToAll("normal")}
                  >
                    <Ionicons name="copy-outline" size={12} color={Colors.dark.tabIconDefault} />
                    <Text style={styles.applyAllText}>All Normal</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            
            {/* Quick action for standard sessions */}
            <Pressable
              style={styles.asExpectedButton}
              onPress={setAsExpected}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.dark.xpCyan} />
              <Text style={styles.asExpectedText}>Session went as expected</Text>
            </Pressable>

            {playerFeedback.map((pf) => {
              const isExpanded = expandedPlayers.has(pf.playerId);
              return (
                <View key={pf.playerId} style={styles.playerFeedbackCard}>
                  <Pressable 
                    style={styles.playerFeedbackHeader}
                    onPress={() => togglePlayerExpanded(pf.playerId)}
                  >
                    <Text style={styles.playerFeedbackName}>{pf.playerName}</Text>
                    <View style={styles.playerFeedbackHeaderRight}>
                      {!isExpanded ? (() => {
                        const upCount = Object.values(pf.skillProgress).filter(s => s === "up").length;
                        const downCount = Object.values(pf.skillProgress).filter(s => s === "down").length;
                        return (
                          <>
                            {upCount > 0 ? (
                              <View style={styles.headerProgressBadge}>
                                <Ionicons name="trending-up" size={10} color={Colors.dark.primary} />
                                <Text style={[styles.headerProgressText, { color: Colors.dark.primary }]}>{upCount}</Text>
                              </View>
                            ) : null}
                            {downCount > 0 ? (
                              <View style={styles.headerProgressBadge}>
                                <Ionicons name="trending-down" size={10} color={Colors.dark.error} />
                                <Text style={[styles.headerProgressText, { color: Colors.dark.error }]}>{downCount}</Text>
                              </View>
                            ) : null}
                          </>
                        );
                      })() : null}
                      <Ionicons 
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={Colors.dark.tabIconDefault}
                      />
                    </View>
                  </Pressable>
                  
                  {isExpanded ? (
                    <>
                      {/* Per-skill progress summary */}
                      {(() => {
                        const upCount = Object.values(pf.skillProgress).filter(s => s === "up").length;
                        const downCount = Object.values(pf.skillProgress).filter(s => s === "down").length;
                        const hasProgress = upCount > 0 || downCount > 0;
                        return hasProgress ? (
                          <View style={styles.skillProgressSummary}>
                            {upCount > 0 ? (
                              <View style={styles.skillProgressBadge}>
                                <Ionicons name="trending-up" size={12} color={Colors.dark.primary} />
                                <Text style={[styles.skillProgressBadgeText, { color: Colors.dark.primary }]}>
                                  {upCount} improved
                                </Text>
                              </View>
                            ) : null}
                            {downCount > 0 ? (
                              <View style={styles.skillProgressBadge}>
                                <Ionicons name="trending-down" size={12} color={Colors.dark.error} />
                                <Text style={[styles.skillProgressBadgeText, { color: Colors.dark.error }]}>
                                  {downCount} needs work
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null;
                      })()}

                      <View style={styles.playerFeedbackRow}>
                        <Text style={styles.playerFeedbackLabel}>Effort</Text>
                        <View style={styles.trendButtons}>
                          {([
                            { value: "high", label: "High", color: Colors.dark.primary },
                            { value: "normal", label: "Normal", color: Colors.dark.orange },
                            { value: "low", label: "Low", color: Colors.dark.error },
                          ] as const).map((opt) => (
                            <Pressable
                              key={opt.value}
                              style={[
                                styles.effortButton,
                                pf.effortLevel === opt.value && { backgroundColor: opt.color + "20", borderColor: opt.color },
                              ]}
                              onPress={() => updatePlayerFeedback(pf.playerId, "effortLevel", opt.value)}
                            >
                              <Text
                                style={[
                                  styles.effortButtonText,
                                  pf.effortLevel === opt.value && { color: opt.color },
                                ]}
                              >
                                {opt.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>

                      {/* Quick Signals Section */}
                      <View style={styles.quickSignalsSection}>
                        <Text style={styles.playerFeedbackLabel}>Quick Signals (optional)</Text>
                        <View style={styles.quickSignalsGrid}>
                          {([
                            { id: "focused" as QuickSignal, icon: "eye-outline" as const, label: "Focused", domain: "mental" },
                            { id: "smart_decisions" as QuickSignal, icon: "bulb-outline" as const, label: "Smart", domain: "tactical" },
                            { id: "good_teammate" as QuickSignal, icon: "people-outline" as const, label: "Teammate", domain: "social" },
                            { id: "took_initiative" as QuickSignal, icon: "hand-right-outline" as const, label: "Initiative", domain: "social" },
                            { id: "showed_respect" as QuickSignal, icon: "heart-outline" as const, label: "Respect", domain: "social" },
                            { id: "listened_well" as QuickSignal, icon: "ear-outline" as const, label: "Listened", domain: "social" },
                            { id: "fair_play" as QuickSignal, icon: "shield-checkmark-outline" as const, label: "Fair Play", domain: "social" },
                          ] as const).map((signal) => {
                            const isActive = pf.quickSignals.includes(signal.id);
                            return (
                              <Pressable
                                key={signal.id}
                                style={[
                                  styles.quickSignalChip,
                                  isActive && styles.quickSignalChipActive,
                                ]}
                                onPress={() => toggleQuickSignal(pf.playerId, signal.id)}
                              >
                                <Ionicons 
                                  name={signal.icon} 
                                  size={14} 
                                  color={isActive ? Colors.dark.primary : Colors.dark.tabIconDefault} 
                                />
                                <Text style={[
                                  styles.quickSignalText,
                                  isActive && styles.quickSignalTextActive,
                                ]}>
                                  {signal.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        
                        {/* Social Correction (hidden toggle) */}
                        <Pressable
                          style={styles.issueToggle}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (pf.socialIssue) {
                              setSocialIssue(pf.playerId, null);
                            } else {
                              setSocialIssue(pf.playerId, "disruptive");
                            }
                          }}
                        >
                          <Ionicons 
                            name={pf.socialIssue ? "warning" : "warning-outline"} 
                            size={12} 
                            color={pf.socialIssue ? Colors.dark.error : Colors.dark.tabIconDefault} 
                          />
                          <Text style={[
                            styles.issueToggleText,
                            pf.socialIssue && { color: Colors.dark.error },
                          ]}>
                            {pf.socialIssue ? "Issue observed" : "Issue observed?"}
                          </Text>
                        </Pressable>
                        
                        {pf.socialIssue ? (
                          <View style={styles.issueOptions}>
                            {([
                              { id: "disruptive" as SocialIssue, label: "Disruptive" },
                              { id: "poor_attitude" as SocialIssue, label: "Poor attitude" },
                              { id: "disrespect" as SocialIssue, label: "Disrespect" },
                            ] as const).map((issue) => (
                              <Pressable
                                key={issue.id}
                                style={[
                                  styles.issueChip,
                                  pf.socialIssue === issue.id && styles.issueChipActive,
                                ]}
                                onPress={() => setSocialIssue(pf.playerId, issue.id)}
                              >
                                <Text style={[
                                  styles.issueChipText,
                                  pf.socialIssue === issue.id && styles.issueChipTextActive,
                                ]}>
                                  {issue.label}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}
                      </View>

                      {/* Domain Preview Chips (read-only) */}
                      {(() => {
                        const impact = calculateDomainImpact(pf);
                        const domains = [
                          { key: "technical", label: "Tech", value: impact.technical },
                          { key: "mental", label: "Mental", value: impact.mental },
                          { key: "physical", label: "Physical", value: impact.physical },
                          { key: "social", label: "Social", value: impact.social },
                          { key: "tactical", label: "Tactical", value: impact.tactical },
                        ];
                        const hasAnyChange = domains.some(d => d.value !== "stable");
                        if (!hasAnyChange) return null;
                        return (
                          <View style={styles.domainPreviewSection}>
                            <Text style={styles.domainPreviewLabel}>Core Impact (auto)</Text>
                            <View style={styles.domainPreviewGrid}>
                              {domains.map((d) => (
                                <View 
                                  key={d.key} 
                                  style={[
                                    styles.domainPreviewChip,
                                    d.value === "up" && styles.domainPreviewUp,
                                    d.value === "down" && styles.domainPreviewDown,
                                  ]}
                                >
                                  {d.value === "up" ? (
                                    <Ionicons name="arrow-up" size={10} color={Colors.dark.primary} />
                                  ) : d.value === "down" ? (
                                    <Ionicons name="arrow-down" size={10} color={Colors.dark.error} />
                                  ) : null}
                                  <Text style={[
                                    styles.domainPreviewText,
                                    d.value === "up" && { color: Colors.dark.primary },
                                    d.value === "down" && { color: Colors.dark.error },
                                  ]}>
                                    {d.label}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        );
                      })()}

                      <View style={styles.skillChipsSection}>
                        <Text style={styles.playerFeedbackLabel}>Skills (tap to toggle)</Text>
                        {/* Skill Groups - Collapsible (per-player) */}
                        {skillGroups.map((group) => {
                          const playerGroups = getPlayerExpandedGroups(pf.playerId);
                          const isExpanded = playerGroups.has(group.key);
                          const groupSkillsWithState = group.skills.filter(s => pf.skillProgress[s]);
                          const hasUpSkills = group.skills.some(s => pf.skillProgress[s] === "up");
                          const hasDownSkills = group.skills.some(s => pf.skillProgress[s] === "down");
                          
                          return (
                            <View key={group.key} style={styles.skillGroupContainer}>
                              <Pressable 
                                style={styles.skillGroupHeader}
                                onPress={() => toggleSkillGroup(pf.playerId, group.key)}
                              >
                                <View style={styles.skillGroupHeaderLeft}>
                                  <Ionicons 
                                    name={isExpanded ? "chevron-down" : "chevron-forward"} 
                                    size={16} 
                                    color={Colors.dark.tabIconDefault} 
                                  />
                                  <Text style={styles.skillGroupLabel}>{group.label}</Text>
                                  {!isExpanded && groupSkillsWithState.length > 0 ? (
                                    <View style={styles.skillGroupBadge}>
                                      {hasUpSkills ? (
                                        <Ionicons name="trending-up" size={10} color={Colors.dark.primary} />
                                      ) : hasDownSkills ? (
                                        <Ionicons name="trending-down" size={10} color={Colors.dark.error} />
                                      ) : null}
                                      <Text style={[
                                        styles.skillGroupBadgeText,
                                        hasUpSkills && { color: Colors.dark.primary },
                                        hasDownSkills && { color: Colors.dark.error },
                                      ]}>
                                        {groupSkillsWithState.length}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              </Pressable>
                              {isExpanded ? (
                                <View style={styles.skillChipsGrid}>
                                  {group.skills.sort((a, b) => {
                                    const aFocused = focusTags.includes(a);
                                    const bFocused = focusTags.includes(b);
                                    if (aFocused && !bFocused) return -1;
                                    if (!aFocused && bFocused) return 1;
                                    return 0;
                                  }).map((skill) => {
                                    const state = pf.skillProgress[skill];
                                    const icon = getSkillChipIcon(state);
                                    const isFocused = focusTags.includes(skill);
                                    return (
                                      <Pressable
                                        key={skill}
                                        style={[
                                          styles.skillChip,
                                          isFocused && !state && styles.skillChipFocused,
                                          getSkillChipStyle(state),
                                        ]}
                                        onPress={() => cycleSkillState(pf.playerId, skill)}
                                      >
                                        {isFocused && !state ? (
                                          <Ionicons name="star" size={10} color={Colors.dark.gold} />
                                        ) : icon ? (
                                          <Ionicons name={icon} size={12} color={getSkillChipColor(state)} />
                                        ) : null}
                                        <Text style={[
                                          styles.skillChipText, 
                                          { color: getSkillChipColor(state) },
                                          isFocused && !state && { color: Colors.dark.gold },
                                        ]}>
                                          {skill}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                        {/* Warning when too many skills (>7) marked as improved */}
                        {Object.values(pf.skillProgress).filter(s => s === "up").length > 7 ? (
                          <View style={styles.skillWarning}>
                            <Ionicons name="warning-outline" size={14} color={Colors.dark.orange} />
                            <Text style={styles.skillWarningText}>
                              Many skills improved - consider focusing on key areas
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <TextInput
                        style={styles.playerNoteInput}
                        placeholder="Optional coach note..."
                        placeholderTextColor={Colors.dark.tabIconDefault}
                        value={pf.note}
                        onChangeText={(text) => updatePlayerFeedback(pf.playerId, "note", text)}
                        maxLength={100}
                      />
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>General note (optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Short note about the session..."
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
            <ActivityIndicator size="small" color={Colors.dark.buttonText} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.buttonText} />
              <Text style={styles.saveButtonText}>Save Feedback</Text>
            </>
          )}
        </Pressable>
        </ScrollView>
      </View>
    );
  }

  // State for accordion expansion is defined as expandedDays below
  
  // Calculate the period's date range for display
  const getPeriodRange = (offset: number, period: ViewPeriod) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === "week") {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + (offset * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      return { start: weekStart, end: weekEnd };
    } else {
      const monthStart = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + offset + 1, 1);
      return { start: monthStart, end: monthEnd };
    }
  };
  
  const periodRange = getPeriodRange(periodOffset, viewPeriod);
  
  const formatPeriodLabel = () => {
    const { start, end } = periodRange;
    if (viewPeriod === "month") {
      return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    // Week view
    const endForDisplay = new Date(end);
    endForDisplay.setDate(endForDisplay.getDate() - 1);
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = endForDisplay.toLocaleDateString('en-US', { month: 'short' });
    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()} - ${endForDisplay.getDate()}`;
    }
    return `${startMonth} ${start.getDate()} - ${endMonth} ${endForDisplay.getDate()}`;
  };
  
  const isCurrentPeriod = periodOffset === 0;
  
  const toggleDay = (day: string | number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };
  
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <>
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Period Toggle (Week/Month) */}
      <View style={styles.periodToggleRow}>
        {(["week", "month"] as const).map((period) => {
          const isActive = viewPeriod === period;
          return (
            <Pressable
              key={period}
              style={[
                styles.periodToggleButton,
                isActive && styles.periodToggleButtonActive,
              ]}
              onPress={() => handlePeriodChange(period)}
            >
              <Text style={[
                styles.periodToggleText,
                isActive && styles.periodToggleTextActive,
              ]}>
                {period === "week" ? "Week" : "Month"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Period Navigation Header */}
      <View style={styles.weekNavHeader}>
        <Pressable 
          style={styles.weekNavArrow} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPeriodOffset(prev => prev - 1);
          }}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.dark.primary} />
        </Pressable>
        
        <View style={styles.weekNavCenter}>
          <Text style={styles.weekNavLabel}>
            {isCurrentPeriod 
              ? (viewPeriod === "week" ? "This Week" : "This Month") 
              : formatPeriodLabel()
            }
          </Text>
          {!isCurrentPeriod ? (
            <Pressable 
              style={styles.todayButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setPeriodOffset(0);
              }}
            >
              <Text style={styles.todayButtonText}>Today</Text>
            </Pressable>
          ) : null}
        </View>
        
        <Pressable 
          style={styles.weekNavArrow} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPeriodOffset(prev => prev + 1);
          }}
        >
          <Ionicons name="chevron-forward" size={22} color={Colors.dark.primary} />
        </Pressable>
      </View>

      {/* Status Filter Pills */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.calmStatusScroll}
        contentContainerStyle={styles.calmStatusContent}
      >
        {([
          { id: "all" as const, label: "All", count: periodStatusCounts.all, icon: null, color: Colors.dark.primary },
          { id: "open" as const, label: "Needs Feedback", count: periodStatusCounts.open, icon: "alert-circle" as const, color: Colors.dark.gold },
          { id: "complete" as const, label: "Completed", count: periodStatusCounts.complete, icon: "checkmark-circle" as const, color: Colors.dark.primary },
        ]).map((status) => {
          const isActive = statusFilter === status.id;
          return (
            <Pressable
              key={status.id}
              style={[
                styles.calmStatusPill,
                isActive && { backgroundColor: status.color + "20", borderColor: status.color },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStatusFilter(status.id);
              }}
            >
              {status.icon ? (
                <Ionicons 
                  name={status.icon} 
                  size={14} 
                  color={isActive ? status.color : Colors.dark.tabIconDefault}
                />
              ) : null}
              <Text style={[styles.calmStatusText, isActive && { color: status.color }]}>
                {status.label} ({status.count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Day Accordion Rows */}
      <View style={styles.dayAccordionContainer}>
        {sortedDays.length === 0 ? (
          <View style={styles.calmEmptyCard}>
            <View style={styles.calmEmptyIcon}>
              <Ionicons name="checkmark-done" size={26} color={Colors.dark.tabIconDefault} />
            </View>
            <Text style={styles.calmEmptyText}>
              {periodSessions.length === 0 
                ? `No standalone lessons this ${viewPeriod}`
                : "No matching lessons"
              }
            </Text>
            <Text style={styles.calmEmptySubtext}>
              {periodSessions.length === 0 
                ? "One-off lessons not part of a class appear here"
                : "Try selecting a different filter"
              }
            </Text>
          </View>
        ) : (
          sortedDays.map((dayKey) => {
            const daySessions = groupedByDay[dayKey] || [];
            const isExpanded = expandedDays.has(dayKey);
            const needsFeedbackCount = daySessions.filter(s => s.status !== "completed").length;
            
            // Format day header based on view period
            const getDayLabel = () => {
              if (viewPeriod === "week") {
                return DAY_NAMES[dayKey as number];
              } else {
                // For month view, show "Mon Jan 13" format
                const date = new Date(dayKey as string);
                return date.toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                });
              }
            };
            
            return (
              <View key={String(dayKey)} style={styles.dayAccordion}>
                <Pressable 
                  style={styles.dayAccordionHeader}
                  onPress={() => toggleDay(dayKey)}
                >
                  <View style={styles.dayAccordionLeft}>
                    <Ionicons 
                      name={isExpanded ? "chevron-down" : "chevron-forward"} 
                      size={20} 
                      color={Colors.dark.gold} 
                    />
                    <Text style={styles.dayAccordionTitle}>{getDayLabel()}</Text>
                  </View>
                  <View style={styles.dayAccordionRight}>
                    {needsFeedbackCount > 0 ? (
                      <View style={styles.dayFeedbackBadge}>
                        <Ionicons name="alert-circle" size={12} color={Colors.dark.gold} />
                        <Text style={styles.dayFeedbackBadgeText}>{needsFeedbackCount}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.dayAccordionCount}>{daySessions.length}</Text>
                    <Text style={styles.dayAccordionLabel}>
                      {daySessions.length === 1 ? "lesson" : "lessons"}
                    </Text>
                  </View>
                </Pressable>
                
                {isExpanded ? (
                  <View style={styles.dayAccordionContent}>
                    {daySessions.map((session) => {
                      const needsFeedback = session.status !== "completed";
                      const sessionXp = getSessionXp(session.sessionType);
                      const players = session.players || [];
                      
                      const getTypeColor = (type: string) => {
                        switch (type) {
                          case "private": return Colors.dark.sessionPrivate;
                          case "semi_private": return Colors.dark.sessionSemiPrivate;
                          case "group": return Colors.dark.sessionGroup;
                          case "physical": return Colors.dark.sessionPhysical;
                          case "activity": return Colors.dark.sessionActivity;
                          default: return Colors.dark.sessionPrivate;
                        }
                      };
                      
                      const getBallLevelColor = (level?: string) => {
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
                      };
                      
                      const typeColor = getTypeColor(session.sessionType);
                      const primaryBallLevel = players[0]?.ballLevel;
                      const ballLevelColor = getBallLevelColor(primaryBallLevel);
                      
                      const sessionDate = session.sessionDate ? new Date(session.sessionDate) : null;
                      const formattedDate = sessionDate 
                        ? sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                        : null;
                      
                      return (
                        <Pressable
                          key={session.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setDetailSession(session);
                            setShowDetailDrawer(true);
                          }}
                          style={[
                            styles.richSessionCard,
                            needsFeedback && styles.richSessionCardNeedsFeedback,
                          ]}
                        >
                          <View style={[styles.richSessionHeader, { borderBottomColor: typeColor + '40' }]}>
                            <View style={styles.richSessionTimeRow}>
                              <View style={[styles.richSessionTimeBadge, { backgroundColor: typeColor + '20' }]}>
                                <Ionicons name="time-outline" size={12} color={typeColor} />
                                <Text style={[styles.richSessionTimeText, { color: typeColor }]}>
                                  {formatTime(session.startTime)}
                                </Text>
                              </View>
                              <View style={styles.richSessionTypeBadge}>
                                <Text style={styles.richSessionTypeText}>
                                  {session.sessionType === "private" ? "Private" 
                                    : session.sessionType === "semi_private" ? "Semi"
                                    : session.sessionType === "group" ? "Group"
                                    : session.sessionType === "physical" ? "Physical"
                                    : session.sessionType === "activity" ? "Activity"
                                    : session.sessionType}
                                </Text>
                              </View>
                              <Text style={styles.richSessionDuration}>{session.duration}m</Text>
                              {formattedDate ? (
                                <View style={styles.sessionDateBadge}>
                                  <Ionicons name="calendar-outline" size={10} color={Colors.dark.xpCyan} />
                                  <Text style={styles.sessionDateText}>{formattedDate}</Text>
                                </View>
                              ) : null}
                            </View>
                            {primaryBallLevel ? (
                              <View style={[styles.ballLevelBadge, { backgroundColor: ballLevelColor + '20', borderColor: ballLevelColor }]}>
                                <View style={[styles.ballLevelDot, { backgroundColor: ballLevelColor }]} />
                                <Text style={[styles.ballLevelText, { color: ballLevelColor }]}>
                                  {primaryBallLevel}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          
                          <View style={styles.richSessionBody}>
                            <View style={styles.richSessionPlayersRow}>
                              <View style={styles.playerAvatarStack}>
                                {players.slice(0, 3).map((player: any, idx: number) => (
                                  <View 
                                    key={player.id || idx} 
                                    style={[
                                      styles.playerAvatarCircle,
                                      { marginLeft: idx > 0 ? -8 : 0, zIndex: 3 - idx }
                                    ]}
                                  >
                                    <Text style={styles.playerAvatarText}>
                                      {player.name?.charAt(0)?.toUpperCase() || "?"}
                                    </Text>
                                  </View>
                                ))}
                                {players.length > 3 ? (
                                  <View style={[styles.playerAvatarCircle, styles.playerAvatarMore, { marginLeft: -8 }]}>
                                    <Text style={styles.playerAvatarMoreText}>+{players.length - 3}</Text>
                                  </View>
                                ) : null}
                              </View>
                              <View style={styles.playerNamesContainer}>
                                <Text style={styles.playerNamesText} numberOfLines={1}>
                                  {players.length === 0 
                                    ? "No players" 
                                    : players.length <= 2 
                                      ? players.map((p: any) => p.name?.split(' ')[0]).join(', ')
                                      : `${players.slice(0, 2).map((p: any) => p.name?.split(' ')[0]).join(', ')} +${players.length - 2}`
                                  }
                                </Text>
                              </View>
                            </View>
                            
                            <View style={styles.richSessionFooter}>
                              {needsFeedback ? (
                                <View style={styles.xpRewardBadge}>
                                  <Ionicons name="flash" size={12} color={Colors.dark.gold} />
                                  <Text style={styles.xpRewardText}>+{sessionXp} XP</Text>
                                </View>
                              ) : (
                                <View style={styles.richCompletedBadge}>
                                  <Ionicons name="checkmark-circle" size={14} color={Colors.dark.primary} />
                                  <Text style={styles.richCompletedText}>Completed</Text>
                                </View>
                              )}
                              <View style={styles.feedbackActionRow}>
                                <Text style={[styles.feedbackActionText, !needsFeedback && { color: Colors.dark.xpCyan }]}>
                                  {needsFeedback ? "Add Feedback" : "View Details"}
                                </Text>
                                <Ionicons name="chevron-forward" size={16} color={needsFeedback ? Colors.dark.gold : Colors.dark.xpCyan} />
                              </View>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
    
    <StandaloneSessionDetailDrawer
      visible={showDetailDrawer}
      session={detailSession}
      onClose={() => {
        setShowDetailDrawer(false);
        setDetailSession(null);
      }}
      onOpenFeedback={(session) => {
        setShowDetailDrawer(false);
        setDetailSession(null);
        setSelectedSession(session as any);
      }}
    />
  </>
  );
}

type AssessmentStatus = "not_yet" | "developing" | "meets" | "above";

function ProgressTab({ insets, tabBarHeight }: { insets: { bottom: number }; tabBarHeight: number }) {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithProgress | null>(null);
  const [assessmentMode, setAssessmentMode] = useState(false);
  const [pendingAssessments, setPendingAssessments] = useState<Record<string, AssessmentStatus>>({});
  const [feedbackSession, setFeedbackSession] = useState<any>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const queryClient = useQueryClient();
  const { calendarData } = useCoach();

  // Get coachId from calendar data (coach's own sessions)
  const coachId = calendarData?.ownSessions?.[0]?.coachId;
  
  const { data: players = [], isLoading: playersLoading } = useQuery<PlayerWithProgress[]>({
    queryKey: ["/api/coach/players/progress"],
  });

  const { data: domains = [] } = useQuery<SkillDomain[]>({
    queryKey: ["/api/progress/domains"],
  });

  const { data: skillStates = [], isLoading: statesLoading } = useQuery<PlayerSkillState[]>({
    queryKey: [`/api/players/${selectedPlayer?.id}/skill-state`],
    enabled: !!selectedPlayer,
  });

  const { data: xpData } = useQuery<PlayerXpData>({
    queryKey: [`/api/players/${selectedPlayer?.id}/xp`],
    enabled: !!selectedPlayer,
  });

  const { data: observationTrends = [] } = useQuery<ObservationTrend[]>({
    queryKey: [`/api/players/${selectedPlayer?.id}/observation-trends`],
    enabled: !!selectedPlayer,
  });

  const submitAssessmentMutation = useMutation({
    mutationFn: async (data: { playerId: string; domainId: string; status: AssessmentStatus }) => {
      return apiRequest("POST", `/api/players/${data.playerId}/assessments`, {
        domainId: data.domainId,
        status: data.status,
        coachId: coachId,
        notes: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${selectedPlayer?.id}/skill-state`] });
    },
  });

  const toggleAssessment = (domainId: string, status: AssessmentStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingAssessments(prev => {
      if (prev[domainId] === status) {
        const { [domainId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [domainId]: status };
    });
  };

  const saveAssessments = async () => {
    if (!selectedPlayer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    for (const [domainId, status] of Object.entries(pendingAssessments)) {
      await submitAssessmentMutation.mutateAsync({
        playerId: selectedPlayer.id,
        domainId,
        status,
      });
    }
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPendingAssessments({});
    setAssessmentMode(false);
  };

  const getDomainIcon = (iconName: string | null): keyof typeof Ionicons.glyphMap => {
    switch (iconName) {
      case "tennisball-outline": return "tennisball-outline";
      case "brain-outline": return "bulb-outline";
      case "fitness-outline": return "fitness-outline";
      case "people-outline": return "people-outline";
      case "bulb-outline": return "flash-outline";
      default: return "star-outline";
    }
  };

  const getTrendIcon = (trend: string | null): keyof typeof Ionicons.glyphMap => {
    switch (trend) {
      case "improving": return "trending-up";
      case "focus": return "trending-down";
      default: return "remove";
    }
  };

  const getTrendColor = (trend: string | null) => {
    switch (trend) {
      case "improving": return Colors.dark.primary;
      case "focus": return Colors.dark.error;
      default: return Colors.dark.tabIconDefault;
    }
  };

  const getMomentumColor = (momentum: string | null) => {
    switch (momentum) {
      case "strong": return Colors.dark.primary;
      case "slowing": return Colors.dark.orange;
      default: return Colors.dark.xpCyan;
    }
  };

  const getProgressColor = (value: number) => {
    if (value >= 70) return Colors.dark.primary;
    if (value >= 40) return Colors.dark.xpCyan;
    if (value >= 20) return Colors.dark.gold;
    return Colors.dark.tabIconDefault;
  };

  const getAssessmentBadge = (status: string | null) => {
    switch (status) {
      case "above": return { label: "Above", color: Colors.dark.primary };
      case "meets": return { label: "Meets", color: Colors.dark.xpCyan };
      case "developing": return { label: "Developing", color: Colors.dark.gold };
      case "not_yet": return { label: "Not Yet", color: Colors.dark.orange };
      default: return { label: "No Assessment", color: Colors.dark.textMuted };
    }
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

  if (playersLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading progress...</Text>
      </View>
    );
  }

  // Player Detail View
  if (selectedPlayer) {
    return (
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.backRow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedPlayer(null);
          }}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.dark.primary} />
          <Text style={styles.backText}>All Players</Text>
        </Pressable>

        <View style={styles.playerDetailHeader}>
          <View style={styles.playerAvatarLarge}>
            <Text style={styles.playerInitialLarge}>{selectedPlayer.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.playerDetailInfo}>
            <Text style={styles.playerDetailName}>{selectedPlayer.name}</Text>
            <View style={styles.playerDetailMeta}>
              {selectedPlayer.ballLevel ? (
                <View style={[styles.levelBadgeLarge, { borderColor: getLevelColor(selectedPlayer.ballLevel) }]}>
                  <View style={[styles.levelDotLarge, { backgroundColor: getLevelColor(selectedPlayer.ballLevel) }]} />
                  <Text style={[styles.levelBadgeTextLarge, { color: getLevelColor(selectedPlayer.ballLevel) }]}>
                    {selectedPlayer.ballLevel} Ball
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Pressable
            style={[styles.assessmentToggle, assessmentMode && styles.assessmentToggleActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAssessmentMode(!assessmentMode);
              if (assessmentMode) {
                setPendingAssessments({});
              }
            }}
          >
            <Ionicons 
              name={assessmentMode ? "close" : "clipboard-outline"} 
              size={18} 
              color={assessmentMode ? Colors.dark.text : Colors.dark.gold} 
            />
          </Pressable>
        </View>

        {assessmentMode ? (
          <View style={styles.assessmentBanner}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.dark.gold} />
            <Text style={styles.assessmentBannerText}>Assessment Mode - Tap domains to set levels</Text>
          </View>
        ) : null}

        {/* XP Display */}
        {xpData ? (
          <View style={styles.xpCard}>
            <View style={styles.xpHeader}>
              <Ionicons name="star" size={24} color={Colors.dark.gold} />
              <Text style={styles.xpTotal}>{xpData.totalXp} XP</Text>
            </View>
            {xpData.transactions.length > 0 ? (
              <View style={styles.xpHistory}>
                <Text style={styles.xpHistoryTitle}>Recent XP</Text>
                {xpData.transactions.slice(0, 3).map((tx) => (
                  <View key={tx.id} style={styles.xpTransaction}>
                    <Text style={styles.xpAmount}>+{tx.xpAmount}</Text>
                    <Text style={styles.xpSource}>{tx.description || tx.source}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Observation Trends */}
        {observationTrends.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Progress Trends</Text>
            <View style={styles.trendsContainer}>
              {observationTrends.map((trend) => (
                <ObservationTrendChart
                  key={trend.domainId}
                  trend={trend}
                  width={320}
                  height={90}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* Skill Domains */}
        <Text style={styles.sectionTitle}>Skill Domains</Text>
        {statesLoading ? (
          <ActivityIndicator size="small" color={Colors.dark.primary} />
        ) : (
          <View style={styles.domainGrid}>
            {skillStates.map((state) => {
              const assessment = getAssessmentBadge(state.assessmentStatus);
              return (
                <View key={state.id} style={styles.domainCard}>
                  <View style={styles.domainHeader}>
                    <Ionicons
                      name={getDomainIcon(state.domain?.icon || null)}
                      size={20}
                      color={getProgressColor(state.progressValue)}
                    />
                    <Text style={styles.domainName}>{state.domain?.displayName || "Unknown"}</Text>
                    {state.isFrozen ? (
                      <Ionicons name="snow-outline" size={14} color={Colors.dark.xpCyan} />
                    ) : null}
                  </View>
                  
                  {/* Progress Bar */}
                  <View style={styles.progressBarContainer}>
                    <View style={styles.progressBarBg}>
                      <View 
                        style={[
                          styles.progressBarFill, 
                          { 
                            width: `${state.progressValue}%`,
                            backgroundColor: getProgressColor(state.progressValue)
                          }
                        ]} 
                      />
                    </View>
                    <Text style={[styles.progressValue, { color: getProgressColor(state.progressValue) }]}>
                      {state.progressValue}%
                    </Text>
                  </View>

                  {assessmentMode ? (
                    <View style={styles.assessmentOptions}>
                      {(["not_yet", "developing", "meets", "above"] as AssessmentStatus[]).map((status) => {
                        const badge = getAssessmentBadge(status);
                        const isSelected = pendingAssessments[state.domainId] === status;
                        const isCurrent = state.assessmentStatus === status;
                        return (
                          <Pressable
                            key={status}
                            style={[
                              styles.assessmentOption,
                              isSelected && { backgroundColor: badge.color + "30", borderColor: badge.color },
                              isCurrent && !isSelected && { opacity: 0.6 },
                            ]}
                            onPress={() => toggleAssessment(state.domainId, status)}
                          >
                            <Text style={[styles.assessmentOptionText, { color: isSelected ? badge.color : Colors.dark.tabIconDefault }]}>
                              {badge.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <>
                      {state.domainXp > 0 || state.observationCount > 0 ? (
                        <View style={styles.domainXpRow}>
                          <View style={styles.domainXpBadge}>
                            <Ionicons name="star" size={10} color={Colors.dark.gold} />
                            <Text style={styles.domainXpText}>{state.domainXp} XP</Text>
                          </View>
                          <Text style={styles.domainObsCount}>
                            {state.observationCount} obs
                          </Text>
                          {state.avgDelta !== 0 ? (
                            <Text style={[
                              styles.domainAvgDelta,
                              { color: state.avgDelta > 0 ? Colors.dark.primary : state.avgDelta < 0 ? Colors.dark.error : Colors.dark.tabIconDefault }
                            ]}>
                              {state.avgDelta > 0 ? "+" : ""}{state.avgDelta}/obs
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      <View style={styles.domainMeta}>
                        <View style={styles.trendBadge}>
                          <Ionicons
                            name={getTrendIcon(state.trend)}
                            size={12}
                            color={getTrendColor(state.trend)}
                          />
                          <Text style={[styles.trendText, { color: getTrendColor(state.trend) }]}>
                            {state.trend === "improving" ? "Improving" : state.trend === "focus" ? "Needs Focus" : "Stable"}
                          </Text>
                        </View>
                        <View style={[styles.assessmentBadge, { backgroundColor: assessment.color + "20" }]}>
                          <Text style={[styles.assessmentText, { color: assessment.color }]}>{assessment.label}</Text>
                        </View>
                      </View>

                      {state.momentum ? (
                        <View style={styles.momentumRow}>
                          <Ionicons name="flash-outline" size={12} color={getMomentumColor(state.momentum)} />
                          <Text style={[styles.momentumText, { color: getMomentumColor(state.momentum) }]}>
                            Momentum: {state.momentum.charAt(0).toUpperCase() + state.momentum.slice(1)}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {assessmentMode && Object.keys(pendingAssessments).length > 0 ? (
          <Pressable
            style={[styles.saveAssessmentsButton, submitAssessmentMutation.isPending && { opacity: 0.6 }]}
            onPress={saveAssessments}
            disabled={submitAssessmentMutation.isPending}
          >
            {submitAssessmentMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={Colors.dark.buttonText} />
                <Text style={styles.saveAssessmentsText}>
                  Save {Object.keys(pendingAssessments).length} Assessment{Object.keys(pendingAssessments).length > 1 ? "s" : ""}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }

  // Session-based Feedback View - show sessions that need feedback
  const allSessions = calendarData?.ownSessions || [];
  
  // Group sessions by date and feedback status
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  const needsFeedbackSessions = allSessions.filter((s: any) => {
    const sessionEnd = new Date(s.endTime);
    return sessionEnd < new Date() && s.status !== "completed" && s.status !== "cancelled";
  });
  
  const todaySessions = needsFeedbackSessions.filter((s: any) => {
    const sessionDate = new Date(s.startTime);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() === today.getTime();
  });
  
  const yesterdaySessions = needsFeedbackSessions.filter((s: any) => {
    const sessionDate = new Date(s.startTime);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() === yesterday.getTime();
  });
  
  const earlierSessions = needsFeedbackSessions.filter((s: any) => {
    const sessionDate = new Date(s.startTime);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() < yesterday.getTime();
  }).slice(0, 20); // Limit to last 20

  const formatSessionTime = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return `${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} - ${end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  };

  const formatSessionDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getSessionTypeLabel = (type: string) => {
    switch(type) {
      case 'private': return 'Private';
      case 'semi_private': return 'Semi-Private';
      case 'group': return 'Group';
      case 'camp': return 'Camp';
      default: return type;
    }
  };

  const renderSessionCard = (session: any, showDate = false) => (
    <Pressable
      key={session.id}
      style={styles.feedbackSessionCard}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setFeedbackSession(session);
        setShowFeedbackModal(true);
      }}
    >
      <View style={styles.feedbackSessionLeft}>
        <View style={styles.feedbackSessionIcon}>
          <Ionicons name="chatbubble-outline" size={18} color={Colors.dark.gold} />
        </View>
        <View>
          <Text style={styles.feedbackSessionType}>{getSessionTypeLabel(session.sessionType)}</Text>
          <Text style={styles.feedbackSessionTime}>
            {showDate ? formatSessionDate(session.startTime) + ' · ' : ''}{formatSessionTime(session.startTime, session.endTime)}
          </Text>
        </View>
      </View>
      <View style={styles.feedbackSessionRight}>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>Needs Feedback</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.dark.gold} />
      </View>
    </Pressable>
  );

  if (needsFeedbackSessions.length === 0) {
    return (
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.feedbackHeader}>
          <Text style={styles.feedbackSectionTitle}>Session Feedback</Text>
          <Text style={styles.feedbackSectionSubtitle}>All caught up!</Text>
        </View>
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle" size={48} color={Colors.dark.primary} />
          <Text style={styles.emptyText}>No pending feedback</Text>
          <Text style={styles.emptySubtext}>
            All sessions have been reviewed
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.feedbackHeader}>
        <Text style={styles.feedbackSectionTitle}>Session Feedback</Text>
        <View style={styles.feedbackCountBadge}>
          <Text style={styles.feedbackCountText}>{needsFeedbackSessions.length} pending</Text>
        </View>
      </View>

      {todaySessions.length > 0 ? (
        <View style={styles.feedbackGroup}>
          <Text style={styles.feedbackGroupTitle}>Today</Text>
          {todaySessions.map((s: any) => renderSessionCard(s))}
        </View>
      ) : null}

      {yesterdaySessions.length > 0 ? (
        <View style={styles.feedbackGroup}>
          <Text style={styles.feedbackGroupTitle}>Yesterday</Text>
          {yesterdaySessions.map((s: any) => renderSessionCard(s))}
        </View>
      ) : null}

      {earlierSessions.length > 0 ? (
        <View style={styles.feedbackGroup}>
          <Text style={styles.feedbackGroupTitle}>Earlier</Text>
          {earlierSessions.map((s: any) => renderSessionCard(s, true))}
        </View>
      ) : null}

      <QuickFeedbackModal
        visible={showFeedbackModal}
        session={feedbackSession}
        onClose={() => {
          setShowFeedbackModal(false);
          setFeedbackSession(null);
        }}
        onComplete={() => {
          setShowFeedbackModal(false);
          setFeedbackSession(null);
          queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
        }}
      />
    </ScrollView>
  );
}

interface SessionTemplate {
  id: string;
  coachId: string | null;
  name: string;
  sessionType: string;
  duration: number;
  ballLevel: string | null;
  skillLevel: number | null;
  defaultPlayerIds: string[] | null;
  notes: string | null;
  createdAt: string | null;
}

function PlansTab({ insets, tabBarHeight }: { insets: { bottom: number }; tabBarHeight: number }) {
  const { coach, calendarData } = useCoach();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SessionTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateType, setTemplateType] = useState<string>("private");
  const [templateDuration, setTemplateDuration] = useState<number>(60);
  const [templateBallLevel, setTemplateBallLevel] = useState<string>("");
  const [templateNotes, setTemplateNotes] = useState("");

  const coachId = coach?.id || calendarData?.ownSessions?.[0]?.coachId;

  const { data: templates = [], isLoading } = useQuery<SessionTemplate[]>({
    queryKey: ["/api/coach/templates", { coachId }],
    enabled: !!coachId,
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: Partial<SessionTemplate>) => {
      return apiRequest("POST", "/api/coach/templates", data);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/templates"], exact: false });
      resetForm();
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to create template");
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/coach/templates/${id}`);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/templates"], exact: false });
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to delete template");
    },
  });

  const resetForm = () => {
    setShowCreateModal(false);
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateType("private");
    setTemplateDuration(60);
    setTemplateBallLevel("");
    setTemplateNotes("");
  };

  const handleSaveTemplate = () => {
    if (!coachId) {
      Alert.alert("Error", "Coach session not loaded. Please try again.");
      return;
    }
    if (!templateName.trim()) {
      Alert.alert("Error", "Template name is required");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createTemplateMutation.mutate({
      coachId,
      name: templateName,
      sessionType: templateType,
      duration: templateDuration,
      ballLevel: templateBallLevel || null,
      notes: templateNotes || null,
    });
  };

  const handleDeleteTemplate = (template: SessionTemplate) => {
    Alert.alert(
      "Delete Template",
      `Are you sure you want to delete "${template.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteTemplateMutation.mutate(template.id),
        },
      ]
    );
  };

  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case "private": return "Private";
      case "semi_private": return "Semi-Private";
      case "group": return "Group";
      case "physical": return "Physical";
      case "activity": return "Activity";
      default: return type;
    }
  };

  const getSessionTypeColor = (type: string) => {
    switch (type) {
      case "private": return Colors.dark.primary;
      case "semi_private": return Colors.dark.xpCyan;
      case "group": return Colors.dark.gold;
      case "physical": return Colors.dark.orange;
      default: return Colors.dark.tabIconDefault;
    }
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
        <Text style={styles.loadingText}>Loading templates...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: tabBarHeight + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.plansHeader}>
        <Text style={styles.sectionTitle}>Session Templates</Text>
        <Pressable
          style={styles.addTemplateButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCreateModal(true);
          }}
        >
          <Ionicons name="add" size={20} color={Colors.dark.primary} />
        </Pressable>
      </View>

      {templates.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={48} color={Colors.dark.gold} />
          <Text style={styles.emptyText}>No Templates Yet</Text>
          <Text style={styles.emptySubtext}>
            Create templates for quick session booking
          </Text>
          <Pressable
            style={styles.createTemplateButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowCreateModal(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.dark.primary} />
            <Text style={styles.createTemplateText}>Create Template</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.templatesGrid}>
          {templates.map((template) => (
            <Pressable
              key={template.id}
              style={styles.templateCard}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleDeleteTemplate(template);
              }}
            >
              <View style={styles.templateHeader}>
                <View style={[styles.templateTypeIndicator, { backgroundColor: getSessionTypeColor(template.sessionType) }]} />
                <Text style={styles.templateName}>{template.name}</Text>
              </View>
              <View style={styles.templateMeta}>
                <View style={styles.templateMetaItem}>
                  <Ionicons name="time-outline" size={14} color={Colors.dark.tabIconDefault} />
                  <Text style={styles.templateMetaText}>{template.duration}min</Text>
                </View>
                <View style={[styles.templateTypeBadge, { backgroundColor: getSessionTypeColor(template.sessionType) + "20" }]}>
                  <Text style={[styles.templateTypeText, { color: getSessionTypeColor(template.sessionType) }]}>
                    {getSessionTypeLabel(template.sessionType)}
                  </Text>
                </View>
              </View>
              {template.ballLevel ? (
                <View style={styles.templateBallLevel}>
                  <View style={[styles.levelDotSmall, { backgroundColor: getLevelColor(template.ballLevel) }]} />
                  <Text style={styles.templateBallText}>{template.ballLevel} Ball</Text>
                </View>
              ) : null}
              {template.notes ? (
                <Text style={styles.templateNotes} numberOfLines={2}>{template.notes}</Text>
              ) : null}
              <View style={styles.templateActions}>
                <Pressable
                  style={styles.templateActionButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Alert.alert("Quick Book", "This template can be used when creating a new session from the calendar.");
                  }}
                >
                  <Ionicons name="calendar-outline" size={16} color={Colors.dark.primary} />
                  <Text style={styles.templateActionText}>Use</Text>
                </Pressable>
                <Pressable
                  style={styles.templateActionButton}
                  onPress={() => handleDeleteTemplate(template)}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
                </Pressable>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {showCreateModal ? (
        <View style={styles.modalOverlay}>
          <KeyboardAwareScrollViewCompat
            style={styles.modalScrollContainer}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Template</Text>
                <Pressable onPress={resetForm}>
                  <Ionicons name="close" size={24} color={Colors.dark.text} />
                </Pressable>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Template Name</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Morning Private"
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  value={templateName}
                  onChangeText={setTemplateName}
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Session Type</Text>
                <View style={styles.typeButtons}>
                  {[
                    { value: "private", label: "Private" },
                    { value: "semi_private", label: "Semi" },
                    { value: "group", label: "Group" },
                  ].map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.typeButton,
                        templateType === opt.value && styles.typeButtonActive,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTemplateType(opt.value);
                      }}
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          templateType === opt.value && styles.typeButtonTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Duration</Text>
                <View style={styles.durationButtons}>
                  {[30, 45, 60, 90].map((dur) => (
                    <Pressable
                      key={dur}
                      style={[
                        styles.durationButton,
                        templateDuration === dur && styles.durationButtonActive,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTemplateDuration(dur);
                      }}
                    >
                      <Text
                        style={[
                          styles.durationButtonText,
                          templateDuration === dur && styles.durationButtonTextActive,
                        ]}
                      >
                        {dur}m
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Ball Level (Optional)</Text>
                <View style={styles.ballLevelButtons}>
                  {["", "red", "orange", "green", "yellow"].map((level) => (
                    <Pressable
                      key={level || "any"}
                      style={[
                        styles.ballLevelButton,
                        templateBallLevel === level && styles.ballLevelButtonActive,
                        level ? { borderColor: getLevelColor(level) } : undefined,
                      ].filter(Boolean)}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTemplateBallLevel(level);
                      }}
                    >
                      {level ? (
                        <View style={[styles.levelDotSmall, { backgroundColor: getLevelColor(level) }]} />
                      ) : (
                        <Text style={styles.ballLevelText}>Any</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Notes (Optional)</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextArea]}
                  placeholder="Session focus, warm-up routine, etc."
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  value={templateNotes}
                  onChangeText={setTemplateNotes}
                  multiline
                  maxLength={200}
                />
              </View>

              <Pressable
                style={[styles.saveTemplateButton, (createTemplateMutation.isPending || !coachId) && { opacity: 0.6 }]}
                onPress={handleSaveTemplate}
                disabled={createTemplateMutation.isPending || !coachId}
              >
                {createTemplateMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color={Colors.dark.buttonText} />
                    <Text style={styles.saveTemplateText}>Save Template</Text>
                  </>
                )}
              </Pressable>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      ) : null}
    </ScrollView>
  );
}

interface BallLevel {
  id: string;
  stage: string;
  rank: number;
  displayNamePlayer: string;
  displayNameCoach: string;
  identity: string;
  courtType: string;
  ballType: string;
  promotionRequirements: {
    skillAchievedCount: number;
    pillarMinimum: Record<string, number>;
    tests: string[];
    evidenceMin: number;
    matchEvents: number;
    matchWins?: number;
  };
  skillsByPillar?: Record<string, LevelSkill[]>;
}

interface LevelSkill {
  id: string;
  name: string;
  pillar: string;
  description?: string;
  targetScore: number;
  weight: string;
  isRequired: boolean;
  rubric?: { score: number; observable: string }[];
}

const STAGES = ["RED", "ORANGE", "GREEN", "YELLOW"] as const;
const PILLARS = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"] as const;

const STAGE_COLORS: Record<string, string> = {
  RED: Colors.dark.ballRed,
  ORANGE: Colors.dark.ballOrange,
  GREEN: Colors.dark.ballGreen,
  YELLOW: Colors.dark.ballYellow,
};

const PILLAR_COLORS: Record<string, string> = {
  TECHNIQUE: Colors.dark.xpCyan,
  TACTICAL: Colors.dark.primary,
  PHYSICAL: Colors.dark.orange,
  MENTAL: Colors.dark.gold,
  SOCIAL: Colors.dark.ballGlow,
  MATCH: Colors.dark.ballRed,
};

const PILLAR_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  TECHNIQUE: "hand-left-outline",
  TACTICAL: "bulb-outline",
  PHYSICAL: "fitness-outline",
  MENTAL: "sparkles-outline",
  SOCIAL: "people-outline",
  MATCH: "trophy-outline",
};

function GlowLevelsTab({ insets, tabBarHeight }: { insets: { bottom: number }; tabBarHeight: number }) {
  const [selectedStage, setSelectedStage] = useState<typeof STAGES[number]>("RED");
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);

  const { data: levels = [], isLoading } = useQuery<BallLevel[]>({
    queryKey: ["/api/glow-leveling/levels"],
  });

  const stageLevels = levels.filter(l => l.stage === selectedStage).sort((a, b) => b.rank - a.rank);

  const handleStageSelect = (stage: typeof STAGES[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedStage(stage);
    setExpandedLevel(null);
    setExpandedPillar(null);
  };

  const handleLevelExpand = (levelId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedLevel(expandedLevel === levelId ? null : levelId);
    setExpandedPillar(null);
  };

  const handlePillarExpand = (pillar: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedPillar(expandedPillar === pillar ? null : pillar);
  };

  const getScoreLabel = (score: number) => {
    switch (score) {
      case 0: return "Not Yet";
      case 1: return "Emerging";
      case 2: return "Achieved";
      default: return "";
    }
  };

  const getScoreColor = (score: number) => {
    switch (score) {
      case 0: return Colors.dark.error;
      case 1: return Colors.dark.orange;
      case 2: return Colors.dark.successNeon;
      default: return Colors.dark.text;
    }
  };

  if (isLoading) {
    return (
      <View style={glowLevelsStyles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={glowLevelsStyles.loadingText}>Loading levels...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={glowLevelsStyles.container}
      contentContainerStyle={{ 
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingTop: Spacing.md,
      }}
      showsVerticalScrollIndicator={false}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <View style={glowLevelsStyles.header}>
        <Text style={glowLevelsStyles.title}>Glow Level Cards</Text>
        <Text style={glowLevelsStyles.subtitle}>
          Skill requirements and rubrics for each level
        </Text>
      </View>

      <View style={glowLevelsStyles.stageSelector}>
        {STAGES.map((stage) => (
          <Pressable
            key={stage}
            style={[
              glowLevelsStyles.stageButton,
              selectedStage === stage && { 
                backgroundColor: STAGE_COLORS[stage] + "30",
                borderColor: STAGE_COLORS[stage],
              },
            ]}
            onPress={() => handleStageSelect(stage)}
          >
            <Ionicons 
              name="tennisball" 
              size={14} 
              color={selectedStage === stage ? STAGE_COLORS[stage] : Colors.dark.text} 
            />
            <Text style={[
              glowLevelsStyles.stageButtonText,
              selectedStage === stage && { color: STAGE_COLORS[stage] },
            ]}>
              {stage}
            </Text>
          </Pressable>
        ))}
      </View>

      {stageLevels.map((level) => {
        const isExpanded = expandedLevel === level.id;
        const stageColor = STAGE_COLORS[level.stage];

        return (
          <View key={level.id} style={glowLevelsStyles.levelCard}>
            <Pressable style={glowLevelsStyles.levelHeader} onPress={() => handleLevelExpand(level.id)}>
              <View style={[glowLevelsStyles.levelBadge, { backgroundColor: stageColor + "20", borderColor: stageColor }]}>
                <Text style={[glowLevelsStyles.levelBadgeText, { color: stageColor }]}>
                  {level.rank}
                </Text>
              </View>

              <View style={glowLevelsStyles.levelInfo}>
                <Text style={glowLevelsStyles.levelName}>{level.displayNameCoach}</Text>
                <Text style={glowLevelsStyles.levelIdentity}>{level.identity}</Text>
              </View>

              <Ionicons 
                name={isExpanded ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={Colors.dark.text} 
              />
            </Pressable>

            {isExpanded ? (
              <View style={glowLevelsStyles.levelContent}>
                <View style={glowLevelsStyles.courtInfo}>
                  <View style={glowLevelsStyles.infoItem}>
                    <Ionicons name="tennisball-outline" size={14} color={stageColor} />
                    <Text style={glowLevelsStyles.infoText}>{level.ballType.replace(/_/g, " ")}</Text>
                  </View>
                  <View style={glowLevelsStyles.infoItem}>
                    <Ionicons name="resize-outline" size={14} color={stageColor} />
                    <Text style={glowLevelsStyles.infoText}>{level.courtType.replace(/_/g, " ")}</Text>
                  </View>
                </View>

                <View style={glowLevelsStyles.requirementsSection}>
                  <Text style={glowLevelsStyles.sectionTitle}>Promotion Requirements</Text>
                  <View style={glowLevelsStyles.requirementsList}>
                    <View style={glowLevelsStyles.requirementItem}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.dark.successNeon} />
                      <Text style={glowLevelsStyles.requirementText}>
                        {level.promotionRequirements.skillAchievedCount} skills achieved
                      </Text>
                    </View>
                    <View style={glowLevelsStyles.requirementItem}>
                      <Ionicons name="document-text" size={16} color={Colors.dark.xpCyan} />
                      <Text style={glowLevelsStyles.requirementText}>
                        {level.promotionRequirements.evidenceMin} evidence videos
                      </Text>
                    </View>
                    <View style={glowLevelsStyles.requirementItem}>
                      <Ionicons name="trophy" size={16} color={Colors.dark.gold} />
                      <Text style={glowLevelsStyles.requirementText}>
                        {level.promotionRequirements.matchEvents} match events
                        {level.promotionRequirements.matchWins ? ` (${level.promotionRequirements.matchWins} wins)` : ""}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={glowLevelsStyles.pillarsSection}>
                  <Text style={glowLevelsStyles.sectionTitle}>Skills by Pillar</Text>
                  
                  {PILLARS.map((pillar) => {
                    const pillarSkills = level.skillsByPillar?.[pillar] || [];
                    if (pillarSkills.length === 0) return null;
                    
                    const isPillarExpanded = expandedPillar === pillar;
                    const pillarColor = PILLAR_COLORS[pillar];
                    const minRequired = level.promotionRequirements.pillarMinimum?.[pillar] || 0;

                    return (
                      <View key={pillar} style={glowLevelsStyles.pillarSection}>
                        <Pressable 
                          style={glowLevelsStyles.pillarHeader}
                          onPress={() => handlePillarExpand(pillar)}
                        >
                          <View style={glowLevelsStyles.pillarTitle}>
                            <View style={[glowLevelsStyles.pillarIcon, { backgroundColor: pillarColor + "20" }]}>
                              <Ionicons name={PILLAR_ICONS[pillar]} size={14} color={pillarColor} />
                            </View>
                            <Text style={glowLevelsStyles.pillarName}>{pillar}</Text>
                            <View style={glowLevelsStyles.pillarBadge}>
                              <Text style={glowLevelsStyles.pillarCount}>{pillarSkills.length}</Text>
                            </View>
                          </View>
                          
                          {minRequired > 0 ? (
                            <Text style={[glowLevelsStyles.minRequired, { color: pillarColor }]}>
                              Min: {minRequired}
                            </Text>
                          ) : null}
                          
                          <Ionicons 
                            name={isPillarExpanded ? "chevron-up" : "chevron-down"} 
                            size={16} 
                            color={Colors.dark.text} 
                          />
                        </Pressable>

                        {isPillarExpanded ? (
                          <View style={glowLevelsStyles.skillsList}>
                            {pillarSkills.map((skill) => (
                              <View key={skill.id} style={glowLevelsStyles.skillItem}>
                                <View style={glowLevelsStyles.skillHeader}>
                                  <Text style={glowLevelsStyles.skillName}>{skill.name}</Text>
                                  <View style={[
                                    glowLevelsStyles.targetBadge, 
                                    { backgroundColor: getScoreColor(skill.targetScore) + "20" }
                                  ]}>
                                    <Text style={[
                                      glowLevelsStyles.targetText, 
                                      { color: getScoreColor(skill.targetScore) }
                                    ]}>
                                      Target: {skill.targetScore}
                                    </Text>
                                  </View>
                                </View>

                                {skill.rubric && skill.rubric.length > 0 ? (
                                  <View style={glowLevelsStyles.rubricList}>
                                    {skill.rubric.map((r) => (
                                      <View key={r.score} style={glowLevelsStyles.rubricItem}>
                                        <View style={[
                                          glowLevelsStyles.scoreIndicator, 
                                          { backgroundColor: getScoreColor(r.score) }
                                        ]}>
                                          <Text style={glowLevelsStyles.scoreText}>{r.score}</Text>
                                        </View>
                                        <View style={glowLevelsStyles.rubricContent}>
                                          <Text style={[
                                            glowLevelsStyles.scoreLabel, 
                                            { color: getScoreColor(r.score) }
                                          ]}>
                                            {getScoreLabel(r.score)}
                                          </Text>
                                          <Text style={glowLevelsStyles.observableText}>
                                            {r.observable}
                                          </Text>
                                        </View>
                                      </View>
                                    ))}
                                  </View>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const glowLevelsStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
  },
  header: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  stageSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  stageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 2,
    borderColor: "transparent",
  },
  stageButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  levelCard: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  levelHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  levelBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  levelBadgeText: {
    fontSize: 18,
    fontWeight: "700",
  },
  levelInfo: {
    flex: 1,
  },
  levelName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  levelIdentity: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  levelContent: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
    padding: Spacing.lg,
  },
  courtInfo: {
    flexDirection: "row",
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  infoText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.text,
    opacity: 0.8,
    textTransform: "capitalize",
  },
  requirementsSection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  requirementsList: {
    gap: Spacing.sm,
  },
  requirementItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  requirementText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  pillarsSection: {
    gap: Spacing.sm,
  },
  pillarSection: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  pillarHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
  },
  pillarTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pillarIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pillarName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    textTransform: "capitalize",
  },
  pillarBadge: {
    backgroundColor: Colors.dark.backgroundTertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  pillarCount: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.text,
    opacity: 0.8,
  },
  minRequired: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    marginRight: Spacing.sm,
  },
  skillsList: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  skillItem: {
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  skillHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  skillName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  targetBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  targetText: {
    fontSize: 10,
    fontWeight: "600",
  },
  rubricList: {
    gap: Spacing.xs,
  },
  rubricItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  scoreIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  rubricContent: {
    flex: 1,
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  observableText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.text,
    opacity: 0.8,
    lineHeight: 16,
  },
});

// Templates Tab - Lesson template library inline
function TemplatesTab({ insets, tabBarHeight }: { insets: { bottom: number }; tabBarHeight: number }) {
  const navigation = useNavigation<any>();
  
  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/lesson-templates"],
  });

  const ballLevels = [
    { key: "blue", label: "Blue Ball", ages: "2-4 jaar", desc: "Pre-tennis foundation", color: "#3B82F6", icon: "star" },
    { key: "red", label: "Red Ball", ages: "4-8 jaar", desc: "First strokes & rallies", color: "#EF4444", icon: "tennisball" },
    { key: "orange", label: "Orange Ball", ages: "7-10 jaar", desc: "Bigger court, faster ball", color: "#F97316", icon: "tennisball" },
    { key: "green", label: "Green Ball", ages: "9-12 jaar", desc: "Full court transition", color: "#22C55E", icon: "tennisball" },
    { key: "yellow", label: "Yellow Ball", ages: "11+ jaar", desc: "Competition ready", color: "#EAB308", icon: "tennisball" },
  ];

  const getCounts = () => {
    if (!templates || !Array.isArray(templates)) return { blue: 0, red: 0, orange: 0, green: 0, yellow: 0, adult: 0 };
    const grouped: Record<string, number> = { blue: 0, red: 0, orange: 0, green: 0, yellow: 0, adult: 0 };
    templates.forEach((t: any) => {
      const level = t.ballLevel?.toLowerCase() || "adult";
      if (grouped[level] !== undefined) grouped[level]++;
    });
    return grouped;
  };

  const counts = getCounts();
  const totalTemplates = templates?.length || 0;

  if (isLoading) {
    return (
      <View style={templatesStyles.container}>
        <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
      </View>
    );
  }

  return (
    <ScrollView 
      style={templatesStyles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
    >
      <View style={templatesStyles.header}>
        <Text style={templatesStyles.title}>Lesson Templates</Text>
        <Text style={templatesStyles.subtitle}>{totalTemplates} templates across {ballLevels.length} ball levels</Text>
        
        <View style={templatesStyles.countBadges}>
          {ballLevels.map(level => (
            <View key={level.key} style={templatesStyles.countBadge}>
              <View style={[templatesStyles.countDot, { backgroundColor: level.color }]} />
              <Text style={templatesStyles.countText}>{counts[level.key as keyof typeof counts]}</Text>
              <Text style={templatesStyles.countLabel}>{level.key.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </View>

      {ballLevels.map(level => (
        <Pressable
          key={level.key}
          style={[templatesStyles.levelCard, { backgroundColor: level.color }]}
          onPress={() => navigation.navigate("LessonTemplateLibrary", { initialLevel: level.key })}
        >
          <View style={templatesStyles.levelIcon}>
            <Ionicons name={level.icon as any} size={28} color="#fff" />
          </View>
          <View style={templatesStyles.levelInfo}>
            <Text style={templatesStyles.levelTitle}>{level.label}</Text>
            <Text style={templatesStyles.levelSubtitle}>{level.ages} • {counts[level.key as keyof typeof counts]} templates</Text>
            <Text style={templatesStyles.levelDesc}>{level.desc}</Text>
          </View>
          <Ionicons name="chevron-down" size={24} color="#fff" style={{ opacity: 0.7 }} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const templatesStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { padding: Spacing.lg },
  title: { fontSize: 24, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.xs },
  subtitle: { fontSize: 14, color: Colors.dark.disabled, marginBottom: Spacing.md },
  countBadges: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  countBadge: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  countDot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.xs },
  countText: { fontSize: 14, fontWeight: "700", color: Colors.dark.text, marginRight: Spacing.xs },
  countLabel: { fontSize: 12, color: Colors.dark.disabled },
  levelCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, borderRadius: BorderRadius.lg, padding: Spacing.lg, flexDirection: "row", alignItems: "center" },
  levelIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginRight: Spacing.md },
  levelInfo: { flex: 1 },
  levelTitle: { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 2 },
  levelSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.9)", marginBottom: 2 },
  levelDesc: { fontSize: 12, color: "rgba(255,255,255,0.7)" },
});

// Level Cards Tab - Skill definitions inline
function LevelCardsTab({ insets, tabBarHeight }: { insets: { bottom: number }; tabBarHeight: number }) {
  const navigation = useNavigation<any>();
  const [selectedLevel, setSelectedLevel] = useState<string>("red");

  const { data: levelData = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/glow-leveling/levels", selectedLevel],
  });

  const levels = [
    { key: "red", label: "RED", color: "#EF4444" },
    { key: "orange", label: "ORANGE", color: "#F97316" },
    { key: "green", label: "GREEN", color: "#22C55E" },
    { key: "yellow", label: "YELLOW", color: "#EAB308" },
  ];

  return (
    <ScrollView
      style={levelCardsStyles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
    >
      <View style={levelCardsStyles.header}>
        <Text style={levelCardsStyles.title}>Level Cards</Text>
        <Text style={levelCardsStyles.subtitle}>Complete skill definitions and requirements for each level</Text>
      </View>

      <View style={levelCardsStyles.levelTabs}>
        {levels.map(level => (
          <Pressable
            key={level.key}
            style={[
              levelCardsStyles.levelTab,
              selectedLevel === level.key && { backgroundColor: level.color, borderColor: level.color }
            ]}
            onPress={() => setSelectedLevel(level.key)}
          >
            <Ionicons name="tennisball" size={14} color={selectedLevel === level.key ? "#fff" : level.color} />
            <Text style={[levelCardsStyles.levelTabText, selectedLevel === level.key && { color: "#fff" }]}>{level.label}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.dark.primary} style={{ marginTop: Spacing.xl }} />
      ) : levelData && levelData.length > 0 ? (
        <View style={levelCardsStyles.pillarsContainer}>
          {levelData.map((level: any, index: number) => (
            <View key={index} style={levelCardsStyles.pillarCard}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.sm }}>
                <View style={[levelCardsStyles.skillDot, { backgroundColor: levels.find(l => l.key === selectedLevel)?.color, width: 12, height: 12, borderRadius: 6 }]} />
                <Text style={levelCardsStyles.pillarName}>{level.name || "Level " + (level.sublevel || index + 1)}</Text>
              </View>
              <Text style={levelCardsStyles.pillarDesc}>{level.description || `Sublevel ${level.sublevel || index + 1} skills`}</Text>
              {level.skills?.map((skill: any, skillIndex: number) => (
                <View key={skillIndex} style={levelCardsStyles.skillRow}>
                  <View style={[levelCardsStyles.skillDot, { backgroundColor: levels.find(l => l.key === selectedLevel)?.color }]} />
                  <Text style={levelCardsStyles.skillText}>{typeof skill === 'string' ? skill : skill.name || skill.skill}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={levelCardsStyles.emptyState}>
          <Ionicons name="layers-outline" size={48} color={Colors.dark.disabled} />
          <Text style={levelCardsStyles.emptyText}>No level card data available</Text>
          <Text style={levelCardsStyles.emptySubtext}>Select a different level to view skills</Text>
        </View>
      )}
    </ScrollView>
  );
}

const levelCardsStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { padding: Spacing.lg },
  title: { fontSize: 24, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.xs },
  subtitle: { fontSize: 14, color: Colors.dark.disabled },
  levelTabs: { flexDirection: "row", paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg, gap: Spacing.sm },
  levelTab: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.dark.border, gap: Spacing.xs },
  levelTabText: { fontSize: 12, fontWeight: "600", color: Colors.dark.text },
  pillarsContainer: { paddingHorizontal: Spacing.lg },
  pillarCard: { backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.md },
  pillarName: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.xs },
  pillarDesc: { fontSize: 12, color: Colors.dark.disabled, marginBottom: Spacing.md },
  skillRow: { flexDirection: "row", alignItems: "center", paddingVertical: Spacing.xs },
  skillDot: { width: 6, height: 6, borderRadius: 3, marginRight: Spacing.sm },
  skillText: { fontSize: 14, color: Colors.dark.text },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: Spacing["2xl"] },
  emptyText: { fontSize: 16, fontWeight: "600", color: Colors.dark.text, marginTop: Spacing.md },
  emptySubtext: { fontSize: 14, color: Colors.dark.disabled, marginTop: Spacing.xs },
});

// Match Log Tab - Guide users to log matches
function MatchLogTab({ insets, tabBarHeight }: { insets: { bottom: number }; tabBarHeight: number }) {
  const navigation = useNavigation<any>();

  return (
    <ScrollView
      style={matchLogStyles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
    >
      <View style={matchLogStyles.header}>
        <Text style={matchLogStyles.title}>Match Logs</Text>
        <Text style={matchLogStyles.subtitle}>Track player match results and performance</Text>
      </View>

      <View style={matchLogStyles.infoCard}>
        <View style={matchLogStyles.infoIcon}>
          <Ionicons name="tennisball" size={32} color={Colors.dark.orange} />
        </View>
        <Text style={matchLogStyles.infoTitle}>Log Matches by Player</Text>
        <Text style={matchLogStyles.infoText}>
          Match logs are organized per player. To log a new match or view match history:
        </Text>
        <View style={matchLogStyles.stepsList}>
          <View style={matchLogStyles.step}>
            <Text style={matchLogStyles.stepNumber}>1</Text>
            <Text style={matchLogStyles.stepText}>Go to the Players tab</Text>
          </View>
          <View style={matchLogStyles.step}>
            <Text style={matchLogStyles.stepNumber}>2</Text>
            <Text style={matchLogStyles.stepText}>Select a player</Text>
          </View>
          <View style={matchLogStyles.step}>
            <Text style={matchLogStyles.stepNumber}>3</Text>
            <Text style={matchLogStyles.stepText}>Tap "Log Match" to record results</Text>
          </View>
        </View>
        <Pressable
          style={matchLogStyles.actionButton}
          onPress={() => navigation.navigate("Players")}
        >
          <Ionicons name="people-outline" size={18} color="#fff" />
          <Text style={matchLogStyles.actionButtonText}>Go to Players</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const matchLogStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { padding: Spacing.lg },
  title: { fontSize: 24, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.xs },
  subtitle: { fontSize: 14, color: Colors.dark.disabled },
  infoCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: "center" },
  infoIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.dark.orange + "20", alignItems: "center", justifyContent: "center", marginBottom: Spacing.md },
  infoTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.sm },
  infoText: { fontSize: 14, color: Colors.dark.disabled, textAlign: "center", marginBottom: Spacing.lg },
  stepsList: { width: "100%", marginBottom: Spacing.lg },
  step: { flexDirection: "row", alignItems: "center", paddingVertical: Spacing.sm },
  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.dark.orange, color: "#fff", textAlign: "center", lineHeight: 24, fontWeight: "700", fontSize: 12, marginRight: Spacing.md, overflow: "hidden" },
  stepText: { fontSize: 14, color: Colors.dark.text },
  actionButton: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.orange, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, marginTop: Spacing.sm, gap: Spacing.sm },
  actionButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});

// Session Plan Tab - Guide users to session plans
function SessionPlanTab({ insets, tabBarHeight }: { insets: { bottom: number }; tabBarHeight: number }) {
  const navigation = useNavigation<any>();

  return (
    <ScrollView
      style={sessionPlanStyles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
    >
      <View style={sessionPlanStyles.header}>
        <Text style={sessionPlanStyles.title}>Session Plans</Text>
        <Text style={sessionPlanStyles.subtitle}>Pre-built lesson structures with drill blocks</Text>
      </View>

      <View style={sessionPlanStyles.infoCard}>
        <View style={sessionPlanStyles.infoIcon}>
          <Ionicons name="clipboard" size={32} color={Colors.dark.gold} />
        </View>
        <Text style={sessionPlanStyles.infoTitle}>Plans Live in Sessions</Text>
        <Text style={sessionPlanStyles.infoText}>
          Each session can have its own session plan with drill blocks. To view or create a plan:
        </Text>
        <View style={sessionPlanStyles.stepsList}>
          <View style={sessionPlanStyles.step}>
            <Text style={sessionPlanStyles.stepNumber}>1</Text>
            <Text style={sessionPlanStyles.stepText}>Go to the Calendar tab</Text>
          </View>
          <View style={sessionPlanStyles.step}>
            <Text style={sessionPlanStyles.stepNumber}>2</Text>
            <Text style={sessionPlanStyles.stepText}>Tap on any scheduled session</Text>
          </View>
          <View style={sessionPlanStyles.step}>
            <Text style={sessionPlanStyles.stepNumber}>3</Text>
            <Text style={sessionPlanStyles.stepText}>Tap "Session Plan" to generate or view</Text>
          </View>
        </View>
        <Pressable
          style={sessionPlanStyles.actionButton}
          onPress={() => navigation.navigate("Calendar")}
        >
          <Ionicons name="calendar-outline" size={18} color="#000" />
          <Text style={sessionPlanStyles.actionButtonText}>Go to Calendar</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const sessionPlanStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { padding: Spacing.lg },
  title: { fontSize: 24, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.xs },
  subtitle: { fontSize: 14, color: Colors.dark.disabled },
  infoCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: "center" },
  infoIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.dark.gold + "20", alignItems: "center", justifyContent: "center", marginBottom: Spacing.md },
  infoTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.sm },
  infoText: { fontSize: 14, color: Colors.dark.disabled, textAlign: "center", marginBottom: Spacing.lg },
  stepsList: { width: "100%", marginBottom: Spacing.lg },
  step: { flexDirection: "row", alignItems: "center", paddingVertical: Spacing.sm },
  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.dark.gold, color: "#000", textAlign: "center", lineHeight: 24, fontWeight: "700", fontSize: 12, marginRight: Spacing.md, overflow: "hidden" },
  stepText: { fontSize: 14, color: Colors.dark.text },
  actionButton: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.gold, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, marginTop: Spacing.sm, gap: Spacing.sm },
  actionButtonText: { color: "#000", fontWeight: "600", fontSize: 14 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary + "25",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 2,
  },
  hudHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerPanel: {
    overflow: "visible",
  },
  hudHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  hudSigilContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  hudTitleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  hudTitleGlow: {
    position: "absolute",
    width: 120,
    height: 40,
    backgroundColor: Colors.dark.primary + "30",
    borderRadius: 20,
    top: -5,
  },
  hudTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Colors.dark.text,
    letterSpacing: 4,
    textShadowColor: Colors.dark.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  hudSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.primary,
    letterSpacing: 2,
    marginTop: 2,
  },
  hudStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  hudStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
  hudStatusText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  gameHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    position: 'relative',
  },
  gameHeaderGradient: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  gameHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  levelBadgeContainer: {
    alignItems: 'center',
  },
  levelBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  levelNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.dark.backgroundRoot,
  },
  levelLabelContainer: {
    marginTop: 2,
  },
  levelLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  gameHeaderCenter: {
    flex: 1,
  },
  gameHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.dark.text,
    letterSpacing: 2,
    marginBottom: 4,
  },
  xpBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  xpBarBackground: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: Colors.dark.primary,
    borderRadius: 3,
  },
  xpText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.dark.xpCyan,
  },
  gameHeaderStats: {
    alignItems: 'flex-end',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.dark.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerDivider: {
    height: 1,
    backgroundColor: Colors.dark.primary + '20',
    marginTop: Spacing.md,
    marginHorizontal: -Spacing.md,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.primary + '20',
  },
  compactHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  compactLevelBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactLevelText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.dark.backgroundRoot,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.dark.text,
    letterSpacing: 1,
  },
  compactXpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
  },
  compactXpBar: {
    width: 80,
    height: 4,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  compactXpFill: {
    height: '100%',
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  compactXpText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.dark.xpCyan,
  },
  compactHeaderRight: {
    alignItems: 'flex-end',
  },
  compactStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.dark.text,
  },
  compactStatLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: Colors.dark.textMuted,
    letterSpacing: 0.5,
  },
  pillTabContainer: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  pillTabScroll: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  pillTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  pillTabActive: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderColor: Colors.dark.primary + "40",
  },
  pillTabIconContainer: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.dark.textMuted,
  },
  pillTabTextActive: {
    color: Colors.dark.text,
    fontWeight: '700',
  },
  glowToolsContainer: {
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  glowToolsScroll: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  glowToolButton: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  glowToolButtonActive: {
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  glowToolIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  glowToolLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.dark.textMuted,
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  feedbackSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  feedbackSectionSubtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  feedbackCountBadge: {
    backgroundColor: Colors.dark.gold + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  feedbackCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.dark.gold,
  },
  feedbackGroup: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  feedbackGroupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  feedbackSessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.gold + '30',
  },
  feedbackSessionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  feedbackSessionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.gold + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackSessionType: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  feedbackSessionTime: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  feedbackSessionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  pendingBadge: {
    backgroundColor: Colors.dark.gold + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.dark.gold,
  },
  periodToggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.xs,
  },
  periodToggleButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  periodToggleButtonActive: {
    backgroundColor: Colors.dark.gold + '20',
    borderColor: Colors.dark.gold,
  },
  periodToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark.textMuted,
  },
  periodToggleTextActive: {
    color: Colors.dark.gold,
  },
  weekNavHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  weekNavArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekNavCenter: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  weekNavLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  todayButton: {
    backgroundColor: Colors.dark.primary + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  todayButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.dark.primary,
  },
  dayAccordionContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  dayAccordion: {
    marginBottom: Spacing.md,
  },
  dayAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.gold + '30',
  },
  dayAccordionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dayAccordionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dayAccordionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  dayAccordionCount: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.dark.gold,
  },
  dayAccordionLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  dayFeedbackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark.gold + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: Spacing.sm,
  },
  dayFeedbackBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.dark.gold,
  },
  dayAccordionContent: {
    paddingTop: Spacing.sm,
    paddingLeft: Spacing.md,
  },
  daySessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.primary,
  },
  daySessionCardNeedsFeedback: {
    borderColor: Colors.dark.gold + '40',
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  daySessionLeft: {
    flex: 1,
  },
  daySessionTime: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.dark.primary,
  },
  daySessionType: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.dark.text,
    marginTop: 2,
  },
  daySessionDuration: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  daySessionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  richSessionCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: 'hidden',
  },
  richSessionCardNeedsFeedback: {
    borderColor: Colors.dark.gold + '50',
    backgroundColor: Colors.dark.gold + '08',
  },
  richSessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  richSessionTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  richSessionTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  richSessionTimeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  richSessionTypeBadge: {
    backgroundColor: Colors.dark.backgroundTertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 4,
  },
  richSessionTypeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.dark.textMuted,
  },
  richSessionDuration: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  sessionDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.dark.xpCyan + '15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 'auto',
  },
  sessionDateText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.dark.xpCyan,
  },
  ballLevelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  ballLevelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ballLevelText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  richSessionBody: {
    padding: Spacing.md,
  },
  richSessionPlayersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  playerAvatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerAvatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  playerAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.dark.primary,
  },
  playerAvatarMore: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  playerAvatarMoreText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.dark.textMuted,
  },
  playerNamesContainer: {
    flex: 1,
  },
  playerNamesText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.dark.text,
  },
  richSessionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border + '50',
  },
  xpRewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark.gold + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  xpRewardText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.dark.gold,
  },
  richCompletedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  richCompletedText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.dark.primary,
  },
  feedbackActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  feedbackActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.dark.gold,
  },
  gameTabBar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  gameTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  gameTabActive: {
    borderColor: Colors.dark.primary + '50',
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  gameTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.dark.textMuted,
  },
  gameTabTextActive: {
    color: Colors.dark.primary,
    fontWeight: '700',
  },
  gameTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: Spacing.sm,
    right: Spacing.sm,
    height: 2,
    backgroundColor: Colors.dark.primary,
    borderRadius: 1,
  },
  neoTabBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  neoTabWrapper: {
    flex: 1,
    position: "relative",
  },
  neoTabUnderglow: {
    position: "absolute",
    bottom: -4,
    left: 8,
    right: 8,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.primary,
  },
  neoTab: {
    overflow: "visible",
  },
  neoTabContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
  },
  neoTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.5,
  },
  neoTabTextActive: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  neoPeriodTab: {
    marginRight: Spacing.sm,
    minWidth: 80,
  },
  neoPeriodContent: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  neoPeriodText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.5,
  },
  neoPeriodTextActive: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  neoStatusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  neoStatusWrapper: {
    marginBottom: Spacing.xs,
  },
  neoStatusChip: {
    minWidth: 70,
  },
  neoStatusContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  neoStatusText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.3,
  },
  neoStatusBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  neoStatusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitleAccent: {
    width: 4,
    height: 20,
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  neoEmptyCard: {
    marginBottom: Spacing.lg,
  },
  neoEmptyContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  neoEmptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  neoEmptySubtext: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  neoSessionWrapper: {
    marginBottom: Spacing.md,
  },
  neoSessionCard: {
    overflow: "visible",
  },
  neoSessionContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  neoSessionTimeBadge: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 2,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
    minWidth: 60,
  },
  neoSessionTimeText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  neoSessionDuration: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  neoSessionInfo: {
    flex: 1,
  },
  neoSessionType: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1,
    marginBottom: 4,
  },
  neoSessionDate: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginBottom: 6,
  },
  neoSessionBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 4,
  },
  neoPendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  neoPendingText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  neoXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.gold + "25",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  neoXpText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  neoDoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  neoDoneText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.primary,
    letterSpacing: 0.3,
  },
  neoSessionArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    backgroundColor: `${Colors.dark.primary}10`,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xs,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  tabActive: {
    backgroundColor: Colors.dark.primary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  tabTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
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
  periodFilterContainer: {
    marginBottom: Spacing.lg,
    marginHorizontal: -Spacing.lg,
  },
  periodFilterContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  periodTab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  periodTabActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  periodTabText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  periodTabTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  statusFilterRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    flexWrap: "wrap",
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
  },
  statusChipActive: {
    borderColor: Colors.dark.primary + "50",
  },
  statusChipComplete: {
    backgroundColor: Colors.dark.primary + "15",
    borderColor: Colors.dark.primary,
  },
  statusChipOpen: {
    backgroundColor: "#F39C12" + "15",
    borderColor: "#F39C12",
  },
  statusChipPending: {
    backgroundColor: Colors.dark.xpCyan + "15",
    borderColor: Colors.dark.xpCyan,
  },
  statusChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500",
  },
  statusChipTextActive: {
    fontWeight: "600",
  },
  statusCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  statusCountBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  statusCountText: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
    fontWeight: "600",
  },
  statusCountTextActive: {
    color: Colors.dark.text,
  },
  xpRewardBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.gold + "15",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
  },
  xpRewardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  xpRewardTextContainer: {
    flex: 1,
  },
  xpRewardTitle: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  xpRewardSubtitle: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.gold,
    marginTop: 2,
  },
  xpRewardBadgeText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  
  // Epic XP Mission Banner
  xpMissionBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
    overflow: "hidden",
  },
  xpMissionGlowEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.dark.gold,
  },
  xpMissionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    paddingTop: Spacing.md + 2,
  },
  xpMissionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  xpMissionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.gold + "25",
    alignItems: "center",
    justifyContent: "center",
  },
  xpMissionTextContainer: {
    flex: 1,
  },
  xpMissionLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.gold,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  xpMissionStats: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    fontWeight: "500",
    marginTop: 2,
  },
  xpMissionButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  xpMissionButtonGradient: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  xpMissionButtonText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },

  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sessionXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  sessionXpText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  emptyCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "45",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: {
        elevation: 6,
      },
    }),
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
    backgroundColor: "rgba(20, 20, 20, 0.95)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "60",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
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
  feedbackLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  quickActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  applyAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  applyAllText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  asExpectedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
    borderStyle: "dashed",
    marginBottom: Spacing.sm,
  },
  asExpectedText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.xpCyan,
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
  playerFeedbackCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  playerFeedbackHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerFeedbackHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerFeedbackName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerFeedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerFeedbackLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  trendButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  trendButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    alignItems: "center",
    justifyContent: "center",
  },
  effortButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    alignItems: "center",
    justifyContent: "center",
  },
  effortButtonText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  playerNoteInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.text,
    marginTop: Spacing.xs,
  },
  skillChipsSection: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  skillGroupContainer: {
    marginBottom: Spacing.xs,
  },
  skillGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  skillGroupHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  skillGroupLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500" as const,
  },
  skillGroupBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    backgroundColor: Colors.dark.disabled + "30",
    borderRadius: BorderRadius.xs,
  },
  skillGroupBadgeText: {
    fontSize: Typography.small.fontSize - 2,
    color: Colors.dark.tabIconDefault,
  },
  skillChipsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  skillChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  skillChipFocused: {
    borderColor: Colors.dark.gold + "60",
    backgroundColor: Colors.dark.gold + "10",
  },
  skillChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  skillWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.orange + "15",
    borderRadius: BorderRadius.sm,
  },
  skillWarningText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.orange,
  },
  skillProgressSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  skillProgressBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
  },
  skillProgressBadgeText: {
    fontSize: Typography.small.fontSize,
  },
  headerProgressBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.xs,
    marginRight: Spacing.xs,
  },
  headerProgressText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
  },
  focusLinkHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
  },
  focusLinkText: {
    fontSize: Typography.small.fontSize - 1,
    color: Colors.dark.tabIconDefault,
    fontStyle: "italic",
    flex: 1,
  },
  skillSelectorContainer: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.disabled + "40",
  },
  skillSelectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  skillSelectorTitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.text,
    flex: 1,
  },
  skillSelectorChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  skillSelectorChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  skillSelectorChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  quickSignalsSection: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  quickSignalsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  quickSignalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  quickSignalChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  quickSignalText: {
    fontSize: Typography.small.fontSize - 1,
    color: Colors.dark.tabIconDefault,
  },
  quickSignalTextActive: {
    color: Colors.dark.primary,
  },
  issueToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  issueToggleText: {
    fontSize: Typography.small.fontSize - 1,
    color: Colors.dark.tabIconDefault,
  },
  issueOptions: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  issueChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  issueChipActive: {
    borderColor: Colors.dark.error,
    backgroundColor: Colors.dark.error + "15",
  },
  issueChipText: {
    fontSize: Typography.small.fontSize - 1,
    color: Colors.dark.tabIconDefault,
  },
  issueChipTextActive: {
    color: Colors.dark.error,
  },
  domainPreviewSection: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.disabled + "30",
  },
  domainPreviewLabel: {
    fontSize: Typography.small.fontSize - 1,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
  },
  domainPreviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  domainPreviewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  domainPreviewUp: {
    backgroundColor: Colors.dark.primary + "15",
  },
  domainPreviewDown: {
    backgroundColor: Colors.dark.error + "15",
  },
  domainPreviewText: {
    fontSize: Typography.small.fontSize - 2,
    color: Colors.dark.tabIconDefault,
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
    color: Colors.dark.buttonText,
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.backgroundRoot + "F5",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  successContent: {
    alignItems: "center",
    gap: Spacing.md,
  },
  successText: {
    ...Typography.h3,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  successSubtext: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
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
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255, 193, 7, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  xpBadgeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.gold,
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
    color: Colors.dark.textMuted,
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
    color: Colors.dark.textMuted,
  },
  recentNoteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.disabled,
  },
  recentNoteText: {
    flex: 1,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    fontStyle: "italic",
  },
  // Progress Engine V2 Styles
  playerDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  playerAvatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  playerInitialLarge: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  playerDetailInfo: {
    flex: 1,
  },
  playerDetailName: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  playerDetailMeta: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  levelBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  levelDotLarge: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  levelBadgeTextLarge: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
  },
  xpCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  xpHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  xpTotal: {
    ...Typography.h2,
    color: Colors.dark.gold,
  },
  xpHistory: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.disabled,
  },
  xpHistoryTitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
  },
  xpTransaction: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  xpAmount: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
    minWidth: 40,
  },
  xpSource: {
    flex: 1,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  domainGrid: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  domainCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  domainHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  domainName: {
    flex: 1,
    ...Typography.h4,
    color: Colors.dark.text,
  },
  progressBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  progressBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressValue: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    minWidth: 40,
    textAlign: "right",
  },
  domainMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  trendText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
  },
  assessmentBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  assessmentText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
  },
  assessmentToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  assessmentToggleActive: {
    backgroundColor: Colors.dark.gold + "30",
  },
  assessmentBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.gold + "15",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  assessmentBannerText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.gold,
  },
  assessmentOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  assessmentOption: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
  },
  assessmentOptionText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
  },
  saveAssessmentsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.gold,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  saveAssessmentsText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  momentumRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  momentumText: {
    fontSize: Typography.small.fontSize,
  },
  domainXpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  domainXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  domainXpText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  domainObsCount: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
  },
  domainAvgDelta: {
    fontSize: 10,
    fontWeight: "500",
  },
  trendsContainer: {
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  plansHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  addTemplateButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  templatesGrid: {
    gap: Spacing.md,
  },
  templateCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  templateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  templateTypeIndicator: {
    width: 4,
    height: 24,
    borderRadius: 2,
  },
  templateName: {
    flex: 1,
    ...Typography.h4,
    color: Colors.dark.text,
  },
  templateMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  templateMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  templateMetaText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  templateTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  templateTypeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
  },
  templateBallLevel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  templateBallText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  templateNotes: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
  },
  templateActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  templateActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  templateActionText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  modalScrollContainer: {
    height: "85%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  modalScrollContent: {
    flexGrow: 1,
    padding: Spacing.lg,
    paddingBottom: 120,
  },
  modalContent: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  modalField: {
    marginBottom: Spacing.md,
  },
  modalLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
  },
  modalInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  modalTextArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  typeButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  typeButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  typeButtonActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  typeButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  typeButtonTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  durationButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  durationButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  durationButtonActive: {
    backgroundColor: Colors.dark.xpCyan + "20",
    borderColor: Colors.dark.xpCyan,
  },
  durationButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  durationButtonTextActive: {
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  ballLevelButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  ballLevelButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
  },
  ballLevelButtonActive: {
    backgroundColor: Colors.dark.disabled + "20",
  },
  saveTemplateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  saveTemplateText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },

  // ============== CALM DESIGN STYLES ==============
  // Tab bar - simple pills
  calmTabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  calmTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  calmTabActive: {
    backgroundColor: Colors.dark.primary + "20",
  },
  calmTabText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500",
  },
  calmTabTextActive: {
    color: Colors.dark.primary,
  },

  // Period filter pills
  calmPeriodScroll: {
    flexGrow: 0,
    marginBottom: Spacing.sm,
  },
  calmPeriodContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  calmPeriodPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginRight: Spacing.xs,
  },
  calmPeriodPillActive: {
    backgroundColor: Colors.dark.primary + "20",
  },
  calmPeriodText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  calmPeriodTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },

  // Status filter pills
  calmStatusScroll: {
    flexGrow: 0,
    marginBottom: Spacing.md,
  },
  calmStatusContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  calmStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: "transparent",
    marginRight: Spacing.xs,
  },
  calmStatusText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },

  // Empty state
  calmEmptyCard: {
    alignItems: "center",
    padding: Spacing.xl,
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  calmEmptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  calmEmptyText: {
    ...Typography.body,
    color: Colors.dark.text,
    textAlign: "center",
  },
  calmEmptySubtext: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    marginTop: Spacing.xs,
  },

  // Session cards
  calmSessionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  calmSessionCardNeedsFeedback: {
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
  },
  calmSessionTimeBadge: {
    alignItems: "center",
    minWidth: 50,
  },
  calmSessionTimeText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  calmSessionDuration: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  calmSessionInfo: {
    flex: 1,
  },
  calmSessionType: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  calmSessionDate: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: 4,
  },
  calmSessionBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 4,
  },
  calmPendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  calmPendingText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.gold,
  },
  calmXpText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  calmDoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  calmDoneText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.primary,
  },

  // Session Card V2 - Gaming Style with Type Colors
  sessionCardV2: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.primary,
  },
  sessionCardV2NeedsFeedback: {
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
    shadowColor: Colors.dark.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  sessionTimeBadgeV2: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 56,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  sessionTimeTextV2: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
  },
  sessionDurationV2: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  sessionInfoV2: {
    flex: 1,
  },
  sessionTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: 4,
  },
  sessionTypeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sessionTypeV2: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerAvatarsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  playerAvatarMini: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.textMuted + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  sessionTypeIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  playerCountText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    marginLeft: Spacing.sm,
  },
  sessionDateV2: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: 4,
  },
  sessionBadgeRowV2: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 4,
  },
  feedbackNeededBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  feedbackNeededText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.gold,
    fontWeight: "500",
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  completedText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.primary,
  },
});
