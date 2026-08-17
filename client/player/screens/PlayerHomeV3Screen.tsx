/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║              PLAYER HOME V3  —  NEON DARK DESIGN                           ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Redesigned to match the approved reference mockup (Aug 17, 2026).          ║
 * ║  Key structural change: Next Session (left, ~57%) + Glow Ability (right,   ║
 * ║  ~43%) are SIDE-BY-SIDE in one horizontal row.                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Image,
  ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, Filter, FeGaussianBlur, FeMerge, FeMergeNode } from "react-native-svg";

import { useAuth } from "@/coach/context/AuthContext";
import { usePlayer } from "@/player/context/PlayerContext";

// ─── Brand assets ─────────────────────────────────────────────────────────────
const IMG = {
  racket:      require("@/assets/images/home/racket.png")        as ImageSourcePropType,
  ballLimeOrb: require("@/assets/images/home/ball_lime_orb.png") as ImageSourcePropType,
  ballBlue:    require("@/assets/images/home/ball_blue.png")     as ImageSourcePropType,
  playerHero:  require("@/assets/images/home/player_hero.png")   as ImageSourcePropType,
  flame:       require("@/assets/images/home/icon_flame.png")    as ImageSourcePropType,
  star:        require("@/assets/images/home/icon_star.png")     as ImageSourcePropType,
  trophy:      require("@/assets/images/home/icon_trophy.png")   as ImageSourcePropType,
  ballLime:    require("@/assets/images/home/icon_ball_lime.png") as ImageSourcePropType,
  shoe:        require("@/assets/images/home/icon_shoe.png")     as ImageSourcePropType,
  target:      require("@/assets/images/home/icon_target.png")   as ImageSourcePropType,
  calendar:    require("@/assets/images/home/icon_calendar.png") as ImageSourcePropType,
  group:       require("@/assets/images/home/icon_group.png")    as ImageSourcePropType,
  ai:          require("@/assets/images/home/icon_ai.png")       as ImageSourcePropType,
  chat:        require("@/assets/images/home/icon_chat.png")     as ImageSourcePropType,
};

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  bg:         "#020811",
  purple:     "#9B5CFF",
  purpleDim:  "rgba(155,92,255,0.16)",
  purpleBord: "rgba(155,92,255,0.35)",
  lime:       "#CFFF00",
  limeDim:    "rgba(207,255,0,0.10)",
  limeBord:   "rgba(207,255,0,0.30)",
  blue:       "#2196FF",
  blueDim:    "rgba(33,150,255,0.12)",
  blueBord:   "rgba(33,150,255,0.30)",
  cyan:       "#18E3FF",
  cyanDim:    "rgba(24,227,255,0.10)",
  text:       "#F0F2FC",
  textSub:    "#9DA3BA",
  textMuted:  "#5C6278",
  card:       "#070E1C",
  cardBord:   "rgba(255,255,255,0.06)",
};

// ─── HomeData interface ────────────────────────────────────────────────────────
interface HomeData {
  dashboard: {
    player: {
      id: string; name: string; level: number; xp: number;
      glowScore: number; levelProgressPct?: number; xpToNextLevel?: number;
      ballLevel: string | null; streak: number;
      checkinStreak?: number; profilePhotoUrl?: string | null;
    };
    coach: { id: string; name: string; photoUrl?: string | null } | null;
    academy: { id: string; name: string } | null;
    credits?: { total: number; group: number; private: number; semi_private: number };
    nextSession?: {
      id: string; date: string; type: string; endTime?: string;
      duration?: number | null; courtName?: string | null;
      coachName?: string | null; coachPhotoUrl?: string | null;
    } | null;
    lastFeedback?: {
      message: string; date: string | Date;
      coachName: string; coachPhotoUrl?: string | null;
    } | null;
    weeklyRecap?: { sessions: number } | null;
    isFreePlayer?: boolean;
  } | null;
  dailyFocus: { title: string; description: string } | null;
}

