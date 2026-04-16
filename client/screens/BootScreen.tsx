import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, Text, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from "react-native-svg";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/coach/context/AuthContext";
import { useAppMode } from "@/context/AppModeContext";

const { width, height } = Dimensions.get("window");

const G = {
  bg0:    "#030F14",
  bg1:    "#051820",
  bg2:    "#071E2A",
  purple: "#A855F7",
  green:  "#B7FF3C",
  cyan:   "#39D5FF",
  white:  "#F8FAFC",
  muted:  "#9FB0C7",
} as const;

const RING_SIZE   = 280;
const RING_STROKE = 5;
const RING_R      = RING_SIZE / 2 - RING_STROKE / 2;
const HERO_SIZE   = 340;
const TRACK_W     = width * 0.72;
const DOT_SIZE    = 9;
const SWEEP_RANGE = width * 0.62;
const HS_SIZE     = 10;
const RING_OFFSET = (HERO_SIZE - RING_SIZE) / 2;

function hotspotXY(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    left: RING_SIZE / 2 + RING_R * Math.cos(rad) - HS_SIZE / 2,
    top:  RING_SIZE / 2 + RING_R * Math.sin(rad) - HS_SIZE / 2,
  };
}

const HS1 = hotspotXY(-60);
const HS2 = hotspotXY(120);

const MIN_BOOT_TIME = 1800;
const MAX_BOOT_TIME = 4500;

type UserRole = "coach" | "player" | "academy_owner" | "admin" | "platform" | "service_provider";

const MESSAGES_BY_ROLE: Record<UserRole, string[]> = {
  coach: [
    "CALIBRATING LESSON ENGINE...",
    "SYNCING PLAYER PROFILES...",
    "LOADING COURT GRID...",
    "FETCHING SESSION DATA...",
    "CHECKING SCHEDULE MATRIX...",
  ],
  player: [
    "ACTIVATING GLOW PROTOCOL...",
    "LOADING QUEST BOARD...",
    "CALIBRATING GLOW RANK...",
    "SYNCING MATCH HISTORY...",
    "ACTIVATING ACADEMY LINK...",
  ],
  academy_owner: [
    "LOADING ACADEMY DASHBOARD...",
    "SYNCING COACH NETWORK...",
    "FETCHING REVENUE DATA...",
    "CALIBRATING COURT GRID...",
    "COMPILING ENROLLMENT DATA...",
  ],
  admin: [
    "LOADING SYSTEM OVERVIEW...",
    "SYNCING ACADEMY NODES...",
    "FETCHING PLATFORM METRICS...",
    "VERIFYING ADMIN CLEARANCE...",
    "INITIALIZING CONTROL CENTER...",
  ],
  platform: [
    "LOADING GLOBAL DASHBOARD...",
    "SYNCING ACADEMY NETWORK...",
    "FETCHING PLATFORM ANALYTICS...",
    "CALIBRATING GROWTH ENGINE...",
    "INITIALIZING COMMAND CENTER...",
  ],
  service_provider: [
    "LOADING PROVIDER DASHBOARD...",
    "SYNCING BOOKING QUEUE...",
    "FETCHING TODAY'S SCHEDULE...",
    "CALIBRATING SERVICE ENGINE...",
    "INITIALIZING PROVIDER HUB...",
  ],
};

const ROLE_LABELS: Record<UserRole, string> = {
  coach:            "COACH MODE ACTIVE",
  player:           "PLAYER MODE ACTIVE",
  academy_owner:    "ACADEMY MODE ACTIVE",
  admin:            "ADMIN MODE ACTIVE",
  platform:         "PLATFORM MODE ACTIVE",
  service_provider: "PROVIDER MODE ACTIVE",
};

const PARTICLES: {
  color: string; xFrac: number; yFrac: number; delay: number; dx: number; dy: number;
}[] = [
  { color: G.purple, xFrac: 0.08, yFrac: 0.12, delay: 0,   dx: 8,   dy: -12 },
  { color: G.cyan,   xFrac: 0.82, yFrac: 0.10, delay: 200, dx: -10, dy: -14 },
  { color: G.green,  xFrac: 0.05, yFrac: 0.62, delay: 400, dx: 10,  dy: 8   },
  { color: G.purple, xFrac: 0.86, yFrac: 0.68, delay: 600, dx: -8,  dy: 12  },
];

