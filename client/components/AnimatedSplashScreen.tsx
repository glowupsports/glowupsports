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
import { LinearGradient } from "expo-linear-gradient";
import * as SplashScreen from "expo-splash-screen";

SplashScreen.preventAutoHideAsync();

const { width, height } = Dimensions.get("window");

const G = {
  bg0:    "#04060A",
  bg1:    "#07111F",
  bg2:    "#0B1830",
  purple: "#A855F7",
  green:  "#B7FF3C",
  cyan:   "#39D5FF",
  white:  "#F8FAFC",
  muted:  "#9FB0C7",
  bloom:  "rgba(106,63,255,0.10)",
} as const;

const RING_SIZE   = 192;
const RING_STROKE = 3;
const RING_R      = RING_SIZE / 2 - RING_STROKE / 2;
const TRACK_W     = width * 0.65;
const DOT_SIZE    = 8;
const SWEEP_RANGE = width * 0.62;

const STATUS_MESSAGES = [
  "INITIALIZING GLOW OS",
  "SYNCING PLAYER PROFILE",
  "LOADING AI COACH",
  "PREPARING PERFORMANCE DATA",
  "COURT SYSTEMS ONLINE",
];
const STATUS_FINAL = "SYSTEM READY";

const PARTICLES: {
  color: string; xFrac: number; yFrac: number; delay: number; dx: number; dy: number;
}[] = [
  { color: G.purple, xFrac: 0.14, yFrac: 0.19, delay: 0,   dx: 8,   dy: -15 },
  { color: G.cyan,   xFrac: 0.79, yFrac: 0.13, delay: 180, dx: -10, dy: -18 },
  { color: G.green,  xFrac: 0.08, yFrac: 0.67, delay: 360, dx: 12,  dy: 10  },
  { color: G.purple, xFrac: 0.83, yFrac: 0.71, delay: 540, dx: -8,  dy: 14  },
  { color: G.cyan,   xFrac: 0.46, yFrac: 0.89, delay: 720, dx: 6,   dy: -12 },
  { color: G.green,  xFrac: 0.24, yFrac: 0.39, delay: 270, dx: -14, dy: -8  },
  { color: G.purple, xFrac: 0.68, yFrac: 0.44, delay: 450, dx: 10,  dy: 11  },
  { color: G.cyan,   xFrac: 0.56, yFrac: 0.24, delay: 630, dx: -6,  dy: 16  },
];

interface AnimatedSplashScreenProps {
  isReady: boolean;
  onComplete: () => void;
  children: React.ReactNode;
}