// ─── Relative time helper ─────────────────────────────────────────────────────
function relativeTime(d: string | Date | null | undefined): string {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── GlowRing ─────────────────────────────────────────────────────────────────
function GlowRing({ score, size = 150 }: { score: number; size?: number }) {
  const stroke = size < 130 ? 8 : 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(3, Math.min(score, 100));          // min 3% so ring is visible
  const filled = (pct / 100) * circ;
  const scoreFontSize = size < 130 ? 38 : 52;
  const subFontSize   = size < 130 ? 11 : 13;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFillObject}>
        <Defs>
          <Filter id="glow">
            <FeGaussianBlur stdDeviation="4" result="blur" />
            <FeMerge><FeMergeNode in="blur" /><FeMergeNode in="SourceGraphic" /></FeMerge>
          </Filter>
        </Defs>
        {/* Track */}
        <Circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {/* Fill */}
        <Circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={C.lime} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          rotation={-90} originX={size / 2} originY={size / 2}
          filter="url(#glow)"
        />
      </Svg>
      <Text style={{ fontSize: scoreFontSize, fontWeight: "900", color: C.lime, lineHeight: scoreFontSize + 4 }}>{score}</Text>
      <Text style={{ fontSize: subFontSize, color: C.textMuted, marginTop: -2 }}>/100</Text>
    </View>
  );
}

// ─── LevelRing — Journey 4th column ──────────────────────────────────────────
function LevelRing({ pct }: { pct: number }) {
  const size = 72;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (Math.min(pct, 100) / 100) * circ;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFillObject}>
        <Circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(155,92,255,0.15)" strokeWidth={stroke} />
        <Circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={C.purple} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          rotation={-90} originX={size / 2} originY={size / 2}
        />
      </Svg>
      <Text style={{ fontSize: 14, fontWeight: "900", color: C.purple }}>{pct}%</Text>
    </View>
  );
}