interface BootScreenProps {
  onBootComplete: () => void;
}

export default function BootScreen({ onBootComplete }: BootScreenProps) {
  const queryClient = useQueryClient();
  const { isGuest } = useAuth();
  const { mode }    = useAppMode();

  const [displayPct, setDisplayPct] = useState(0);
  const [isReady, setIsReady]       = useState(false);

  const bootStartTime    = useRef(Date.now());
  const prefetchComplete = useRef(false);
  const timeoutReached   = useRef(false);

  const currentRole = (mode || "player") as UserRole;
  const messages    = MESSAGES_BY_ROLE[currentRole] ?? MESSAGES_BY_ROLE.player;
  const roleLabel   = ROLE_LABELS[currentRole] ?? "GLOW MODE ACTIVE";
  const shuffledMessages = useRef([...messages].sort(() => Math.random() - 0.5)).current;

  const containerOpacity = useSharedValue(0);
  const logoScale        = useSharedValue(1);
  const ringRotation     = useSharedValue(0);
  const progressFill     = useSharedValue(0);

  const setComplete = useCallback(() => {
    setIsReady(true);
    setTimeout(onBootComplete, 300);
  }, [onBootComplete]);

  const checkAndComplete = useCallback(() => {
    const elapsed = Date.now() - bootStartTime.current;
    if (prefetchComplete.current && elapsed >= MIN_BOOT_TIME) {
      setComplete();
    } else if (elapsed >= MAX_BOOT_TIME) {
      timeoutReached.current = true;
      setComplete();
    }
  }, [setComplete]);

  const updateProgress = useCallback((pct: number) => {
    setDisplayPct(pct);
    progressFill.value = withTiming(pct / 100, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, [progressFill]);

  const prefetchCriticalData = useCallback(async () => {
    const prefetchPromises: Promise<any>[] = [];
    updateProgress(10);

    try {
      prefetchPromises.push(
        queryClient.prefetchQuery({ queryKey: ["/api/me"], staleTime: 5 * 60 * 1000 })
      );
      updateProgress(25);

      if (currentRole === "coach") {
        const todayStr = new Date().toISOString().split("T")[0];
        prefetchPromises.push(
          queryClient.prefetchQuery({ queryKey: [`/api/coach/calendar?date=${todayStr}&view=week`], staleTime: 2 * 60 * 1000 }),
          queryClient.prefetchQuery({ queryKey: ["/api/coach/series"],           staleTime: 5 * 60 * 1000 }),
          queryClient.prefetchQuery({ queryKey: ["/api/coach/earnings/summary"], staleTime: 5 * 60 * 1000 }),
          // Warm the Players list (Active/Past/Pending Payment) so all
          // three tabs of the Players screen open instantly with no spinner.
          queryClient.prefetchQuery({ queryKey: ["/api/players?withCredits=true"], staleTime: 60 * 1000 }),
          queryClient.prefetchQuery({ queryKey: ["/api/players?withCredits=true&status=pending_payment"], staleTime: 60 * 1000 }),
          queryClient.prefetchQuery({ queryKey: ["/api/players?withCredits=true&status=inactive"], staleTime: 60 * 1000 })
        );
      } else if (currentRole === "player") {
        prefetchPromises.push(
          queryClient.prefetchQuery({ queryKey: ["/api/player/me/social"],  staleTime: 2 * 60 * 1000 }),
          queryClient.prefetchQuery({ queryKey: ["/api/play/sessions"],     staleTime: 2 * 60 * 1000 })
        );
      }

      updateProgress(50);
      await Promise.allSettled(prefetchPromises);
      updateProgress(90);
      await new Promise(resolve => setTimeout(resolve, 200));
      updateProgress(100);
      prefetchComplete.current = true;
      checkAndComplete();
    } catch {
      prefetchComplete.current = true;
      checkAndComplete();
    }
  }, [currentRole, queryClient, checkAndComplete, updateProgress]);

  useEffect(() => {
    if (isGuest) {
      setTimeout(onBootComplete, 300);
      return;
    }

    containerOpacity.value = withTiming(1, { duration: 400 });

    ringRotation.value = withRepeat(
      withTiming(360, { duration: 10000, easing: Easing.linear }),
      -1,
      false
    );

    logoScale.value = withRepeat(
      withSequence(
        withTiming(1.035, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0,   { duration: 1100, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );

    prefetchCriticalData();

    const maxTimeout = setTimeout(() => {
      if (!prefetchComplete.current) {
        timeoutReached.current = true;
        checkAndComplete();
      }
    }, MAX_BOOT_TIME);

    const minTimeout = setTimeout(() => {
      if (prefetchComplete.current) checkAndComplete();
    }, MIN_BOOT_TIME);

    return () => {
      clearTimeout(maxTimeout);
      clearTimeout(minTimeout);
    };
  }, []);

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));
  const ringStyle      = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringRotation.value}deg` }],
  }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));
  const barStyle = useAnimatedStyle(() => ({
    width: progressFill.value * TRACK_W,
  }));
  const dotStyle = useAnimatedStyle(() => ({
    left: progressFill.value * TRACK_W - DOT_SIZE / 2,
  }));

  return (
    <Animated.View style={[styles.root, containerStyle]}>
      <LinearGradient
        colors={[G.bg0, G.bg1, G.bg2, G.bg0]}
        locations={[0, 0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      {PARTICLES.map((p, i) => (
        <GlowParticle key={i} {...p} />
      ))}

      <View style={styles.fullColumn}>
        <View style={styles.topSpacer} />

        <View style={styles.heroWrapper}>
          <View style={styles.outerAura} />
          <View style={styles.midBloom} />
          <View style={styles.ringGlowShadow} />

          <Animated.View style={[styles.ringContainer, ringStyle]}>
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Defs>
                <SvgGradient id="bootRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%"   stopColor={G.purple} stopOpacity="1" />
                  <Stop offset="50%"  stopColor={G.cyan}   stopOpacity="1" />
                  <Stop offset="100%" stopColor={G.green}  stopOpacity="1" />
                </SvgGradient>
              </Defs>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_R - 18}
                fill="none"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={1}
              />
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_R}
                fill="none"
                stroke="url(#bootRingGrad)"
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
              />
            </Svg>
            <View style={[styles.hotspot, { left: HS1.left, top: HS1.top, backgroundColor: G.cyan }]} />
            <View style={[styles.hotspot, { left: HS2.left, top: HS2.top, backgroundColor: G.purple }]} />
          </Animated.View>

          <View style={styles.logoDisk} />

          <Animated.View style={logoStyle}>
            <Image
              source={require("../../assets/images/logo.png")}
              style={styles.logoImage}
              contentFit="contain"
            />
          </Animated.View>
        </View>

        <View style={{ height: 16 }} />
        <WordmarkBlock roleLabel={roleLabel} />
        <View style={{ height: 16 }} />

        <SysMsgCard messages={shuffledMessages} />

        <View style={styles.midSpacer} />

        <View style={styles.progressSection}>
          <Animated.Text style={styles.statusText}>
            {isReady ? "SYSTEMS READY." : "BOOTING GLOW OS..."}
          </Animated.Text>

          <View style={styles.progressRow}>
            <View style={styles.progressTrackWrapper}>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressBar, barStyle]}>
                  <LinearGradient
                    colors={[G.purple, G.cyan, G.green]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </View>
              <Animated.View style={[styles.progressDot, dotStyle]} />
            </View>
            <Text style={styles.pctText}>{displayPct}%</Text>
          </View>

          <Text style={styles.subStatus}>
            {isReady ? "READY TO PERFORM" : "INITIALIZING GLOW OS"}
          </Text>

          <View style={styles.dotIndicatorRow}>
            <View style={[styles.dotIndicator, styles.dotActive]} />
            <View style={styles.dotIndicator} />
            <View style={styles.dotIndicator} />
          </View>
        </View>

        <View style={{ height: 32 }} />
      </View>
    </Animated.View>
  );
}

function GlowParticle({
  color, xFrac, yFrac, delay, dx, dy,
}: {
  color: string; xFrac: number; yFrac: number; delay: number; dx: number; dy: number;
}) {
  const opacity    = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const durBase    = 2400 + delay % 600;

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withSequence(
        withTiming(0.75, { duration: 600 }),
        withRepeat(
          withSequence(
            withTiming(0.85, { duration: durBase * 0.7, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.4,  { duration: durBase * 0.7, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          false
        )
      )
    );
    translateX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(dx, { duration: durBase,       easing: Easing.inOut(Easing.sin) }),
          withTiming(0,  { duration: durBase,       easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(dy, { duration: durBase + 300, easing: Easing.inOut(Easing.sin) }),
          withTiming(0,  { duration: durBase + 300, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        { left: width * xFrac, top: height * yFrac, backgroundColor: color, shadowColor: color },
        style,
      ]}
    />
  );
}

function SysMsgCard({ messages }: { messages: string[] }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const opacity             = useSharedValue(1);
  const nextIdxRef          = useRef(1);

  const showNext = useCallback((idx: number) => setMsgIdx(idx), []);

  useEffect(() => {
    const iv = setInterval(() => {
      const next = nextIdxRef.current % messages.length;
      nextIdxRef.current = next + 1;
      opacity.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(showNext)(next);
        opacity.value = withTiming(1, { duration: 200 });
      });
    }, 2500);
    return () => clearInterval(iv);
  }, [showNext, messages.length]);

  const textStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.sysMsgCard}>
      <Text style={styles.sysMsgLabel}>SYS.MSG</Text>
      <Animated.Text style={[styles.sysMsgText, textStyle]}>
        {messages[msgIdx % messages.length]}
      </Animated.Text>
      <View style={styles.sysMsgStatusRow}>
        <View style={styles.sysMsgDot} />
        <Text style={styles.sysMsgStatusText}>SYSTEM NOMINAL</Text>
      </View>
      <View style={styles.tipIndicators}>
        <View style={[styles.tipIndicator, styles.tipIndicatorActive]} />
        <View style={styles.tipIndicator} />
        <View style={styles.tipIndicator} />
      </View>
    </View>
  );
}

function WordmarkBlock({ roleLabel }: { roleLabel: string }) {
  const sweepX = useSharedValue(-120);

  useEffect(() => {
    sweepX.value = withRepeat(
      withSequence(
        withTiming(SWEEP_RANGE + 20, { duration: 900, easing: Easing.out(Easing.cubic) }),
        withDelay(2100, withTiming(-120, { duration: 0 }))
      ),
      -1,
      false
    );
  }, []);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweepX.value }],
  }));

  return (
    <View style={styles.wordmarkOuter}>
      <View style={styles.wordmarkClip}>
        <View style={styles.wordmarkRow}>
          <Text style={styles.wordmarkGlow}>GLOW </Text>
          <Text style={styles.wordmarkUp}>UP</Text>
        </View>
        <Text style={styles.wordmarkSports}>SPORTS</Text>
        <Text style={styles.wordmarkTagline}>{roleLabel}</Text>
        <Animated.View style={[styles.lightSweep, sweepStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  particle: {
    position:      "absolute",
    width:         6,
    height:        6,
    borderRadius:  3,
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius:  6,
  },
  fullColumn: {
    flex:       1,
    alignItems: "center",
  },
  topSpacer: {
    flex:      1,
    maxHeight: 60,
    minHeight: 32,
  },
  midSpacer: {
    flex: 1,
  },
  heroWrapper: {
    width:          HERO_SIZE,
    height:         HERO_SIZE,
    alignItems:     "center",
    justifyContent: "center",
  },
  outerAura: {
    position:        "absolute",
    width:           HERO_SIZE,
    height:          HERO_SIZE,
    borderRadius:    HERO_SIZE / 2,
    backgroundColor: "rgba(168,85,247,0.07)",
  },
  midBloom: {
    position:        "absolute",
    width:           HERO_SIZE - 40,
    height:          HERO_SIZE - 40,
    borderRadius:    (HERO_SIZE - 40) / 2,
    left:            20,
    top:             20,
    backgroundColor: "rgba(57,213,255,0.05)",
  },
  ringGlowShadow: {
    position:      "absolute",
    width:         RING_SIZE,
    height:        RING_SIZE,
    borderRadius:  RING_SIZE / 2,
    left:          RING_OFFSET,
    top:           RING_OFFSET,
    shadowColor:   G.green,
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius:  32,
  },
  ringContainer: {
    position: "absolute",
    width:    RING_SIZE,
    height:   RING_SIZE,
    left:     RING_OFFSET,
    top:      RING_OFFSET,
  },
  hotspot: {
    position:      "absolute",
    width:         HS_SIZE,
    height:        HS_SIZE,
    borderRadius:  HS_SIZE / 2,
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius:  8,
  },
  logoDisk: {
    position:        "absolute",
    width:           124,
    height:          124,
    borderRadius:    62,
    backgroundColor: "rgba(168,85,247,0.14)",
  },
  logoImage: {
    width:        110,
    height:       110,
    borderRadius: 22,
  },
  wordmarkOuter: {
    alignItems: "center",
  },
  wordmarkClip: {
    overflow:          "hidden",
    alignItems:        "center",
    paddingHorizontal: 4,
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems:    "baseline",
  },
  wordmarkGlow: {
    fontSize:      42,
    fontWeight:    "900",
    color:         "#C38BFF",
    letterSpacing: 1,
  },
  wordmarkUp: {
    fontSize:      42,
    fontWeight:    "900",
    color:         G.green,
    letterSpacing: 1,
  },
  wordmarkSports: {
    fontSize:      14,
    fontWeight:    "700",
    color:         G.cyan,
    letterSpacing: 10,
    marginTop:     4,
  },
  wordmarkTagline: {
    fontSize:      9,
    fontWeight:    "600",
    color:         "rgba(183,255,60,0.6)",
    letterSpacing: 2.5,
    marginTop:     7,
    textTransform: "uppercase",
  },
  lightSweep: {
    position:        "absolute",
    top:             0,
    bottom:          0,
    width:           2,
    backgroundColor: "#D8AAFF",
    opacity:         0.7,
    shadowColor:     G.purple,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   1,
    shadowRadius:    10,
  },
  sysMsgCard: {
    width:             width * 0.82,
    backgroundColor:   "rgba(255,255,255,0.04)",
    borderRadius:      14,
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.08)",
    paddingHorizontal: 18,
    paddingVertical:   14,
    gap:               6,
  },
  sysMsgLabel: {
    fontSize:      10,
    fontWeight:    "700",
    color:         G.green,
    letterSpacing: 2,
    opacity:       0.8,
  },
  sysMsgText: {
    fontSize:      13,
    fontWeight:    "700",
    color:         G.white,
    letterSpacing: 1.2,
  },
  sysMsgStatusRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
    marginTop:     2,
  },
  sysMsgDot: {
    width:           7,
    height:          7,
    borderRadius:    3.5,
    backgroundColor: G.green,
    shadowColor:     G.green,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.8,
    shadowRadius:    4,
  },
  sysMsgStatusText: {
    fontSize:      10,
    fontWeight:    "600",
    color:         G.green,
    letterSpacing: 1.5,
    opacity:       0.75,
  },
  tipIndicators: {
    flexDirection: "row",
    gap:           5,
    marginTop:     6,
  },
  tipIndicator: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  tipIndicatorActive: {
    backgroundColor: G.green,
    width:           22,
    shadowColor:     G.green,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.7,
    shadowRadius:    4,
  },
  progressSection: {
    alignItems:        "center",
    width:             "100%",
    paddingHorizontal: 24,
    gap:               8,
  },
  statusText: {
    fontSize:      11,
    fontWeight:    "700",
    color:         G.muted,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom:  2,
  },
  progressRow: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            10,
    width:          "100%",
    justifyContent: "center",
  },
  progressTrackWrapper: {
    width:          TRACK_W,
    height:         DOT_SIZE + 4,
    justifyContent: "center",
    position:       "relative",
  },
  progressTrack: {
    width:           TRACK_W,
    height:          3,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius:    2,
    overflow:        "hidden",
  },
  progressBar: {
    position:     "absolute",
    top:          0,
    left:         0,
    height:       "100%",
    borderRadius: 2,
    overflow:     "hidden",
  },
  progressDot: {
    position:        "absolute",
    top:             (DOT_SIZE + 4) / 2 - DOT_SIZE / 2,
    width:           DOT_SIZE,
    height:          DOT_SIZE,
    borderRadius:    DOT_SIZE / 2,
    backgroundColor: G.white,
    shadowColor:     G.white,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.9,
    shadowRadius:    5,
  },
  pctText: {
    fontSize:      12,
    fontWeight:    "700",
    color:         G.green,
    letterSpacing: 0.5,
    minWidth:      36,
  },
  subStatus: {
    fontSize:      9,
    fontWeight:    "500",
    color:         "rgba(159,176,199,0.6)",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  dotIndicatorRow: {
    flexDirection: "row",
    gap:           6,
    marginTop:     2,
  },
  dotIndicator: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  dotActive: {
    backgroundColor: G.green,
    shadowColor:     G.green,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.8,
    shadowRadius:    4,
  },
});
