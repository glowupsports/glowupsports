/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║              PLAYER HOME V3  —  NEON DARK DESIGN                           ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Preview-approved design (mockup-sandbox/home-redesign/PlayerHomeV2).       ║
 * ║  Uses the same /api/player/me/home-data god-route as V2.                    ║
 * ║  Mounted by PlayerV2Navigator ▶ HomeVersionRouter when version = "v3".      ║
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
  racket:      require("@/assets/images/home/racket.png")      as ImageSourcePropType,
  ballLimeOrb: require("@/assets/images/home/ball_lime_orb.png") as ImageSourcePropType,
  ballBlue:    require("@/assets/images/home/ball_blue.png")   as ImageSourcePropType,
  playerHero:  require("@/assets/images/home/player_hero.png") as ImageSourcePropType,
  flame:       require("@/assets/images/home/icon_flame.png")  as ImageSourcePropType,
  star:        require("@/assets/images/home/icon_star.png")   as ImageSourcePropType,
  trophy:      require("@/assets/images/home/icon_trophy.png") as ImageSourcePropType,
  ballLime:    require("@/assets/images/home/icon_ball_lime.png") as ImageSourcePropType,
  shoe:        require("@/assets/images/home/icon_shoe.png")   as ImageSourcePropType,
  target:      require("@/assets/images/home/icon_target.png") as ImageSourcePropType,
  calendar:    require("@/assets/images/home/icon_calendar.png") as ImageSourcePropType,
  group:       require("@/assets/images/home/icon_group.png")  as ImageSourcePropType,
  ai:          require("@/assets/images/home/icon_ai.png")     as ImageSourcePropType,
  chat:        require("@/assets/images/home/icon_chat.png")   as ImageSourcePropType,
};

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  purple:     "#9B5CFF",
  purpleDim:  "rgba(155,92,255,0.18)",
  purpleBord: "rgba(155,92,255,0.38)",
  lime:       "#CFFF00",
  limeDim:    "rgba(207,255,0,0.12)",
  limeBord:   "rgba(207,255,0,0.28)",
  blue:       "#2196FF",
  blueDim:    "rgba(33,150,255,0.12)",
  blueBord:   "rgba(33,150,255,0.30)",
  cyan:       "#18E3FF",
  cyanDim:    "rgba(24,227,255,0.10)",
  text:       "#F6F7FB",
  textSub:    "#A8ADBD",
  textMuted:  "#747B8D",
  card:       "#07101D",
  muted:      "rgba(255,255,255,0.07)",
};

// ─── Data interface (subset of DashboardData) ─────────────────────────────────
interface HomeData {
  dashboard: {
    player: {
      id: string; name: string; level: number; xp: number;
      glowScore: number; ballLevel: string | null; streak: number;
      checkinStreak?: number; profilePhotoUrl?: string | null;
    };
    coach: { id: string; name: string } | null;
    academy: { id: string; name: string } | null;
    credits?: { total: number; group: number; private: number; semi_private: number };
    nextSession?: { id: string; date: string; type: string; endTime?: string } | null;
    isFreePlayer?: boolean;
  } | null;
  dailyFocus: { title: string; description: string } | null;
}

// ─── GlowRing ─────────────────────────────────────────────────────────────────
function GlowRing({ score }: { score: number }) {
  const size = 170;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (Math.min(score, 100) / 100) * circ;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFillObject}>
        <Defs>
          <Filter id="g"><FeGaussianBlur stdDeviation="4" result="b" /><FeMerge><FeMergeNode in="b" /><FeMergeNode in="SourceGraphic" /></FeMerge></Filter>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        <Circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={C.lime} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          rotation={-90} originX={size / 2} originY={size / 2}
          filter="url(#g)"
        />
      </Svg>
      <Text style={{ fontSize: 52, fontWeight: "800", color: C.lime, lineHeight: 56 }}>{score}</Text>
      <Text style={{ fontSize: 14, color: C.textMuted }}>/100</Text>
    </View>
  );
}

// ─── BrandImg — mix-blend-mode equivalent on native is "multiply"/"screen"
//     RN has no mixBlendMode, so we use a semi-transparent Image overlay ──────
function BrandImg({
  source, size, style,
}: { source: ImageSourcePropType; size: number; style?: object }) {
  return (
    <Image
      source={source}
      style={[{ width: size, height: size, resizeMode: "contain" }, style]}
    />
  );
}