// ─── BrandImg ─────────────────────────────────────────────────────────────────
function BrandImg({ source, size, style }: { source: ImageSourcePropType; size: number; style?: object }) {
  return <Image source={source} style={[{ width: size, height: size, resizeMode: "contain" }, style]} />;
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────
function SectionLabel({ text, color = C.purple }: { text: string; color?: string }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color, textTransform: "uppercase" }}>
      {text}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export function PlayerHomeV3Screen({ onSwitchToClassic }: { onSwitchToClassic?: () => void }) {
  const { user, isGuest } = useAuth();
  const playerCtx = usePlayer();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const { data: homeData, refetch } = useQuery<HomeData>({
    queryKey: ["/api/player/me/home-data"],
    enabled: !!user?.playerId && !isGuest,
    staleTime: 0,
    refetchInterval: 120_000,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const dash = homeData?.dashboard;
  const dp   = dash?.player;

  const player = useMemo(() => ({
    name:            dp?.name              ?? user?.displayName ?? "Player",
    level:           dp?.level             ?? playerCtx.level   ?? 1,
    xp:              dp?.xp               ?? playerCtx.xp      ?? 0,
    glowScore:       dp?.glowScore         ?? playerCtx.glowScore ?? 0,
    levelProgressPct: dp?.levelProgressPct ?? 0,
    streak:          dp?.streak            ?? 0,
    photoUrl:        dp?.profilePhotoUrl   ?? user?.profilePhotoUrl ?? null,
    initial:         (dp?.name ?? user?.displayName ?? "P").charAt(0).toUpperCase(),
    ballLevel:       dp?.ballLevel,
  }), [dp, user, playerCtx.level, playerCtx.xp, playerCtx.glowScore]);

  const credits      = dash?.credits;
  const nextSes      = dash?.nextSession;
  const coachData    = dash?.coach;
  const academy      = dash?.academy;
  const lastFeedback = dash?.lastFeedback;
  const weeklyRecap  = dash?.weeklyRecap;

  const nav = (screen: string, params?: object) => {
    try { navigation.navigate(screen, params); } catch { /* no-op */ }
  };

  // ── Format session date ────────────────────────────────────────────────────
  const sesInfo = useMemo(() => {
    if (!nextSes?.date) return { day: "No Session", time: "" };
    const d = new Date(nextSes.date);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const day = isToday
      ? "Today"
      : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return { day, time };
  }, [nextSes]);

  // Weekly recap line
  const recapLine = useMemo(() => {
    const parts: string[] = [];
    if (weeklyRecap?.sessions) parts.push(`+${weeklyRecap.sessions} session${weeklyRecap.sessions !== 1 ? "s" : ""}`);
    if (player.streak > 0)     parts.push(`${player.streak}-day streak`);
    if (player.xp > 0)         parts.push(`${player.xp.toLocaleString()} XP`);
    return parts.join(" · ");
  }, [weeklyRecap, player.streak, player.xp]);

  const showRecap = (weeklyRecap?.sessions ?? 0) > 0 || player.streak > 0;

  // Skill label from glowScore
  const skillLabel = player.glowScore >= 80 ? "Advanced" : player.glowScore >= 50 ? "Proficient" : "Developing";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.lime} />}
      >
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            1. HEADER
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <View style={{ paddingTop: insets.top + 4, overflow: "hidden", paddingBottom: 4 }}>
          {/* Player hero — decorative right, taller & more prominent */}
          <Image
            source={IMG.playerHero}
            style={{ position: "absolute", right: -8, top: insets.top - 24,
              height: 250, width: 170, resizeMode: "contain", opacity: 0.80 }}
          />

          {/* Logo row — centred, but leave room for bell on right */}
          <View style={{ alignItems: "center", marginBottom: 16, paddingRight: 44 }}>
            <View style={{ flexDirection: "row" }}>
              <Text style={[s.logoWord, { color: "#C46FFF" }]}>GLOW </Text>
              <Text style={[s.logoWord, { color: "#7B9FFF" }]}>UP</Text>
            </View>
            <Text style={s.logoSub}>S P O R T S</Text>
          </View>

          {/* Bell — top-right, above hero */}
          <View style={{ position: "absolute", top: insets.top + 8, right: 14,
            flexDirection: "row", alignItems: "center", gap: 8 }}>
            {onSwitchToClassic && (
              <Pressable onPress={onSwitchToClassic} hitSlop={8} style={s.classicPill}>
                <Text style={{ fontSize: 10, color: C.purple, fontWeight: "700" }}>← Classic</Text>
              </Pressable>
            )}
            <Pressable onPress={() => nav("PlayerNotifications")} style={s.bellBtn} hitSlop={12}>
              <Text style={{ fontSize: 18 }}>🔔</Text>
              <View style={s.bellDot} />
            </Pressable>
          </View>

          {/* Avatar + greeting */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20 }}>
            <Pressable
              onPress={() => nav("PlayerPublicProfile", { playerId: user?.playerId })}
              style={s.avatarWrap}
            >
              {player.photoUrl ? (
                <Image source={{ uri: player.photoUrl }} style={s.avatarImg} />
              ) : (
                <LinearGradient colors={["#9B5CFF", "#4A6FFF"]} style={s.avatarImg}>
                  <Text style={{ fontSize: 26, fontWeight: "800", color: "#fff" }}>
                    {player.initial}
                  </Text>
                </LinearGradient>
              )}
              <View style={s.onlineDot} />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={s.greeting} numberOfLines={1}>
                {getGreeting()}, {player.name} 👑
              </Text>
              <Text style={s.greetingSub}>{"Let's elevate your game today."}</Text>
            </View>
          </View>
        </View>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            2. PLAYER STRIP
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <View style={s.strip}>
          <StripItem emoji="🛡️" main={`Level ${player.level}`} sub="Rising Competitor" />
          <View style={s.stripDiv} />
          <StripItem emoji="⚡" main={`${credits?.total ?? 0} Credits`} />
          <View style={s.stripDiv} />
          <StripItem emoji="👥" main={academy?.name ?? "Free Player"} />
        </View>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            3+4. NEXT SESSION (left ~57%) + GLOW ABILITY (right ~43%) — side by side
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 18, paddingTop: 18, alignItems: "stretch" }}>

          {/* ── LEFT: Next Session ─────────────────────────────────────── */}
          <LinearGradient
            colors={["#1A0640", "#0E0520", "#080B1A"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[s.sessionCard, { flex: 57 }]}
          >
            {/* Racket artwork — decorative top-right */}
            <Image
              source={IMG.racket}
              style={{ position: "absolute", right: -8, top: -4,
                width: 110, height: 110, resizeMode: "contain", opacity: 0.85 }}
            />

            <SectionLabel text="Next Session" color={C.purple} />

            {nextSes ? (
              <>
                <Text style={s.sessionDay}>{sesInfo.day}</Text>
                <Text style={s.sessionTime}>{sesInfo.time}</Text>

                {nextSes.duration != null && (
                  <View style={s.sessionRow}>
                    <Text style={s.sessionRowText}>⏱  {nextSes.duration} min</Text>
                  </View>
                )}

                {(nextSes.coachName ?? coachData?.name) && (
                  <View style={s.sessionRow}>
                    {(nextSes.coachPhotoUrl ?? coachData?.photoUrl) ? (
                      <Image
                        source={{ uri: (nextSes.coachPhotoUrl ?? coachData?.photoUrl)! }}
                        style={s.sessionCoachAvatar}
                      />
                    ) : (
                      <View style={[s.sessionCoachAvatar,
                        { backgroundColor: "#5A32A0", alignItems: "center", justifyContent: "center" }]}>
                        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>
                          {(nextSes.coachName ?? coachData?.name ?? "C").charAt(0)}
                        </Text>
                      </View>
                    )}
                    <Text style={s.sessionRowText} numberOfLines={1}>
                      {nextSes.coachName ?? coachData?.name}
                    </Text>
                  </View>
                )}

                {nextSes.courtName && (
                  <View style={s.sessionRow}>
                    <Text style={s.sessionRowText} numberOfLines={1}>📍  {nextSes.courtName}</Text>
                  </View>
                )}

                <Pressable style={s.sessionBtn} onPress={() => nav("QuickBook")}>
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
                    View Session  →
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[s.sessionDay, { marginTop: 8 }]}>No Session</Text>
                <Text style={{ fontSize: 12, color: C.textMuted, lineHeight: 18, marginTop: 4, marginBottom: 16 }}>
                  Book a lesson or find a match.
                </Text>
                <Pressable style={s.sessionBtn} onPress={() => nav("QuickBook")}>
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Book Now</Text>
                </Pressable>
              </>
            )}
          </LinearGradient>

          {/* ── RIGHT: Glow Ability ────────────────────────────────────── */}
          <LinearGradient
            colors={["#030C05", "#050F08", "#04091A"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[s.abilityCard, { flex: 43 }]}
          >
            {/* Header row */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <SectionLabel text="Glow Ability" color={C.lime} />
              <View style={s.infoBtn}>
                <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: "700" }}>ⓘ</Text>
              </View>
            </View>

            {/* Ring */}
            <View style={{ alignItems: "center", paddingVertical: 12 }}>
              <GlowRing score={player.glowScore} size={118} />
            </View>

            {/* Skill label + delta */}
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>{skillLabel}</Text>
              <Text style={{ fontSize: 11, color: C.lime, fontWeight: "600", marginTop: 4, textAlign: "center" }}>
                ↑ 6 pts from last week
              </Text>
            </View>
          </LinearGradient>

        </View>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            5. QUICK ACTIONS
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 18, paddingTop: 14 }}>
          <QuickAction label="Book Session" icon={IMG.calendar} color={C.purple}
            bg={C.purpleDim} border={C.purpleBord} onPress={() => nav("QuickBook")} />
          <QuickAction label="Find Match"   icon={IMG.group}    color={C.blue}
            bg={C.blueDim}   border={C.blueBord}   onPress={() => nav("PlayerFinder")} />
          <QuickAction label="AI Coach"     icon={IMG.ai}       color={C.cyan}
            bg={C.cyanDim}   border="rgba(24,227,255,0.25)" onPress={() => nav("PlayerAICoach")} />
          <QuickAction label="Feedback"     icon={IMG.chat}     color="#5AADFF"
            bg="rgba(77,163,255,0.10)" border="rgba(77,163,255,0.28)" onPress={() => nav("PlayerMessages")} />
        </View>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            6. WEEKLY RECAP BANNER
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {showRecap && (
          <View style={{ paddingHorizontal: 18, paddingTop: 12 }}>
            <Pressable style={s.recapBanner} onPress={() => nav("Growth")}>
              <Text style={{ fontSize: 16, marginRight: 2 }}>✦</Text>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>
                  Your weekly recap is ready
                </Text>
                {recapLine ? (
                  <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{recapLine}</Text>
                ) : null}
              </View>
              <Text style={{ fontSize: 13, fontWeight: "700", color: C.lime }}>See recap →</Text>
            </Pressable>
          </View>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            7. TODAY'S FOCUS
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <View style={{ paddingHorizontal: 18, paddingTop: 12 }}>
          <View style={s.focusCard}>
            <View style={s.focusHeader}>
              <BrandImg source={IMG.target} size={22} />
              <Text style={{ fontSize: 11, fontWeight: "800", color: C.text,
                letterSpacing: 1.5, textTransform: "uppercase", marginLeft: 8, flex: 1 }}>
                {"Today's Focus"}
              </Text>
              <Text style={{ fontSize: 15, color: C.textMuted }}>›</Text>
            </View>
            <View style={{ flexDirection: "row" }}>
              <FocusSlot icon={IMG.ballLime} label="Serve Consistency" sub="Hit 70%+ first serves" last={false} />
              <FocusSlot icon={IMG.shoe}     label="Footwork"           sub="Stay light & balanced"  last={false} />
              <FocusSlot icon={IMG.target}   label="Rally Patience"     sub="Build the point"        last />
            </View>
          </View>
        </View>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            8+9. COACH FEEDBACK + UPCOMING MATCH
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 18, paddingTop: 12 }}>

          {/* Coach Feedback */}
          <View style={[s.sideCard, { borderColor: C.purpleBord, flex: 1 }]}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center",
              justifyContent: "space-between", marginBottom: 10 }}>
              <SectionLabel text="Recent Coach Feedback" color={C.purple} />
              <View style={s.newBadge}><Text style={s.newBadgeTxt}>NEW</Text></View>
            </View>

            {lastFeedback ? (
              <>
                {/* Coach photo row */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  {lastFeedback.coachPhotoUrl ? (
                    <Image source={{ uri: lastFeedback.coachPhotoUrl }} style={s.feedbackAvatar} />
                  ) : (
                    <View style={[s.feedbackAvatar,
                      { backgroundColor: "#5A32A0", alignItems: "center", justifyContent: "center" }]}>
                      <Text style={{ fontSize: 18, color: "#fff", fontWeight: "800" }}>
                        {(lastFeedback.coachName || "C").charAt(0)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: C.text }} numberOfLines={1}>
                      {lastFeedback.coachName}
                    </Text>
                    <Text style={{ fontSize: 11, color: C.textMuted }}>
                      {relativeTime(lastFeedback.date)}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13, color: C.text, lineHeight: 19, marginBottom: 10 }} numberOfLines={5}>
                  {lastFeedback.message}
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: 13, color: C.text, lineHeight: 19, marginBottom: 10 }}>
                Great improvement in your backhand depth! Focus on earlier preparation on returns. Keep it up!
              </Text>
            )}

            <Pressable onPress={() => nav("PlayerMessages")}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: C.lime }}>View All →</Text>
            </Pressable>
          </View>

          {/* Upcoming Match */}
          <View style={[s.sideCard, { borderColor: C.blueBord, flex: 1, overflow: "hidden" }]}>
            <Image source={IMG.ballLimeOrb}
              style={{ position: "absolute", right: -10, bottom: 44,
                width: 68, height: 68, resizeMode: "contain", opacity: 0.35 }} />

            <SectionLabel text="Upcoming Match" color={C.blue} />

            <Text style={{ fontSize: 16, fontWeight: "800", color: C.blue, marginTop: 8 }}>
              Sat 9:00 AM
            </Text>
            <Text style={{ fontSize: 12, color: C.textSub, marginTop: 4, lineHeight: 17 }}>
              U18 Singles{"\n"}Quarterfinals
            </Text>
            <View style={[s.mmrPill, { marginTop: 10 }]}>
              <Text style={{ fontSize: 11, color: C.lime, fontWeight: "700" }}>+32 MMR on win</Text>
            </View>
            <Pressable onPress={() => nav("MatchHistory")} style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: C.blue }}>View Match →</Text>
            </Pressable>
          </View>
        </View>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            10. YOUR JOURNEY
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <View style={{ paddingHorizontal: 18, paddingTop: 12 }}>
          <View style={s.journeyCard}>
            <SectionLabel text="Your Journey" color={C.purple} />
            <View style={{ flexDirection: "row", marginTop: 16 }}>
              {/* Streak */}
              <JourneyCol
                icon={IMG.flame}
                value={String(player.streak)}
                label="Day Streak"
                last={false}
              />
              {/* XP */}
              <JourneyCol
                icon={IMG.star}
                value={player.xp.toLocaleString()}
                label="XP Points"
                valueColor={C.lime}
                last={false}
              />
              {/* Level + rank label */}
              <JourneyCol
                icon={IMG.trophy}
                value={`Lv ${player.level}`}
                label="Rising Competitor"
                last={false}
              />
              {/* Level progress ring */}
              <View style={[s.journeyCol, { borderRightWidth: 0 }]}>
                <LevelRing pct={player.levelProgressPct || 0} />
                <Text style={{ fontSize: 10, color: C.textMuted, textAlign: "center", marginTop: 5 }}>
                  to Lv {player.level + 1}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Classic switch */}
        {onSwitchToClassic && (
          <View style={{ paddingHorizontal: 18, paddingTop: 18 }}>
            <Pressable onPress={onSwitchToClassic} style={s.switchBtn}>
              <Text style={{ fontSize: 13, color: C.textMuted }}>Switch to Classic Dashboard</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StripItem({ emoji, main, sub }: { emoji: string; main: string; sub?: string }) {
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text style={{ fontSize: 15 }}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: C.text }} numberOfLines={1}>{main}</Text>
        {sub && <Text style={{ fontSize: 10, color: C.textMuted }}>{sub}</Text>}
      </View>
    </View>
  );
}

