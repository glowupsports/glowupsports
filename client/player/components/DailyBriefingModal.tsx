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
} from "react-native";
import PagerView from "react-native-pager-view";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Spacing, BorderRadius, Colors, GlowColors } from "@/constants/theme";
import { useQuests } from "@/player/hooks/useQuests";

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
  baseline_warrior: { name: "Baseline Warrior", color: "#C8FF3D", icon: "tennisball" },
  net_ninja: { name: "Net Ninja", color: "#00E5FF", icon: "flash" },
  serve_machine: { name: "Serve Machine", color: "#FF8C00", icon: "rocket" },
  all_court_ace: { name: "All-Court Ace", color: "#FFFFFF", icon: "star" },
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

interface DashboardPlayer {
  id: string;
  name: string;
  level: number;
  xp: number;
  glowScore?: number;
  profilePhotoUrl?: string | null;
  playStyle?: string | null;
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

  const recentFeedback = useRef(false);

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

          {/* ─── CARD 2: TODAY'S BRIEFING ─── */}
          <View key="1" style={styles.card}>
            <HexGrid />
            <View style={[styles.cardContent, { paddingTop: insets.top + 20 }]}>
              <TodaysBriefingContent
                nextSession={nextSession}
                coachName={coachName}
                activeQuest={activeQuest}
                streak={streak?.currentStreak ?? 0}
              />
            </View>
          </View>

          {/* ─── CARD 3: ON THE COURT ─── */}
          <View key="2" style={styles.card}>
            <StarField />
            <View style={[styles.cardContent, { paddingTop: insets.top + 20 }]}>
              <OnTheCourtContent onLetsGo={dismiss} />
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
  const firstName = player?.name?.split(" ")[0] ?? "Player";

  const glowOpacity = glowAnim.interpolate({ inputRange: [0.6, 1], outputRange: [0.35, 0.75] });
  const glowScale = glowAnim.interpolate({ inputRange: [0.6, 1], outputRange: [0.94, 1.06] });

