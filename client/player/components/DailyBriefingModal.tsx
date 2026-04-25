import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  Animated,
  Pressable,
  StyleSheet,
  Dimensions,
  DimensionValue,
  ScrollView,
  Image,
} from "react-native";
import PagerView from "react-native-pager-view";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Spacing, BorderRadius, Colors, GlowColors, TextColors, Backgrounds } from "@/constants/theme";
import { useQuests } from "@/player/hooks/useQuests";
import { getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const STORAGE_KEY_PREFIX = "@glow_daily_briefing_";
const LAST_LEVEL_KEY = "@glow_last_briefing_level";

type PlayStyleKey =
  | "baseline_warrior"
  | "net_ninja"
  | "serve_machine"
  | "all_court_ace"
  | "counter_puncher"
  | "tactical_mastermind";

const ARCHETYPE_META: Record<PlayStyleKey, { name: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  baseline_warrior: { name: "Baseline Warrior", color: Colors.dark.accentText, icon: "tennisball" },
  net_ninja: { name: "Net Ninja", color: "#00E5FF", icon: "flash" },
  serve_machine: { name: "Serve Machine", color: "#FF8C00", icon: "rocket" },
  all_court_ace: { name: "All-Court Ace", color: TextColors.primary, icon: "star" },
  counter_puncher: { name: "Counter-Puncher", color: "#9B59B6", icon: "shield" },
  tactical_mastermind: { name: "Tactical Mastermind", color: "#FFD700", icon: "bulb" },
};

const LEVEL_TITLES: { min: number; max: number; title: string }[] = [
  { min: 1, max: 5, title: "Rookie" },
  { min: 6, max: 10, title: "Player" },
  { min: 11, max: 15, title: "Competitor" },
  { min: 16, max: 20, title: "Strategist" },
  { min: 21, max: 25, title: "Champion" },
  { min: 26, max: 30, title: "Legend" },
  { min: 31, max: 35, title: "Elite" },
  { min: 36, max: 40, title: "Master" },
  { min: 41, max: 45, title: "Grandmaster" },
  { min: 46, max: 999, title: "GOAT" },
];

const FEEDBACK_TYPE_COLORS: Record<string, string> = {
  technical: "#00E5FF",
  tactical: "#FFD700",
  effort: "#FF8C00",
  fitness: GlowColors.primary,
  mental: "#9B59B6",
  default: GlowColors.primary,
};

const BALL_COLORS: Record<string, string> = {
  red: "#E74C3C",
  orange: "#FF8C00",
  green: "#2ECC71",
  yellow: "#FFD700",
  purple: "#9B59B6",
};

function getLevelTitle(level: number): string {
  for (const t of LEVEL_TITLES) {
    if (level >= t.min && level <= t.max) return t.title;
  }
  return "GOAT";
}

function todayKey(): string {
  const d = new Date();
  return `${STORAGE_KEY_PREFIX}${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatCountdown(dateStr: string): string | null {
  const now = new Date();
  const target = new Date(dateStr);
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return null;
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffM = Math.floor((diffMs % 3_600_000) / 60_000);
  if (diffH > 0) return `in ${diffH}h ${diffM}m`;
  return `in ${diffM}m`;
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function formatSessionTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
}

function getBallColor(ball: string | null): string {
  if (!ball) return GlowColors.primary;
  return BALL_COLORS[ball.toLowerCase()] ?? GlowColors.primary;
}

function formatXP(xp: number): string {
  return xp.toLocaleString();
}

interface DashboardPlayer {
  id: string;
  name: string;
  level: number;
  xp: number;
  glowScore?: number;
  profilePhotoUrl?: string | null;
  playStyle?: string | null;
  ballLevel?: string | null;
}

interface NextSession {
  id: string;
  date: string;
  type: string;
  courtName?: string;
  coachName?: string;
  isLive?: boolean;
}

interface DailyBriefingModalProps {
  player: DashboardPlayer | null;
  nextSession: NextSession | null;
  coachName?: string | null;
  isGuest?: boolean;
}

export function DailyBriefingModal({
  player,
  nextSession,
  coachName,
  isGuest,
}: DailyBriefingModalProps) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [leveledUp, setLeveledUp] = useState(false);
  const [prevLevel, setPrevLevel] = useState<number | null>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const xpBarAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;
  const pagerRef = useRef<PagerView>(null);

  const { data: questsData } = useQuests(!isGuest);

  const streak = questsData?.streak;
  const activeQuest = useMemo(() => {
    if (!questsData) return null;
    const all = [
      ...questsData.daily.filter((q) => q.status === "active" || q.status === "in_progress"),
      ...questsData.weekly.filter((q) => q.status === "active" || q.status === "in_progress"),
    ];
    if (!all.length) return null;
    return all.sort((a, b) => {
      const ar = a.targetProgress > 0 ? a.currentProgress / a.targetProgress : 0;
      const br = b.targetProgress > 0 ? b.currentProgress / b.targetProgress : 0;
      return br - ar;
    })[0];
  }, [questsData]);

  const archetype = player?.playStyle
    ? ARCHETYPE_META[player.playStyle as PlayStyleKey] ?? null
    : null;
  const archetypeColor = archetype?.color ?? GlowColors.primary;

  const currentLevel = player?.level ?? 1;
  const levelTitle = getLevelTitle(currentLevel);

  useEffect(() => {
    if (isGuest || !player) return;

    (async () => {
      const seen = await AsyncStorage.getItem(todayKey());
      if (seen) return;

      const lastLevelStr = await AsyncStorage.getItem(LAST_LEVEL_KEY);
      const lastLevel = lastLevelStr ? parseInt(lastLevelStr, 10) : null;
      if (lastLevel !== null && currentLevel > lastLevel) {
        setLeveledUp(true);
        setPrevLevel(lastLevel);
      }

      setVisible(true);
    })();
  }, [isGuest, player, currentLevel]);

  useEffect(() => {
    if (!visible) return;
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.6, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
    const timer = setTimeout(() => {
      Animated.timing(xpBarAnim, { toValue: 1, duration: 900, useNativeDriver: false }).start();
    }, 400);
    return () => clearTimeout(timer);
  }, [visible]);

  const dismiss = useCallback(async () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_H,
      duration: 280,
      useNativeDriver: true,
    }).start(() => setVisible(false));
    await AsyncStorage.setItem(todayKey(), "seen");
    await AsyncStorage.setItem(LAST_LEVEL_KEY, String(currentLevel));
  }, [slideAnim, currentLevel]);

  const goToPage = useCallback(
    (page: number) => {
      pagerRef.current?.setPage(page);
      setCurrentPage(page);
    },
    []
  );

  const handleNext = useCallback(() => {
    if (currentPage < 2) {
      goToPage(currentPage + 1);
    } else {
      dismiss();
    }
  }, [currentPage, goToPage, dismiss]);

  if (!visible) return null;

  const xpPercent: DimensionValue = `${Math.min(((player?.xp ?? 0) % 300) / 3, 100)}%`;

  return (
    <Modal transparent animationType="none" visible={visible} statusBarTranslucent>
      <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
        >
          {/* ─── CARD 1: PLAYER STATUS ─── */}
          <View key="0" style={styles.card}>
            <CourtLines color={archetypeColor} />
            <View style={[styles.cardContent, { paddingTop: insets.top + 20 }]}>
              {leveledUp ? (
                <LevelUpContent
                  level={currentLevel}
                  prevLevel={prevLevel}
                  title={levelTitle}
                  color={archetypeColor}
                  glowAnim={glowAnim}
                />
              ) : (
                <PlayerStatusContent
                  player={player}
                  archetype={archetype}
                  archetypeColor={archetypeColor}
                  levelTitle={levelTitle}
                  xpPercent={xpPercent}
                  xpBarAnim={xpBarAnim}
                  streak={streak?.currentStreak ?? 0}
                  glowAnim={glowAnim}
                />
              )}
            </View>
          </View>

          {/* ─── CARD 2: COACH NOTES ─── */}
          <View key="1" style={styles.card}>
            <HexGrid />
            <View style={[styles.cardContent, { paddingTop: insets.top + 20 }]}>
              <CoachNotesContent
                nextSession={nextSession}
                player={player}
                activeQuest={activeQuest}
                visible={visible}
                isGuest={isGuest ?? false}
              />
            </View>
          </View>

          {/* ─── CARD 3: TODAY'S OPPORTUNITIES ─── */}
          <View key="2" style={styles.card}>
            <StarField />
            <View style={[styles.cardContent, { paddingTop: insets.top + 20 }]}>
              <TodaysOpportunitiesContent
                player={player}
                onLetsGo={dismiss}
                visible={visible}
                isGuest={isGuest ?? false}
              />
            </View>
          </View>
        </PagerView>

        {/* Skip button */}
        <Pressable
          style={[styles.skipBtn, { top: insets.top + 12 }]}
          onPress={dismiss}
          hitSlop={12}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>

        {/* Progress dots + nav */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.dots}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[styles.dot, currentPage === i && styles.dotActive]}
              />
            ))}
          </View>
          <Pressable style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextBtnText}>
              {currentPage === 2 ? "LET'S GO" : "NEXT"}
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#1A1A1A" />
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Card 1 sub-components ─────────────────────────────────────────────────

function PlayerStatusContent({
  player,
  archetype,
  archetypeColor,
  levelTitle,
  xpPercent,
  xpBarAnim,
  streak,
  glowAnim,
}: {
  player: DashboardPlayer | null;
  archetype: { name: string; color: string; icon: keyof typeof Ionicons.glyphMap } | null;
  archetypeColor: string;
  levelTitle: string;
  xpPercent: DimensionValue;
  xpBarAnim: Animated.Value;
  streak: number;
  glowAnim: Animated.Value;
}) {
  const glowOpacity = glowAnim.interpolate({ inputRange: [0.6, 1], outputRange: [0.35, 0.75] });
  const glowScale = glowAnim.interpolate({ inputRange: [0.6, 1], outputRange: [0.94, 1.06] });
  const ballColor = getBallColor(player?.ballLevel ?? null);

  return (
    <View style={s1.wrap}>
      {archetype ? (
        <View style={[s1.archetypePill, { borderColor: archetype.color + "50", backgroundColor: archetype.color + "12" }]}>
          <Ionicons name={archetype.icon} size={11} color={archetype.color} />
          <Text style={[s1.archetypeText, { color: archetype.color }]}>{archetype.name}</Text>
        </View>
      ) : null}

      <Text style={s1.name}>{player?.name ?? "Player"}</Text>

      <View style={s1.avatarWrap}>
        <Animated.View
          style={[
            s1.glowRing,
            {
              borderColor: archetypeColor,
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
              shadowColor: archetypeColor,
            },
          ]}
        />
        {player?.profilePhotoUrl ? (
          <Image
            source={{ uri: buildPhotoUrl(player.profilePhotoUrl)! }}
            style={[s1.avatarCircle, { borderColor: archetypeColor + "60" }]}
          />
        ) : (
          <View style={[s1.avatarCircle, { borderColor: archetypeColor + "60" }]}>
            <Ionicons name="person" size={48} color={archetypeColor} />
          </View>
        )}
      </View>

      <View style={[s1.levelBadge, { backgroundColor: archetypeColor + "20", borderColor: archetypeColor + "50" }]}>
        <Text style={[s1.levelText, { color: archetypeColor }]}>
          LEVEL {player?.level ?? 1} · {levelTitle.toUpperCase()}
        </Text>
      </View>

      <View style={s1.xpSection}>
        <View style={s1.xpLabelRow}>
          <Ionicons name="flash" size={12} color="#FFD700" />
          <Text style={s1.xpLabel}>{formatXP(player?.xp ?? 0)} XP</Text>
        </View>
        <View style={s1.xpBar}>
          <Animated.View
            style={[
              s1.xpFill,
              {
                width: xpBarAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", xpPercent as string],
                }),
                backgroundColor: archetypeColor,
              },
            ]}
          />
        </View>
      </View>

      {/* 2×2 Stats Grid */}
      <View style={s1.statsGrid}>
        <View style={s1.statTile}>
          <Text style={[s1.statValue, { color: Colors.dark.accentText }]}>{player?.level ?? 1}</Text>
          <Text style={s1.statLabel}>LEVEL</Text>
        </View>
        <View style={s1.statTile}>
          <View style={s1.streakValueRow}>
            <Ionicons
              name={streak > 0 ? "flame" : "flame-outline"}
              size={18}
              color={streak > 0 ? "#FF6B35" : "rgba(255,255,255,0.25)"}
            />
            <Text style={[s1.statValue, { color: streak > 0 ? "#FF6B35" : "rgba(255,255,255,0.35)" }]}>
              {streak}
            </Text>
          </View>
          <Text style={s1.statLabel}>STREAK</Text>
        </View>
        <View style={s1.statTile}>
          <Text style={[s1.statValue, { color: "#FFD700" }]}>{formatXP(player?.xp ?? 0)}</Text>
          <Text style={s1.statLabel}>TOTAL XP</Text>
        </View>
        <View style={s1.statTile}>
          {player?.ballLevel ? (
            <>
              <Ionicons name="tennisball" size={18} color={ballColor} />
              <Text style={[s1.statLabel, { marginTop: 2, color: ballColor }]}>
                {player.ballLevel.toUpperCase()}
              </Text>
            </>
          ) : (
            <>
              <Text style={[s1.statValue, { color: "rgba(255,255,255,0.3)" }]}>—</Text>
              <Text style={s1.statLabel}>BALL</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function LevelUpContent({
  level,
  prevLevel,
  title,
  color,
  glowAnim,
}: {
  level: number;
  prevLevel: number | null;
  title: string;
  color: string;
  glowAnim: Animated.Value;
}) {
  const glowScale = glowAnim.interpolate({ inputRange: [0.6, 1], outputRange: [0.92, 1.08] });

  return (
    <View style={lu.wrap}>
      <Text style={lu.eyebrow}>ACHIEVEMENT UNLOCKED</Text>
      <Animated.View style={[lu.levelCircle, { borderColor: color, transform: [{ scale: glowScale }], shadowColor: color }]}>
        <Text style={[lu.levelNum, { color }]}>{level}</Text>
      </Animated.View>
      <Text style={[lu.levelUpBadge, { color }]}>LEVEL UP</Text>
      <Text style={lu.titleText}>You&apos;re now a {title}</Text>
      {prevLevel !== null ? (
        <Text style={lu.subText}>
          {prevLevel} → {level}
        </Text>
      ) : null}
      <View style={lu.trophyRow}>
        <Ionicons name="trophy" size={20} color="#FFD700" />
        <Text style={lu.trophyText}>Keep pushing — your journey continues</Text>
      </View>
    </View>
  );
}

// ─── Card 2: Coach Notes ─────────────────────────────────────────────────────

interface FeedbackItem {
  id: string;
  message: string;
  feedbackType: string;
  coachName: string;
  xpAwarded: number;
  createdAt: string;
  sessionDate?: string;
}

function CoachNotesContent({
  nextSession,
  player,
  activeQuest,
  visible,
  isGuest,
}: {
  nextSession: NextSession | null;
  player: DashboardPlayer | null;
  activeQuest: { name: string; xpReward: number; currentProgress: number; targetProgress: number } | null;
  visible: boolean;
  isGuest: boolean;
}) {
  const { data: feedbackData, isLoading: feedbackLoading } = useQuery<FeedbackItem[]>({
    queryKey: ["/api/player/me/session-feedback"],
    enabled: visible && !isGuest,
    staleTime: 5 * 60 * 1000,
  });

  const recentFeedback = feedbackData?.slice(0, 3) ?? [];
  const sessionDate = nextSession ? new Date(nextSession.date) : null;
  const today = new Date();
  const isToday = sessionDate ? sessionDate.toDateString() === today.toDateString() : false;
  const sessionTimeStr = nextSession ? formatSessionTime(nextSession.date) : "";
  const sessionToday = !!(nextSession && isToday);
  const hasContent = sessionToday || recentFeedback.length > 0;
  const hasAnyContent = sessionToday || (!feedbackLoading && recentFeedback.length > 0) || (!feedbackLoading && !hasContent && activeQuest !== null);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s2.wrap}
      showsVerticalScrollIndicator={false}
    >
      {hasAnyContent ? <Text style={s2.eyebrow}>COACH NOTES</Text> : null}

      {/* Session today highlight row */}
      {sessionToday && nextSession ? (
        <View style={s2.sessionRow}>
          <View style={s2.sessionDot} />
          <View style={{ flex: 1 }}>
            <Text style={s2.sessionTime}>
              {`Training today at ${sessionTimeStr}${nextSession.courtName ? ` · ${nextSession.courtName}` : ""}`}
            </Text>
            {nextSession.coachName ? (
              <Text style={s2.sessionCoach}>with {nextSession.coachName}</Text>
            ) : null}
          </View>
          <Ionicons name="tennisball" size={16} color={Colors.dark.accentText} />
        </View>
      ) : null}

      {/* Feedback quote cards — only render once loaded */}
      {!feedbackLoading && recentFeedback.length > 0 ? (
        <View style={s2.feedbackList}>
          {recentFeedback.map((fb) => {
            const typeColor = FEEDBACK_TYPE_COLORS[fb.feedbackType?.toLowerCase()] ?? FEEDBACK_TYPE_COLORS.default;
            return (
              <View key={fb.id} style={[s2.feedbackCard, { borderLeftColor: typeColor }]}>
                <View style={s2.feedbackHeader}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s2.feedbackCoach}>{fb.coachName}</Text>
                    <Text style={s2.feedbackDate}>{formatRelativeDate(fb.createdAt)}</Text>
                  </View>
                  <View style={[s2.typeBadge, { backgroundColor: typeColor + "20", borderColor: typeColor + "40" }]}>
                    <Text style={[s2.typeBadgeText, { color: typeColor }]}>
                      {fb.feedbackType ? fb.feedbackType.charAt(0).toUpperCase() + fb.feedbackType.slice(1) : "Note"}
                    </Text>
                  </View>
                </View>
                <Text style={s2.feedbackMessage} numberOfLines={3}>
                  {`"${fb.message}"`}
                </Text>
                {Number(fb.xpAwarded) > 0 ? (
                  <View style={s2.xpChip}>
                    <Ionicons name="flash" size={10} color={Colors.dark.accentText} />
                    <Text style={s2.xpChipText}>{`+${fb.xpAwarded} XP`}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Fallback: active quest progress — only after load, no feedback, no session */}
      {!feedbackLoading && !hasContent && activeQuest ? (
        <View style={s2.questFallback}>
          <View style={s2.questHeader}>
            <Ionicons name="flash" size={14} color="#FFD700" />
            <Text style={s2.questLabel}>Active Quest</Text>
          </View>
          <Text style={s2.questName}>{activeQuest.name}</Text>
          <View style={s2.questBar}>
            <View
              style={[
                s2.questFill,
                {
                  width: `${activeQuest.targetProgress > 0 ? Math.min((activeQuest.currentProgress / activeQuest.targetProgress) * 100, 100) : 0}%` as DimensionValue,
                },
              ]}
            />
          </View>
          <Text style={s2.questProgress}>
            {`${activeQuest.currentProgress} / ${activeQuest.targetProgress} · +${activeQuest.xpReward} XP`}
          </Text>
        </View>
      ) : null}

    </ScrollView>
  );
}

// ─── Card 3: Today's Opportunities ───────────────────────────────────────────

interface OpenSession {
  id: string;
  title?: string;
  startTime: string;
  courtName?: string;
  coachName?: string;
  currentPlayers: number;
  maxPlayers: number;
  status?: string;
}

interface MatchChallenge {
  id: string;
  challengerId: string;
  challengerName: string;
  challengerPhoto?: string;
  challengerLevel?: number;
  status: string;
}

interface NearbyPlayer {
  id: string;
  name: string;
  level: number;
  avatarUrl?: string;
  ballLevel?: string;
}

function TodaysOpportunitiesContent({
  player,
  onLetsGo,
  visible,
  isGuest,
}: {
  player: DashboardPlayer | null;
  onLetsGo: () => void;
  visible: boolean;
  isGuest: boolean;
}) {
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<OpenSession[]>({
    queryKey: ["/api/play/sessions"],
    enabled: visible && !isGuest,
    staleTime: 5 * 60 * 1000,
  });

  const { data: challengesData, isLoading: challengesLoading } = useQuery<MatchChallenge[]>({
    queryKey: ["/api/match-challenges?playerId=" + (player?.id ?? "")],
    enabled: visible && !!player?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: nearbyData, isLoading: nearbyLoading } = useQuery<NearbyPlayer[]>({
    queryKey: ["/api/play/nearby-players?filter=openToPlay"],
    enabled: visible && !isGuest,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = sessionsLoading || challengesLoading || nearbyLoading;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const openSessions = (sessionsData ?? []).filter(s => {
    const d = new Date(s.startTime);
    return d >= todayStart && d <= todayEnd;
  }).slice(0, 2);

  const pendingChallenges = (challengesData ?? []).filter(
    (c) => c.status === "pending" && c.challengerId !== player?.id
  );
  const allReadyPlayers = nearbyData ?? [];
  const readyPlayers = allReadyPlayers.slice(0, 4);
  const isEmpty = !isLoading && openSessions.length === 0 && pendingChallenges.length === 0 && allReadyPlayers.length === 0;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s3.wrap}
      showsVerticalScrollIndicator={false}
    >
      {isEmpty ? (
        <View style={s3.quietWrap}>
          <Text style={s3.quietText}>Court&apos;s quiet today</Text>
        </View>
      ) : (
        <>
          <Text style={s3.eyebrow}>TODAY</Text>
          <Text style={s3.headline}>What&apos;s on</Text>

          {/* Open Sessions — render after load */}
          {!sessionsLoading && openSessions.length > 0 ? (
            <View style={s3.section}>
              <Text style={s3.sectionLabel}>OPEN SESSIONS</Text>
              {openSessions.map((session) => {
                const spots = session.maxPlayers - session.currentPlayers;
                const spotsLabel = spots <= 0 ? "Full" : spots <= 2 ? "Almost full" : `${spots} spots`;
                const spotsColor = spots <= 0 ? "rgba(255,255,255,0.3)" : spots <= 2 ? "#FFD700" : GlowColors.primary;
                return (
                  <View key={session.id} style={s3.sessionCard}>
                    <Text style={s3.sessionTime}>{formatSessionTime(session.startTime)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s3.sessionCourt} numberOfLines={1}>
                        {session.courtName ?? session.title ?? "Group Session"}
                      </Text>
                      {session.coachName ? (
                        <Text style={s3.sessionCoach}>{session.coachName}</Text>
                      ) : null}
                    </View>
                    <View style={[s3.spotsPill, { backgroundColor: spotsColor + "18", borderColor: spotsColor + "40" }]}>
                      <Text style={[s3.spotsText, { color: spotsColor }]}>{spotsLabel}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Pending Challenges — render after load */}
          {!challengesLoading && pendingChallenges.length > 0 ? (
            <View style={s3.section}>
              <Text style={s3.sectionLabel}>{pendingChallenges.length > 1 ? `INCOMING CHALLENGES (${pendingChallenges.length})` : "INCOMING CHALLENGE"}</Text>
              {pendingChallenges.slice(0, 2).map((ch) => (
                <View key={ch.id} style={s3.challengeCard}>
                  <View style={s3.challengeAvatar}>
                    {ch.challengerPhoto ? (
                      <Image source={{ uri: ch.challengerPhoto.startsWith("http") ? ch.challengerPhoto : `${getStaticAssetsUrl()}${ch.challengerPhoto}` }} style={s3.challengeAvatarImg} />
                    ) : (
                      <Ionicons name="person" size={18} color="rgba(255,255,255,0.5)" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={s3.challengerName}>{ch.challengerName}</Text>
                      {ch.challengerLevel !== undefined ? (
                        <View style={s3.levelBadge}>
                          <Text style={s3.levelBadgeText}>{`Lv ${ch.challengerLevel}`}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={s3.challengerSub}>challenged you to a match</Text>
                  </View>
                  <Pressable style={s3.viewPill} onPress={onLetsGo}>
                    <Text style={s3.viewPillText}>View</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {/* Players Ready — render after load */}
          {!nearbyLoading && readyPlayers.length > 0 ? (
            <View style={s3.section}>
              <Text style={s3.sectionLabel}>PLAYERS READY NOW</Text>
              <View style={s3.playersRow}>
                {readyPlayers.map((p) => {
                  const firstNameEnd = p.name.indexOf(" ");
                  const firstName = firstNameEnd > 0 ? p.name.slice(0, firstNameEnd) : p.name;
                  return (
                    <View key={p.id} style={s3.playerBubble}>
                      <View style={s3.playerAvatar}>
                        {p.avatarUrl ? (
                          <Image source={{ uri: p.avatarUrl.startsWith("http") ? p.avatarUrl : `${getStaticAssetsUrl()}${p.avatarUrl}` }} style={s3.playerAvatarImg} />
                        ) : (
                          <Ionicons name="person" size={20} color="rgba(255,255,255,0.5)" />
                        )}
                      </View>
                      <Text style={s3.playerName} numberOfLines={1}>{firstName}</Text>
                      <Text style={s3.playerLevel}>{`Lv ${p.level}`}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={s3.playersCount}>{`${allReadyPlayers.length} players open to play`}</Text>
            </View>
          ) : null}
        </>
      )}

      <Pressable style={s3.letsGoBtn} onPress={onLetsGo}>
        <Text style={s3.letsGoBtnText}>LET&apos;S GO</Text>
        <Ionicons name="arrow-forward" size={18} color="#0D1117" />
      </Pressable>
    </ScrollView>
  );
}

// ─── Background decorations ────────────────────────────────────────────────

function CourtLines({ color }: { color: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[bg.courtCircle, { borderColor: color + "18" }]} />
      <View style={[bg.courtCircle2, { borderColor: color + "10" }]} />
      <View style={[bg.courtLine, { top: "30%", backgroundColor: color + "08" }]} />
      <View style={[bg.courtLine, { top: "55%", backgroundColor: color + "06" }]} />
    </View>
  );
}

function HexGrid() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {[0.08, 0.22, 0.38, 0.55, 0.7, 0.85].map((top, i) =>
        [0.1, 0.4, 0.75].map((left, j) => (
          <View
            key={`${i}-${j}`}
            style={[
              bg.hexDot,
              {
                top: `${top * 100}%` as DimensionValue,
                left: `${left * 100}%` as DimensionValue,
                opacity: 0.07 + (((i + j) % 3) * 0.02),
              },
            ]}
          />
        ))
      )}
    </View>
  );
}

function StarField() {
  const stars = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 28; i++) {
      arr.push({
        top: `${(i * 37 + 5) % 95}%` as DimensionValue,
        left: `${(i * 53 + 8) % 93}%` as DimensionValue,
        size: i % 3 === 0 ? 3 : 2,
        opacity: 0.08 + (i % 5) * 0.03,
      });
    }
    return arr;
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            borderRadius: s.size,
            backgroundColor: TextColors.primary,
            opacity: s.opacity,
          }}
        />
      ))}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#060B10",
  },
  pager: {
    flex: 1,
  },
  card: {
    flex: 1,
    backgroundColor: "#060B10",
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
  },
  skipBtn: {
    position: "absolute",
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.chipBackgroundStrong,
  },
  skipText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontWeight: "500",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingTop: 12,
    backgroundColor: "rgba(6,11,16,0.95)",
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  dotActive: {
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: GlowColors.primary,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: BorderRadius.full,
  },
  nextBtnText: {
    color: "#0D1117",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
}));

// Card 1 styles
const s1 = makeReactiveStyles(() => StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 14,
    paddingTop: 8,
  },
  archetypePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  archetypeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 32,
    fontWeight: "900",
    color: TextColors.primary,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  avatarWrap: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
  },
  glowRing: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
  },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    backgroundColor: Colors.dark.chipBackground,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  levelBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  levelText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  xpSection: {
    width: "100%",
    gap: 5,
  },
  xpLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  xpLabel: {
    fontSize: 12,
    color: "#FFD700",
    fontWeight: "700",
  },
  xpBar: {
    height: 5,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 3,
    overflow: "hidden",
  },
  xpFill: {
    height: 5,
    borderRadius: 3,
  },
  statsGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  statTile: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#0F1A0A",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
    color: TextColors.primary,
    letterSpacing: -0.5,
  },
  streakValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "rgba(255,255,255,0.35)",
    textTransform: "uppercase",
  },
}));

// Level-up styles
const lu = makeReactiveStyles(() => StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 18,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
    color: "rgba(255,215,0,0.6)",
    textTransform: "uppercase",
  },
  levelCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,215,0,0.06)",
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
  },
  levelNum: {
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: -1,
  },
  levelUpBadge: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 3,
  },
  titleText: {
    fontSize: 18,
    fontWeight: "700",
    color: TextColors.primary,
  },
  subText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
  },
  trophyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(255,215,0,0.06)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.12)",
  },
  trophyText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "500",
  },
}));

// Card 2 styles
const s2 = makeReactiveStyles(() => StyleSheet.create({
  wrap: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 16,
    paddingBottom: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
    color: Colors.dark.accentText,
    textTransform: "uppercase",
  },
  headline: {
    fontSize: 30,
    fontWeight: "900",
    color: TextColors.primary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.dark.accentTextSoft,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.accentTextSoft,
    padding: 14,
  },
  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GlowColors.primary,
  },
  sessionTime: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.accentText,
  },
  sessionCoach: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  feedbackList: {
    gap: 10,
  },
  feedbackCard: {
    backgroundColor: "#0D1B2A",
    borderRadius: BorderRadius.md,
    padding: 14,
    borderLeftWidth: 3,
    gap: 8,
  },
  feedbackHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  feedbackCoach: {
    fontSize: 13,
    fontWeight: "700",
    color: TextColors.primary,
  },
  feedbackDate: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  feedbackMessage: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    fontStyle: "italic",
    lineHeight: 19,
  },
  xpChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentTextSoft,
  },
  xpChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.accentText,
  },
  questFallback: {
    backgroundColor: "rgba(255,215,0,0.05)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.12)",
    padding: 16,
    gap: 8,
  },
  questHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  questLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#FFD700",
    textTransform: "uppercase",
  },
  questName: {
    fontSize: 15,
    fontWeight: "700",
    color: TextColors.primary,
  },
  questBar: {
    height: 4,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 2,
    overflow: "hidden",
  },
  questFill: {
    height: 4,
    backgroundColor: "#FFD700",
    borderRadius: 2,
  },
  questProgress: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
  },
}));

// Card 3 styles
const s3 = makeReactiveStyles(() => StyleSheet.create({
  wrap: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 16,
    paddingBottom: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
    color: "rgba(255,255,255,0.3)",
    textTransform: "uppercase",
  },
  headline: {
    fontSize: 32,
    fontWeight: "900",
    color: TextColors.primary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.8,
    color: "rgba(255,255,255,0.3)",
    textTransform: "uppercase",
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Backgrounds.root,
    borderRadius: BorderRadius.md,
    padding: 12,
  },
  sessionTime: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.accentText,
    minWidth: 60,
  },
  sessionCourt: {
    fontSize: 13,
    fontWeight: "700",
    color: TextColors.primary,
  },
  sessionCoach: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  spotsPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  spotsText: {
    fontSize: 10,
    fontWeight: "700",
  },
  challengeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Backgrounds.root,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,107,53,0.2)",
    padding: 12,
  },
  challengeAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  challengeAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  challengerName: {
    fontSize: 13,
    fontWeight: "700",
    color: TextColors.primary,
  },
  challengerSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    marginTop: 1,
  },
  levelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Colors.dark.accentTextSoft,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.25)",
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.accentText,
  },
  viewPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentTextSoft,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.3)",
  },
  viewPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.accentText,
  },
  playersRow: {
    flexDirection: "row",
    gap: 12,
  },
  playerBubble: {
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.chipBackground,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  playerAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  playerName: {
    fontSize: 11,
    fontWeight: "600",
    color: TextColors.primary,
    textAlign: "center",
  },
  playerLevel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
  },
  playersCount: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
  quietWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  quietText: {
    fontSize: 17,
    color: "rgba(255,255,255,0.3)",
    fontWeight: "600",
    textAlign: "center",
  },
  letsGoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GlowColors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.full,
    marginTop: 8,
  },
  letsGoBtnText: {
    color: "#0D1117",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
}));

// Background styles
const bg = makeReactiveStyles(() => StyleSheet.create({
  courtCircle: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    borderWidth: 1,
    left: SCREEN_W / 2 - 170,
    top: SCREEN_H / 2 - 240,
  },
  courtCircle2: {
    position: "absolute",
    width: 500,
    height: 500,
    borderRadius: 250,
    borderWidth: 1,
    left: SCREEN_W / 2 - 250,
    top: SCREEN_H / 2 - 300,
  },
  courtLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
  },
  hexDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GlowColors.primary,
  },
}));