// ─── Section label ─────────────────────────────────────────────────────────────
function Label({ text, color = C.purple }: { text: string; color?: string }) {
  return (
    <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1.5,
      color, textTransform: "uppercase" }}>{text}</Text>
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

  // ── God query (identical to V2) ───────────────────────────────────────────
  const { data: homeData, refetch, isLoading } = useQuery<HomeData>({
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
  const dp = dash?.player;

  const player = useMemo(() => ({
    name:     dp?.name     ?? user?.displayName ?? "Player",
    level:    dp?.level    ?? playerCtx.level   ?? 1,
    xp:       dp?.xp       ?? playerCtx.xp      ?? 0,
    glowScore: dp?.glowScore ?? playerCtx.glowScore ?? 0,
    streak:   dp?.streak   ?? 0,
    photoUrl: dp?.profilePhotoUrl ?? user?.profilePhotoUrl ?? null,
    initial:  (dp?.name ?? user?.displayName ?? "P").charAt(0).toUpperCase(),
  }), [dp, user, playerCtx.level, playerCtx.xp, playerCtx.glowScore]);

  const credits    = dash?.credits;
  const nextSes    = dash?.nextSession;
  const coachName  = dash?.coach?.name;
  const academy    = dash?.academy;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const nav = (screen: string, params?: object) => {
    try { navigation.navigate(screen, params); } catch { /* no-op */ }
  };

  // ─── Format date string ───────────────────────────────────────────────────
  const formatSession = (dateStr?: string) => {
    if (!dateStr) return { label: "Today", time: "" };
    const d = new Date(dateStr);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const label = isToday ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const time  = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return { label, time };
  };

  const sesInfo = formatSession(nextSes?.date);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: "#02050C" }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.lime} />}
      >
        {/* ── 1. HEADER ─────────────────────────────────────────────────── */}
        <View style={{ minHeight: 240, paddingTop: insets.top + 8, overflow: "hidden" }}>
          {/* Hero player artwork — absolute right */}
          <Image
            source={IMG.playerHero}
            style={{
              position: "absolute", right: -8, top: insets.top - 4,
              height: 230, width: 160, resizeMode: "contain",
              opacity: 0.80,
            }}
          />

          {/* Logo */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <Text style={s.logoMain}>GLOW UP</Text>
            <Text style={s.logoSub}>SPORTS</Text>
          </View>

          {/* Notification bell */}
          <Pressable
            onPress={() => nav("PlayerNotifications")}
            style={s.bellBtn}
            hitSlop={12}
          >
            <Text style={{ fontSize: 18 }}>🔔</Text>
            <View style={s.bellDot} />
          </Pressable>

          {/* Avatar + greeting */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 22 }}>
            <Pressable onPress={() => nav("PlayerPublicProfile", { playerId: user?.playerId })} style={s.avatarWrap}>
              {player.photoUrl ? (
                <Image source={{ uri: player.photoUrl }} style={s.avatarImg} />
              ) : (
                <LinearGradient colors={["#9B5CFF", "#4DA3FF"]} style={s.avatarImg}>
                  <Text style={{ fontSize: 28, fontWeight: "800", color: "#fff" }}>{player.initial}</Text>
                </LinearGradient>
              )}
              <View style={s.onlineDot} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={s.greeting} numberOfLines={1}>
                Good morning, {player.name} 👋
              </Text>
              <Text style={s.greetingSub}>Let's elevate your game today.</Text>
            </View>
          </View>
        </View>

        {/* ── 2. PLAYER STRIP ───────────────────────────────────────────── */}
        <View style={[s.strip, { borderTopColor: C.muted, borderBottomColor: C.muted }]}>
          <StripItem icon="🛡️" main={`Level ${player.level}`} sub="Rising Competitor" />
          <View style={s.stripDivider} />
          <StripItem icon="⚡" main={`${credits?.total ?? 0} Credits`} />
          <View style={s.stripDivider} />
          <StripItem icon="👨‍👩‍👧" main={academy?.name ?? "Free Player"} />
        </View>

        {/* ── 3+4. HERO CARDS ───────────────────────────────────────────── */}
        <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 22, paddingTop: 20 }}>
          {/* Next Session */}
          <View style={{ flex: 0.55 }}>
            <LinearGradient
              colors={["#1C0840", "#100620", "#080B1E"]}
              start={{ x: 0.2, y: 0 }} end={{ x: 1, y: 1 }}
              style={[s.heroCard, { borderColor: C.purpleBord }]}
            >
              {/* Racket artwork */}
              <Image
                source={IMG.racket}
                style={{ position: "absolute", right: -12, top: -8,
                  width: "62%", height: "60%", resizeMode: "contain", opacity: 0.90 }}
              />

              <Label text="Next Session" color={C.purple} />

              {nextSes ? (
                <>
                  <Text style={s.todayLabel}>{sesInfo.label}</Text>
                  <Text style={[s.timeLabel, { color: C.purple }]}>{sesInfo.time}</Text>
                  {nextSes.type && (
                    <Text style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>
                      {nextSes.type.replace(/_/g, " ")} session
                    </Text>
                  )}

                  <View style={s.cardDivider} />

                  {coachName && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <View style={s.coachAvatar}>
                        <Text style={{ fontSize: 13, color: "#fff", fontWeight: "700" }}>
                          {coachName.charAt(0)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, color: C.textSub }} numberOfLines={2}>{coachName}</Text>
                    </View>
                  )}

                  <Pressable
                    style={s.purpleBtn}
                    onPress={() => nav("QuickBook")}
                  >
                    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                      View Session →
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 36, marginVertical: 12 }}>📅</Text>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 6 }}>
                    No Session Today
                  </Text>
                  <Text style={{ fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 16 }}>
                    Book a lesson or find a match partner.
                  </Text>
                  <Pressable style={s.purpleBtn} onPress={() => nav("QuickBook")}>
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Book Now</Text>
                  </Pressable>
                </>
              )}
            </LinearGradient>
          </View>

          {/* Glow Ability */}
          <View style={{ flex: 1 }}>
            <LinearGradient
              colors={["#030B04", "#060E07", "#060B18"]}
              start={{ x: 0.2, y: 0 }} end={{ x: 1, y: 1 }}
              style={[s.heroCard, { borderColor: C.limeBord, alignItems: "center" }]}
            >
              <View style={{ width: "100%", flexDirection: "row",
                justifyContent: "space-between", alignItems: "center" }}>
                <Label text="Glow Ability" color={C.lime} />
              </View>

              <View style={{ flex: 1, justifyContent: "center", paddingVertical: 8 }}>
                <GlowRing score={player.glowScore} />
              </View>

              <Text style={{ fontSize: 17, fontWeight: "700", color: C.text }}>Proficient</Text>
              <Text style={{ fontSize: 13, color: C.lime, fontWeight: "600", marginTop: 4 }}>
                ↑ Rising
              </Text>
            </LinearGradient>
          </View>
        </View>

        {/* ── 5. QUICK ACTIONS ──────────────────────────────────────────── */}
        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 22, paddingTop: 20 }}>
          <QuickAction label="Book" sub="Session" icon={IMG.calendar} color={C.purple} dim={C.purpleDim} border={C.purpleBord} onPress={() => nav("QuickBook")} />
          <QuickAction label="Find" sub="Match" icon={IMG.group} color={C.blue} dim={C.blueDim} border={C.blueBord} onPress={() => nav("PlayerFinder")} />
          <QuickAction label="AI" sub="Coach" icon={IMG.ai} color={C.cyan} dim={C.cyanDim} border="rgba(24,227,255,0.25)" onPress={() => nav("PlayerAICoach")} />
          <QuickAction label="Feed" sub="back" icon={IMG.chat} color="#4DA3FF" dim="rgba(77,163,255,0.10)" border="rgba(77,163,255,0.26)" onPress={() => nav("PlayerMessages")} />
        </View>

        {/* ── 6. WEEKLY RECAP ───────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
          <Pressable style={[s.recapBanner, { borderColor: C.limeBord }]}
            onPress={() => nav("Growth")}>
            <Text style={{ fontSize: 18 }}>✦</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>
                Your weekly recap is ready
              </Text>
              <Text style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>
                {player.streak > 0 ? `${player.streak}-day streak · ` : ""}XP {player.xp.toLocaleString()}
              </Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: "700", color: C.lime }}>See →</Text>
          </Pressable>
        </View>

        {/* ── 7. TODAY'S FOCUS ──────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
          <View style={[s.focusCard, { borderColor: C.purpleBord }]}>
            {/* Header */}
            <View style={s.focusHeader}>
              <BrandImg source={IMG.target} size={26} />
              <Text style={{ fontSize: 12, fontWeight: "800", color: C.text,
                letterSpacing: 1.2, textTransform: "uppercase", marginLeft: 8 }}>
                Today's Focus
              </Text>
            </View>

            {/* Three focus slots */}
            <View style={{ flexDirection: "row" }}>
              <FocusSlot icon={IMG.ballLime} label="Serve\nConsistency" sub="Hit 70%+ first serves" last={false} />
              <FocusSlot icon={IMG.shoe}     label="Foot-\nwork"        sub="Stay light & balanced" last={false} />
              <FocusSlot icon={IMG.target}   label="Rally\nPatience"    sub="Build the point" last />
            </View>
          </View>
        </View>

        {/* ── 8+9. FEEDBACK + UPCOMING MATCH ───────────────────────────── */}
        <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 22, paddingTop: 16 }}>
          {/* Coach Feedback */}
          <View style={[s.sideCard, { borderColor: C.purpleBord, flex: 1 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between",
              alignItems: "center", marginBottom: 12 }}>
              <Label text="Coach Feedback" />
              <View style={s.newBadge}><Text style={s.newBadgeText}>NEW</Text></View>
            </View>
            <Text style={{ fontSize: 13, color: C.text, lineHeight: 20, marginBottom: 8 }}>
              Great improvement in your backhand depth! Focus on earlier preparation on returns.
            </Text>
            <Pressable onPress={() => nav("PlayerMessages")}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: C.lime }}>View All →</Text>
            </Pressable>
          </View>

          {/* Upcoming Match */}
          <View style={[s.sideCard, { borderColor: C.blueBord, flex: 1, overflow: "hidden" }]}>
            {/* Decorative ball */}
            <Image source={IMG.ballLimeOrb}
              style={{ position: "absolute", right: -8, bottom: 50,
                width: 70, height: 70, resizeMode: "contain", opacity: 0.40 }}
            />
            <Label text="Upcoming Match" color={C.blue} />
            <Text style={{ fontSize: 18, fontWeight: "800", color: C.blue, marginTop: 8 }}>
              Sat 9:00 AM
            </Text>
            <Text style={{ fontSize: 13, color: C.textSub, marginTop: 4, lineHeight: 18 }}>
              U18 Singles{"\n"}Quarterfinals
            </Text>
            <View style={[s.mmrPill, { marginTop: 10 }]}>
              <Text style={{ fontSize: 12, color: C.lime, fontWeight: "700" }}>+32 MMR on win</Text>
            </View>
            <Pressable onPress={() => nav("MatchHistory")} style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: C.blue }}>View Match →</Text>
            </Pressable>
          </View>
        </View>

        {/* ── 10. YOUR JOURNEY ──────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
          <View style={[s.journeyCard, { borderColor: C.purpleBord }]}>
            <Label text="Your Journey" color={C.purple} />
            <View style={{ flexDirection: "row", marginTop: 16 }}>
              <JourneyItem icon={IMG.flame} value={String(player.streak)} sub="Day Streak" last={false} />
              <JourneyItem icon={IMG.star}  value={player.xp.toLocaleString()} sub="XP Points" last={false} valueColor={C.lime} />
              <JourneyItem icon={IMG.trophy} value={`Lv ${player.level}`} sub="Level" last />
            </View>
          </View>
        </View>

        {/* ── SWITCH TO CLASSIC ─────────────────────────────────────────── */}
        {onSwitchToClassic && (
          <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
            <Pressable onPress={onSwitchToClassic} style={s.switchBtn}>
              <Text style={{ fontSize: 13, color: C.textMuted }}>
                Switch to Classic Dashboard
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StripItem({ icon, main, sub }: { icon: string; main: string; sub?: string }) {
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ fontSize: 16 }}>{icon}</Text>
      <View>
        <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }} numberOfLines={1}>{main}</Text>
        {sub && <Text style={{ fontSize: 10, color: C.textMuted }}>{sub}</Text>}
      </View>
    </View>
  );
}

