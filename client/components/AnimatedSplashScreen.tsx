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
import Feather from "@expo/vector-icons/Feather";
import * as SplashScreen from "expo-splash-screen";

SplashScreen.preventAutoHideAsync();

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

function hotspotXY(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    left: RING_SIZE / 2 + RING_R * Math.cos(rad) - HS_SIZE / 2,
    top:  RING_SIZE / 2 + RING_R * Math.sin(rad) - HS_SIZE / 2,
  };
}

const HS1 = hotspotXY(-60);
const HS2 = hotspotXY(120);

const STATUS_MESSAGES = [
  "LOADING COURT SYSTEMS...",
  "SYNCING PLAYER PROFILE...",
  "CALIBRATING AI COACH...",
  "PREPARING MATCH DATA...",
  "ACTIVATING GLOW ENGINE...",
];
const STATUS_FINAL = "SYSTEM READY";

const ICONS_ROW = [
  { icon: "target",      label: "FOCUS"   },
  { icon: "trending-up", label: "IMPROVE" },
  { icon: "zap",         label: "PERFORM" },
  { icon: "award",       label: "ACHIEVE" },
] as const;

const PARTICLES: {
  color: string; xFrac: number; yFrac: number; delay: number; dx: number; dy: number;
}[] = [
  { color: G.purple, xFrac: 0.08, yFrac: 0.12, delay: 0,   dx: 8,   dy: -12 },
  { color: G.cyan,   xFrac: 0.82, yFrac: 0.10, delay: 180, dx: -10, dy: -14 },
  { color: G.green,  xFrac: 0.05, yFrac: 0.60, delay: 360, dx: 10,  dy: 8   },
  { color: G.purple, xFrac: 0.86, yFrac: 0.65, delay: 540, dx: -8,  dy: 12  },
  { color: G.cyan,   xFrac: 0.44, yFrac: 0.88, delay: 720, dx: 6,   dy: -10 },
  { color: G.green,  xFrac: 0.20, yFrac: 0.35, delay: 270, dx: -12, dy: -6  },
  { color: G.purple, xFrac: 0.70, yFrac: 0.42, delay: 450, dx: 8,   dy: 9   },
  { color: G.cyan,   xFrac: 0.54, yFrac: 0.22, delay: 630, dx: -6,  dy: 14  },
];

const RING_OFFSET = (HERO_SIZE - RING_SIZE) / 2;

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
  const logoScale        = useSharedValue(1);
  const ringRotation     = useSharedValue(0);
  const progressFill     = useSharedValue(0);

  useEffect(() => {
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
      logoScale.value = withSequence(
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
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
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
                  <SvgGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
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
                  stroke="url(#ringGrad)"
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

          <View style={{ height: 20 }} />
          <WordmarkBlock />
          <View style={{ height: 22 }} />
          <BottomIconsRow />

          <View style={styles.midSpacer} />

          <View style={styles.progressSection}>
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
              {isReadyInternal ? "READY TO PERFORM" : "INITIALIZING GLOW OS"}
            </Text>

            <View style={styles.dotIndicatorRow}>
              <View style={[styles.dotIndicator, styles.dotActive]} />
              <View style={styles.dotIndicator} />
              <View style={styles.dotIndicator} />
            </View>
          </View>

          <View style={{ height: 14 }} />
          <QuoteCard />
          <View style={{ height: 28 }} />
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
  const [msgIdx, setMsgIdx]     = useState(0);
  const opacity                 = useSharedValue(1);
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);
  const frozenRef               = useRef(false);
  const nextIdxRef              = useRef(1);

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

function BottomIconsRow() {
  return (
    <View style={styles.iconsRow}>
      {ICONS_ROW.map(({ icon, label }) => (
        <View key={label} style={styles.iconItem}>
          <Feather name={icon} size={15} color={G.muted} />
          <Text style={styles.iconLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function QuoteCard() {
  return (
    <View style={styles.quoteCard}>
      <Text style={styles.quoteIcon}>{"\u201C"}</Text>
      <Text style={styles.quoteText}>
        {"Small improvements today, "}
        <Text style={styles.quoteHighlight}>{"big wins tomorrow."}</Text>
      </Text>
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
    flex:           1,
    alignItems:     "center",
  },
  topSpacer: {
    flex: 1,
    maxHeight: 72,
    minHeight: 40,
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
    fontWeight:    "500",
    color:         "rgba(248,250,252,0.45)",
    letterSpacing: 3,
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
  iconsRow: {
    flexDirection:   "row",
    justifyContent:  "center",
    gap:             32,
    paddingHorizontal: 20,
  },
  iconItem: {
    alignItems: "center",
    gap:        5,
  },
  iconLabel: {
    fontSize:      8,
    fontWeight:    "700",
    color:         G.muted,
    letterSpacing: 1.2,
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
    flexDirection: "row",
    alignItems:    "center",
    gap:           10,
    width:         "100%",
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
  quoteCard: {
    flexDirection:   "row",
    alignItems:      "center",
    marginHorizontal: 24,
    paddingHorizontal: 16,
    paddingVertical:   12,
    backgroundColor:  "rgba(255,255,255,0.04)",
    borderRadius:      12,
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.07)",
    gap:               10,
  },
  quoteIcon: {
    fontSize:   22,
    color:      G.purple,
    lineHeight: 24,
    fontWeight: "900",
    marginTop:  -2,
  },
  quoteText: {
    flex:       1,
    fontSize:   12,
    color:      G.muted,
    lineHeight: 18,
    fontWeight: "500",
  },
  quoteHighlight: {
    color:      G.green,
    fontWeight: "700",
  },
});