  return (
    <View style={s1.wrap}>
      <Text style={s1.eyebrow}>WELCOME BACK</Text>
      <Text style={s1.name}>{firstName}</Text>

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
        <View style={[s1.avatarCircle, { borderColor: archetypeColor + "60" }]}>
          <Ionicons name="person" size={48} color={archetypeColor} />
        </View>
      </View>

      <View style={s1.levelRow}>
        <View style={[s1.levelBadge, { backgroundColor: archetypeColor + "20", borderColor: archetypeColor + "50" }]}>
          <Text style={[s1.levelText, { color: archetypeColor }]}>
            LEVEL {player?.level ?? 1} · {levelTitle.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={s1.xpSection}>
        <View style={s1.xpLabelRow}>
          <Ionicons name="flash" size={12} color="#FFD700" />
          <Text style={s1.xpLabel}>{player?.xp ?? 0} XP</Text>
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

      <View style={s1.streakRow}>
        <Ionicons
          name={streak > 0 ? "flame" : "flame-outline"}
          size={22}
          color={streak > 0 ? "#FF6B35" : Colors.dark.textSubtle}
        />
        <Text style={[s1.streakCount, streak === 0 && { color: Colors.dark.textSubtle }]}>
          {streak}
        </Text>
        <Text style={s1.streakLabel}>
          {streak === 0 ? "Start your fire today" : `day streak`}
        </Text>
      </View>

      {archetype ? (
        <View style={[s1.archetypePill, { borderColor: archetype.color + "50", backgroundColor: archetype.color + "12" }]}>
          <Ionicons name={archetype.icon} size={11} color={archetype.color} />
          <Text style={[s1.archetypeText, { color: archetype.color }]}>{archetype.name}</Text>
        </View>
      ) : null}
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
      <Text style={lu.titleText}>You're now a {title}</Text>
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

// ─── Card 2 sub-component ──────────────────────────────────────────────────

function TodaysBriefingContent({
  nextSession,
  coachName,
  activeQuest,
  streak,
}: {
  nextSession: NextSession | null;
  coachName?: string | null;
  activeQuest: { name: string; xpReward: number } | null;
  streak: number;
}) {
  const countdown = nextSession ? formatCountdown(nextSession.date) : null;
  const sessionToday = nextSession && countdown !== null;

  const items: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; sub: string }[] = [];

  if (sessionToday && nextSession) {
    items.push({
      icon: "tennisball",
      color: "#C8FF3D",
      label: `Session ${countdown}`,
      sub: [nextSession.coachName && `with ${nextSession.coachName}`, nextSession.courtName].filter(Boolean).join(" · ") || nextSession.type,
    });
  }

  if (coachName) {
    items.push({
      icon: "chatbubble-ellipses",
      color: "#00D4FF",
      label: "Coach feedback waiting",
      sub: `${coachName} shared notes on your last session`,
    });
  }

  if (activeQuest) {
    items.push({
      icon: "flash",
      color: "#FFD700",
      label: activeQuest.name,
      sub: `+${activeQuest.xpReward} XP on completion`,
    });
  }

  if (streak > 0) {
    items.push({
      icon: "flame",
      color: "#FF6B35",
      label: `Don't break your ${streak}-day streak`,
      sub: "Complete any quest before midnight",
    });
  }

  const shown = items.slice(0, 4);
  const isEmpty = shown.length === 0;

  return (
    <View style={s2.wrap}>
      <Text style={s2.eyebrow}>TODAY'S BRIEFING</Text>
      <Text style={s2.headline}>
        {isEmpty ? "All clear" : "Your day at a glance"}
      </Text>

      {isEmpty ? (
        <View style={s2.emptyWrap}>
          <Ionicons name="tennisball-outline" size={40} color={Colors.dark.textSubtle} />
          <Text style={s2.emptyText}>Nothing urgent — enjoy your day and keep grinding</Text>
        </View>
      ) : (
        <View style={s2.itemList}>
          {shown.map((item, i) => (
            <View key={i} style={s2.row}>
              <View style={[s2.iconWrap, { backgroundColor: item.color + "18" }]}>
                <Ionicons name={item.icon} size={16} color={item.color} />
              </View>
              <View style={s2.rowText}>
                <Text style={s2.rowLabel}>{item.label}</Text>
                <Text style={s2.rowSub}>{item.sub}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Card 3 sub-component ──────────────────────────────────────────────────

function OnTheCourtContent({ onLetsGo }: { onLetsGo: () => void }) {
  const today = new Date();
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;

  return (
    <View style={s3.wrap}>
      <Text style={s3.eyebrow}>ON THE COURT</Text>
      <Text style={s3.headline}>Ready to play?</Text>
      <Text style={s3.sub}>
        Find open sessions, challenge players, and level up your game — all from your home screen.
      </Text>

      {isWeekend ? (
        <View style={s3.xpPill}>
          <Ionicons name="flash" size={14} color="#FFD700" />
          <Text style={s3.xpPillText}>1.5x WEEKEND XP BOOST ACTIVE</Text>
        </View>
      ) : null}

      <View style={s3.featureList}>
        {[
          { icon: "tennisball" as const, text: "Open sessions near you" },
          { icon: "people" as const, text: "Players looking for matches" },
          { icon: "trophy" as const, text: "Daily quests waiting" },
        ].map((f, i) => (
          <View key={i} style={s3.featureRow}>
            <Ionicons name={f.icon} size={14} color={GlowColors.primary} />
            <Text style={s3.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>

      <Pressable style={s3.letsGoBtn} onPress={onLetsGo}>
        <Text style={s3.letsGoBtnText}>LET'S GO</Text>
        <Ionicons name="arrow-forward" size={18} color="#0D1117" />
      </Pressable>
    </View>
  );
}

// ─── Background decorations ────────────────────────────────────────────────

function CourtLines({ color }: { color: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[bg.courtCircle, { borderColor: color + "12" }]} />
      <View style={[bg.courtCircle2, { borderColor: color + "08" }]} />
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
                opacity: 0.06 + (((i + j) % 3) * 0.02),
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
            backgroundColor: "#FFFFFF",
            opacity: s.opacity,
          }}
        />
      ))}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
    justifyContent: "center",
  },
  skipBtn: {
    position: "absolute",
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.08)",
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
});

// Card 1 styles
const s1 = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 16,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
    color: "rgba(255,255,255,0.35)",
    textTransform: "uppercase",
  },
  name: {
    fontSize: 36,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  avatarWrap: {
    width: 110,
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
  },
  glowRing: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  levelRow: {
    alignItems: "center",
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
    gap: 6,
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
    height: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  xpFill: {
    height: 6,
    borderRadius: 3,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignSelf: "center",
  },
  streakCount: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  streakLabel: {
    fontSize: 12,
    color: Colors.dark.textSubtle,
    fontWeight: "500",
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
});

// Level-up styles
const lu = StyleSheet.create({
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
    color: "#FFFFFF",
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
});

// Card 2 styles
const s2 = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    gap: 20,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
    color: "rgba(255,255,255,0.3)",
    textTransform: "uppercase",
  },
  headline: {
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  emptyWrap: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textSubtle,
    textAlign: "center",
    lineHeight: 20,
  },
  itemList: {
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  rowSub: {
    fontSize: 11,
    color: Colors.dark.textSubtle,
  },
});

// Card 3 styles
const s3 = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    gap: 22,
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
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 14,
    color: Colors.dark.textSubtle,
    lineHeight: 20,
  },
  xpPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,215,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.2)",
  },
  xpPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFD700",
    letterSpacing: 0.5,
  },
  featureList: {
    gap: 10,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "500",
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
});

// Background styles
const bg = StyleSheet.create({
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
    backgroundColor: "#C8FF3D",
  },
});