function QuickAction({
  label, icon, color, bg, border, onPress,
}: { label: string; icon: ImageSourcePropType; color: string; bg: string; border: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.qaBtn, { backgroundColor: bg, borderColor: border }]}>
      <BrandImg source={icon} size={38} />
      <Text style={{ fontSize: 11, fontWeight: "700", color, textAlign: "center",
        marginTop: 7, lineHeight: 14 }} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

function FocusSlot({ icon, label, sub, last }: {
  icon: ImageSourcePropType; label: string; sub: string; last: boolean;
}) {
  return (
    <View style={[s.focusSlot, last ? {} : { borderRightColor: C.cardBord, borderRightWidth: 1 }]}>
      <BrandImg source={icon} size={48} />
      <Text style={{ fontSize: 12, fontWeight: "700", color: C.text,
        textAlign: "center", marginTop: 8, lineHeight: 16 }} numberOfLines={2}>{label}</Text>
      <Text style={{ fontSize: 10, color: C.textMuted, textAlign: "center",
        marginTop: 4, lineHeight: 14 }} numberOfLines={2}>{sub}</Text>
    </View>
  );
}

function JourneyCol({ icon, value, label, valueColor = C.text, last }: {
  icon: ImageSourcePropType; value: string; label: string; valueColor?: string; last: boolean;
}) {
  return (
    <View style={[s.journeyCol, last ? { borderRightWidth: 0 } : {}]}>
      <BrandImg source={icon} size={38} />
      <Text style={{ fontSize: 20, fontWeight: "900", color: valueColor,
        marginTop: 6, lineHeight: 24, textAlign: "center" }}>{value}</Text>
      <Text style={{ fontSize: 10, color: C.textMuted, textAlign: "center",
        marginTop: 3, lineHeight: 13 }}>{label}</Text>
    </View>
  );
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Logo
  logoWord: { fontSize: 32, fontWeight: "900", letterSpacing: 1.5 },
  logoSub:  { fontSize: 10, fontWeight: "600", color: C.textMuted, letterSpacing: 5, marginTop: 0 },

  // Top controls
  classicPill: {
    backgroundColor: "rgba(9,13,28,0.85)",
    borderWidth: 1, borderColor: "rgba(155,92,255,0.38)",
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: C.cardBord,
    alignItems: "center", justifyContent: "center",
  },
  bellDot: {
    position: "absolute", top: 7, right: 7,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.lime, borderWidth: 2, borderColor: C.bg,
  },

  // Avatar
  avatarWrap: { position: "relative", width: 68, height: 68 },
  avatarImg: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2.5, borderColor: C.purple,
  },
  onlineDot: {
    position: "absolute", bottom: 3, right: 3,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: "#00E676", borderWidth: 2, borderColor: C.bg,
  },

  // Greeting
  greeting:    { fontSize: 26, fontWeight: "700", color: C.text, lineHeight: 32 },
  greetingSub: { fontSize: 14, color: C.textMuted, marginTop: 3 },

  // Strip
  strip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 18, paddingVertical: 12,
    borderTopWidth: 1, borderBottomWidth: 1,
    borderTopColor: C.cardBord, borderBottomColor: C.cardBord,
    marginTop: 10,
  },
  stripDiv: { width: 1, height: 28, backgroundColor: C.cardBord, marginHorizontal: 10 },

  // Next Session card — left column in side-by-side row
  sessionCard: {
    borderRadius: 20, borderWidth: 1.5, borderColor: C.purpleBord,
    padding: 14, overflow: "hidden", minHeight: 260,
  },
  sessionDay:  { fontSize: 32, fontWeight: "900", color: C.text, lineHeight: 36, marginTop: 8, letterSpacing: -0.5 },
  sessionTime: { fontSize: 22, fontWeight: "800", color: C.purple, lineHeight: 28, marginTop: 2 },
  sessionRow:  { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  sessionRowText: { fontSize: 12, color: C.textSub, flex: 1 },
  sessionCoachAvatar: { width: 24, height: 24, borderRadius: 12 },
  sessionBtn: {
    marginTop: 14, backgroundColor: C.purple, borderRadius: 12,
    paddingVertical: 11, alignItems: "center",
  },

  // Glow Ability card — right column in side-by-side row
  abilityCard: {
    borderRadius: 20, borderWidth: 1.5, borderColor: C.limeBord,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 18,
    overflow: "hidden",
  },
  infoBtn: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, borderColor: C.cardBord,
    alignItems: "center", justifyContent: "center",
  },

  // Quick Actions
  qaBtn: {
    flex: 1, borderRadius: 16, borderWidth: 1,
    paddingVertical: 14, alignItems: "center",
    minHeight: 104,
  },

  // Recap banner
  recapBanner: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(207,255,0,0.04)",
    borderWidth: 1, borderColor: C.limeBord, borderRadius: 16,
    padding: 14,
  },

  // Today's Focus
  focusCard: {
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.purpleBord,
    borderRadius: 18, overflow: "hidden",
  },
  focusHeader: {
    flexDirection: "row", alignItems: "center",
    padding: 13, borderBottomWidth: 1, borderBottomColor: C.cardBord,
    backgroundColor: "rgba(155,92,255,0.05)",
  },
  focusSlot: { flex: 1, padding: 12, alignItems: "center" },

  // Side cards
  sideCard: {
    backgroundColor: C.card, borderWidth: 1.5, borderRadius: 18, padding: 14,
    minHeight: 220,
  },
  newBadge: {
    backgroundColor: C.limeDim, borderWidth: 1, borderColor: C.limeBord,
    borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2,
  },
  newBadgeTxt: { fontSize: 8, fontWeight: "900", color: C.lime, letterSpacing: 0.5 },
  feedbackAvatar: { width: 46, height: 46, borderRadius: 23 },
  mmrPill: {
    backgroundColor: C.limeDim, borderWidth: 1, borderColor: C.limeBord,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start",
  },

  // Journey
  journeyCard: {
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.purpleBord,
    borderRadius: 18, padding: 18,
  },
  journeyCol: {
    flex: 1, alignItems: "center", paddingHorizontal: 2,
    borderRightWidth: 1, borderRightColor: C.cardBord,
  },

  // Classic switch
  switchBtn: {
    borderWidth: 1, borderColor: C.cardBord, borderRadius: 12,
    paddingVertical: 12, alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
});

export default PlayerHomeV3Screen;