export function AnimatedSplashScreen({
  isReady,
  onComplete,
  children,
}: AnimatedSplashScreenProps) {
  const [showSplash, setShowSplash]           = useState(true);
  const [isReadyInternal, setIsReadyInternal] = useState(false);
  const [displayPct, setDisplayPct]           = useState(0);
  const hasExited                             = useRef(false);

  const containerOpacity = useSharedValue(1);
  const monogramScale    = useSharedValue(1);
  const ringRotation     = useSharedValue(0);
  const progressFill     = useSharedValue(0);

  useEffect(() => {
    ringRotation.value = withRepeat(
      withTiming(360, { duration: 10000, easing: Easing.linear }),
      -1,
      false
    );

    monogramScale.value = withRepeat(
      withSequence(
        withTiming(1.035, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0,   { duration: 1100, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );

    progressFill.value = withTiming(0.88, { duration: 2000, easing: Easing.out(Easing.cubic) });

    const start = Date.now();
    const iv = setInterval(() => {
      const pct = Math.min(88, Math.round(((Date.now() - start) / 2000) * 88));
      setDisplayPct(pct);
      if (pct >= 88) clearInterval(iv);
    }, 50);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!isReady || hasExited.current) return;
    hasExited.current = true;

    SplashScreen.hideAsync();

    progressFill.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
    const start = Date.now();
    const iv = setInterval(() => {
      const pct = Math.min(100, 88 + Math.round(((Date.now() - start) / 400) * 12));
      setDisplayPct(pct);
      if (pct >= 100) clearInterval(iv);
    }, 30);

    const t1 = setTimeout(() => setIsReadyInternal(true), 200);

    const t2 = setTimeout(() => {
      monogramScale.value = withSequence(
        withTiming(1.08, { duration: 220 }),
        withTiming(1.0,  { duration: 220 }, () => {
          containerOpacity.value = withTiming(0, { duration: 350 }, () => {
            runOnJS(setShowSplash)(false);
            runOnJS(onComplete)();
          });
        })
      );
    }, 700);

    return () => {
      clearInterval(iv);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isReady]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));
  const ringStyle      = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringRotation.value}deg` }],
  }));
  const monogramStyle  = useAnimatedStyle(() => ({
    transform: [{ scale: monogramScale.value }],
  }));
  const barStyle = useAnimatedStyle(() => ({
    width: progressFill.value * TRACK_W,
  }));
  const dotStyle = useAnimatedStyle(() => ({
    left: progressFill.value * TRACK_W - DOT_SIZE / 2,
  }));

  if (!showSplash) return <>{children}</>;

  return (
    <View style={styles.root}>
      {children}
      <Animated.View style={[StyleSheet.absoluteFill, containerStyle]}>
        <LinearGradient
          colors={[G.bg0, G.bg1, G.bg2, G.bg0]}
          locations={[0, 0.35, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.centerBloom} />

        {PARTICLES.map((p, i) => (
          <GlowParticle key={i} {...p} />
        ))}

        <View style={styles.mainColumn}>
          <View style={styles.heroWrapper}>
            <View style={styles.ringGlowShadow} />
            <Animated.View style={[styles.ringContainer, ringStyle]}>
              <Svg width={RING_SIZE} height={RING_SIZE}>
                <Defs>
                  <SvgGradient id="glowRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%"   stopColor={G.purple} stopOpacity="1" />
                    <Stop offset="50%"  stopColor={G.cyan}   stopOpacity="1" />
                    <Stop offset="100%" stopColor={G.green}  stopOpacity="1" />
                  </SvgGradient>
                </Defs>
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_R - 14}
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth={1}
                />
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_R}
                  fill="none"
                  stroke="url(#glowRingGrad)"
                  strokeWidth={RING_STROKE}
                  strokeLinecap="round"
                />
              </Svg>
            </Animated.View>
            <Animated.Text style={[styles.monogram, monogramStyle]}>GU</Animated.Text>
          </View>

          <WordmarkBlock />
        </View>

        <View style={styles.systemBlock}>
          <GlowStatusText isReady={isReadyInternal} />

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
            {isReadyInternal ? "READY TO PERFORM" : "BOOTING COURT SYSTEMS"}
          </Text>
        </View>
      </Animated.View>
    </View>
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
    // Fade in, then pulse opacity continuously
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

function GlowStatusText({ isReady }: { isReady: boolean }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const opacity             = useSharedValue(1);
  const intervalRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const frozenRef           = useRef(false);
  const nextIdxRef          = useRef(1);

  const showNext  = useCallback((idx: number) => setMsgIdx(idx), []);
  const showReady = useCallback(() => setMsgIdx(STATUS_MESSAGES.length), []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (frozenRef.current) return;
      const next = nextIdxRef.current;
      nextIdxRef.current = (next + 1) % STATUS_MESSAGES.length;
      opacity.value = withTiming(0, { duration: 150 }, () => {
        runOnJS(showNext)(next);
        opacity.value = withTiming(1, { duration: 150 });
      });
    }, 850);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [showNext]);

  useEffect(() => {
    if (!isReady || frozenRef.current) return;
    frozenRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    opacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(showReady)();
      opacity.value = withTiming(1, { duration: 200 });
    });
  }, [isReady, showReady]);

  const textStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const text = msgIdx >= STATUS_MESSAGES.length ? STATUS_FINAL : STATUS_MESSAGES[msgIdx];

  return (
    <Animated.Text style={[styles.statusText, textStyle]}>{text}</Animated.Text>
  );
}

function WordmarkBlock() {
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
        <Text style={styles.wordmarkTagline}>GLOW UP YOUR GAME</Text>
        <Animated.View style={[styles.lightSweep, sweepStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centerBloom: {
    position:        "absolute",
    alignSelf:       "center",
    top:             height * 0.28,
    width:           220,
    height:          130,
    backgroundColor: G.bloom,
    borderRadius:    110,
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
  mainColumn: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
    paddingTop:     24,
    gap:            32,
  },
  heroWrapper: {
    width:          RING_SIZE + 20,
    height:         RING_SIZE + 20,
    alignItems:     "center",
    justifyContent: "center",
  },
  ringGlowShadow: {
    position:      "absolute",
    width:         RING_SIZE,
    height:        RING_SIZE,
    borderRadius:  RING_SIZE / 2,
    shadowColor:   G.green,
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius:  24,
  },
  ringContainer: {
    position: "absolute",
  },
  monogram: {
    fontSize:         38,
    fontWeight:       "700",
    color:            G.purple,
    letterSpacing:    2,
    textShadowColor:  G.purple,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
    fontFamily:       "serif",
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
    fontSize:      28,
    fontWeight:    "800",
    color:         "#C38BFF",
    letterSpacing: 1.3,
  },
  wordmarkUp: {
    fontSize:      28,
    fontWeight:    "800",
    color:         G.green,
    letterSpacing: 1.3,
  },
  wordmarkSports: {
    fontSize:      13,
    fontWeight:    "700",
    color:         G.cyan,
    letterSpacing: 8,
    marginTop:     4,
  },
  wordmarkTagline: {
    fontSize:      9,
    fontWeight:    "500",
    color:         "rgba(248,250,252,0.55)",
    letterSpacing: 3,
    marginTop:     6,
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
  systemBlock: {
    position:   "absolute",
    bottom:     72,
    left:       0,
    right:      0,
    alignItems: "center",
    gap:        10,
  },
  statusText: {
    fontSize:      11,
    fontWeight:    "700",
    color:         G.muted,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginBottom:  4,
  },
  progressRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           10,
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
    marginTop:     2,
  },
});