function QuickAction({
  label, sub, icon, color, dim, border, onPress,
}: { label: string; sub: string; icon: ImageSourcePropType; color: string; dim: string; border: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.qAction, { backgroundColor: dim, borderColor: border }]}
    >
      <BrandImg source={icon} size={40} />
      <Text style={{ fontSize: 11, fontWeight: "700", color, textAlign: "center",
        marginTop: 6, lineHeight: 15 }}>
        {label}{"\n"}{sub}
      </Text>
    </Pressable>
  );
}

function FocusSlot({
  icon, label, sub, last,
}: { icon: ImageSourcePropType; label: string; sub: string; last: boolean }) {
  return (
    <View style={[s.focusSlot, last ? {} : { borderRightColor: C.muted, borderRightWidth: 1 }]}>
      <BrandImg source={icon} size={48} />
      <Text style={{ fontSize: 11, fontWeight: "700", color: C.text,
        textAlign: "center", marginTop: 8, lineHeight: 15 }}>{label}</Text>
      <Text style={{ fontSize: 10, color: C.textMuted, textAlign: "center",
        marginTop: 4, lineHeight: 14 }}>{sub}</Text>
    </View>
  );
}

function JourneyItem({
  icon, value, sub, last, valueColor = C.text,
}: { icon: ImageSourcePropType; value: string; sub: string; last: boolean; valueColor?: string }) {
  return (
    <View style={[s.journeyItem, last ? {} : { borderRightColor: C.muted, borderRightWidth: 1 }]}>
      <BrandImg source={icon} size={44} />
      <Text style={{ fontSize: 22, fontWeight: "900", color: valueColor,
        marginTop: 6, lineHeight: 26 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: C.textMuted }}>{sub}</Text>
    </View>
  );
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  logoMain: {
    fontSize: 30, fontWeight: "900", letterSpacing: 2,
    color: C.purple,
  },
  logoSub: {
    fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 6, marginTop: 1,
  },
  bellBtn: {
    position: "absolute", top: 52, right: 20,
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: C.muted,
    alignItems: "center", justifyContent: "center",
  },
  bellDot: {
    position: "absolute", top: 8, right: 8,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: C.lime, borderWidth: 2, borderColor: "#02050C",
  },
  avatarWrap: { position: "relative", width: 72, height: 72 },
  avatarImg: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: C.purple,
  },
  onlineDot: {
    position: "absolute", bottom: 4, right: 4,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: "#00E676", borderWidth: 2, borderColor: "#02050C",
  },
  greeting: { fontSize: 20, fontWeight: "700", color: C.text, lineHeight: 26 },
  greetingSub: { fontSize: 14, color: C.textMuted, marginTop: 3 },

  strip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 22, paddingVertical: 14,
    borderTopWidth: 1, borderBottomWidth: 1,
  },
  stripDivider: { width: 1, height: 32, backgroundColor: C.muted, marginHorizontal: 14 },

  heroCard: {
    borderRadius: 22, borderWidth: 1.5,
    padding: 18, minHeight: 380,
    overflow: "hidden",
  },
  todayLabel: {
    fontSize: 44, fontWeight: "800", color: C.text,
    lineHeight: 50, marginTop: 12, letterSpacing: -1,
  },
  timeLabel: {
    fontSize: 30, fontWeight: "800", lineHeight: 36, marginTop: 4,
  },
  cardDivider: {
    height: 1, backgroundColor: "rgba(155,92,255,0.15)",
    marginVertical: 12,
  },
  coachAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#00897B",
    alignItems: "center", justifyContent: "center",
  },
  purpleBtn: {
    marginTop: "auto" as any,
    backgroundColor: C.purple, borderRadius: 14,
    paddingVertical: 13, alignItems: "center",
  },

  qAction: {
    flex: 1, borderRadius: 18, borderWidth: 1,
    paddingVertical: 16, alignItems: "center",
    minHeight: 120,
  },

  recapBanner: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(207,255,0,0.04)",
    borderWidth: 1, borderRadius: 18,
    padding: 16,
  },

  focusCard: {
    backgroundColor: C.card, borderWidth: 1.5, borderRadius: 20, overflow: "hidden",
  },
  focusHeader: {
    flexDirection: "row", alignItems: "center",
    padding: 14,
    borderBottomWidth: 1, borderBottomColor: C.muted,
    backgroundColor: "rgba(155,92,255,0.06)",
  },
  focusSlot: {
    flex: 1, padding: 14, alignItems: "center",
  },

  sideCard: {
    backgroundColor: C.card, borderWidth: 1.5, borderRadius: 20, padding: 16,
    minHeight: 200,
  },
  newBadge: {
    backgroundColor: C.limeDim, borderWidth: 1, borderColor: C.limeBord,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  newBadgeText: { fontSize: 9, fontWeight: "800", color: C.lime, letterSpacing: 0.5 },

  mmrPill: {
    backgroundColor: C.limeDim, borderWidth: 1, borderColor: C.limeBord,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start",
  },

  journeyCard: {
    backgroundColor: C.card, borderWidth: 1.5, borderRadius: 22, padding: 20,
  },
  journeyItem: {
    flex: 1, alignItems: "center", paddingHorizontal: 8,
  },

  switchBtn: {
    borderWidth: 1, borderColor: C.muted, borderRadius: 12,
    paddingVertical: 12, alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
});

export default PlayerHomeV3Screen;
