import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  interpolate,
  Easing,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import Svg, { Line, Rect, Circle, Ellipse, Path } from "react-native-svg";
import { ProTennisColors, Spacing, BorderRadius, GlowColors, FunctionColors, Colors } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { usePlayerState, BroadcastMode } from "@/player/context/PlayerStateContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ARENA_HEIGHT = 220;

interface SessionData {
  id: string;
  date: string;
  type: string;
  courtName?: string;
  coachName?: string;
}

interface CenterCourtArenaProps {
  nextSession: SessionData | null;
  onCheckIn?: () => void;
  onBookSession?: () => void;
  onFindMatch?: () => void;
}

const BROADCAST_COPY: Record<BroadcastMode, { 
  title: string; 
  subtitle: string;
  actionLabel?: string;
  commentatorNote?: string;
}> = {
  on_air: {
    title: "LIVE ON CENTER COURT",
    subtitle: "The spotlight is on you",
    actionLabel: "VIEW STATS",
    commentatorNote: "Every point counts in this moment",
  },
  pre_game: {
    title: "STEPPING INTO THE ARENA",
    subtitle: "Momentum is building",
    actionLabel: "CHECK IN",
    commentatorNote: "The journey to greatness continues",
  },
  post_game: {
    title: "PERFORMANCE LOCKED IN",
    subtitle: "Another chapter written",
    actionLabel: "VIEW RECAP",
    commentatorNote: "Progress captured, growth recorded",
  },
  rest_day: {
    title: "RECOVERY MODE",
    subtitle: "Champions rest to rise again",
    commentatorNote: "The best prepare when others pause",
  },
  off_air: {
    title: "YOUR COURT AWAITS",
    subtitle: "The next breakthrough is one session away",
    actionLabel: "ENTER THE ARENA",
    commentatorNote: "Every champion started with a single swing",
  },
};

function CourtSurfaceBackground({ mode }: { mode: BroadcastMode }) {
  const courtPulse = useSharedValue(0);
  const lineGlow = useSharedValue(0);
  
  useEffect(() => {
    if (mode === "on_air") {
      courtPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      lineGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500 }),
          withTiming(0.3, { duration: 1500 })
        ),
        -1,
        true
      );
    } else if (mode === "pre_game") {
      courtPulse.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 3000 }),
          withTiming(0, { duration: 3000 })
        ),
        -1,
        true
      );
    }
  }, [mode]);

  const lineOpacity = mode === "on_air" ? 0.35 : mode === "pre_game" ? 0.2 : 0.1;
  const courtColor = mode === "rest_day" ? Colors.dark.chipBackground : ProTennisColors.midnightBlue;

  return (
    <Svg 
      style={StyleSheet.absoluteFill} 
      viewBox="0 0 100 100" 
      preserveAspectRatio="xMidYMid slice"
    >
      <Rect x="0" y="0" width="100" height="100" fill={courtColor} />
      
      <Rect 
        x="10" y="15" width="80" height="70" 
        stroke={Colors.dark.accentText}
        strokeWidth="0.5"
        fill="none"
        opacity={lineOpacity}
      />
      
      <Line 
        x1="10" y1="50" x2="90" y2="50" 
        stroke={Colors.dark.accentText}
        strokeWidth="0.4"
        opacity={lineOpacity * 0.8}
      />
      
      <Line 
        x1="50" y1="15" x2="50" y2="85" 
        stroke={Colors.dark.accentText}
        strokeWidth="0.4"
        opacity={lineOpacity * 0.8}
      />
      
      <Rect 
        x="20" y="25" width="25" height="50" 
        stroke={Colors.dark.accentText}
        strokeWidth="0.3"
        fill="none"
        opacity={lineOpacity * 0.6}
      />
      <Rect 
        x="55" y="25" width="25" height="50" 
        stroke={Colors.dark.accentText}
        strokeWidth="0.3"
        fill="none"
        opacity={lineOpacity * 0.6}
      />
      
      {mode === "on_air" && (
        <>
          <Circle cx="50" cy="50" r="3" fill={GlowColors.primary} opacity="0.4" />
          <Ellipse 
            cx="50" cy="50" rx="8" ry="4" 
            stroke={ProTennisColors.neonCyan} 
            strokeWidth="0.3"
            fill="none"
            opacity="0.3"
          />
        </>
      )}
    </Svg>
  );
}

function BroadcastOverlay({ mode, session }: { mode: BroadcastMode; session?: SessionData | null }) {
  const overlayPulse = useSharedValue(0);
  
  useEffect(() => {
    if (mode === "on_air") {
      overlayPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0.6, { duration: 800 })
        ),
        -1,
        true
      );
    }
  }, [mode]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: mode === "on_air" ? overlayPulse.value : 1,
  }));

  if (mode === "on_air") {
    return (
      <Animated.View style={[styles.liveOverlay, pulseStyle]}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </Animated.View>
    );
  }

  return null;
}

function CountdownDisplay({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const diff = Math.max(0, targetDate.getTime() - now.getTime());
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft({ hours, minutes, seconds });
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);
  
  const formatNum = (n: number) => n.toString().padStart(2, "0");
  
  return (
    <View style={styles.countdownContainer}>
      <View style={styles.countdownBlock}>
        <Text style={styles.countdownNumber}>{formatNum(timeLeft.hours)}</Text>
        <Text style={styles.countdownLabel}>HRS</Text>
      </View>
      <Text style={styles.countdownSeparator}>:</Text>
      <View style={styles.countdownBlock}>
        <Text style={styles.countdownNumber}>{formatNum(timeLeft.minutes)}</Text>
        <Text style={styles.countdownLabel}>MIN</Text>
      </View>
      <Text style={styles.countdownSeparator}>:</Text>
      <View style={styles.countdownBlock}>
        <Text style={styles.countdownNumber}>{formatNum(timeLeft.seconds)}</Text>
        <Text style={styles.countdownLabel}>SEC</Text>
      </View>
    </View>
  );
}

export function CenterCourtArena({
  nextSession,
  onCheckIn,
  onBookSession,
  onFindMatch,
}: CenterCourtArenaProps) {
  const { state } = usePlayerState();
  const mode = state.broadcastMode;
  const copy = BROADCAST_COPY[mode];
  
  const contentScale = useSharedValue(0.95);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    contentOpacity.value = withTiming(1, { duration: 600 });
    contentScale.value = withSpring(1, { damping: 15, stiffness: 100 });
  }, [mode]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ scale: contentScale.value }],
  }));

  const handlePrimaryAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (mode === "on_air" || mode === "pre_game") {
      onCheckIn?.();
    } else {
      onBookSession?.();
    }
  };

  const sessionDate = nextSession?.date ? new Date(nextSession.date) : null;
  const showCountdown = (mode === "pre_game" || mode === "on_air") && sessionDate;

  const dynamicTitle = nextSession?.type 
    ? `${copy.title.replace("CENTER COURT", "")} ${nextSession.type.toUpperCase()}`
    : copy.title;

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      <CourtSurfaceBackground mode={mode} />
      
      <LinearGradient
        colors={["transparent", "rgba(9, 14, 23, 0.7)", "rgba(9, 14, 23, 0.95)"]}
        locations={[0, 0.6, 1]}
        style={styles.gradient}
      />

      <BroadcastOverlay mode={mode} session={nextSession} />

      <Animated.View style={[styles.content, contentStyle]}>
        <View style={styles.titleSection}>
          <Text style={styles.broadcastTitle}>{copy.title}</Text>
          {nextSession?.coachName && (
            <Text style={styles.coachText}>with Coach {nextSession.coachName}</Text>
          )}
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
          {copy.commentatorNote && (
            <Text style={styles.commentatorNote}>{copy.commentatorNote}</Text>
          )}
        </View>

        {showCountdown && sessionDate && (
          <CountdownDisplay targetDate={sessionDate} />
        )}

        <View style={styles.actionsRow}>
          {copy.actionLabel && (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
              onPress={handlePrimaryAction}
            >
              <Ionicons 
                name={mode === "off_air" ? "tennisball" : "play"} 
                size={18} 
                color={ProTennisColors.midnightBlue} 
              />
              <Text style={styles.primaryButtonText}>{copy.actionLabel}</Text>
            </Pressable>
          )}
          
          {mode === "off_air" && (
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onFindMatch?.();
              }}
            >
              <Ionicons name="flash" size={16} color={ProTennisColors.neonCyan} />
              <Text style={styles.secondaryButtonText}>CHALLENGE</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    height: ARENA_HEIGHT,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.accentTextBorder,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  liveOverlay: {
    position: "absolute",
    top: Spacing.md,
    left: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: FunctionColors.error + "33",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: FunctionColors.error,
  },
  liveText: {
    fontSize: 10,
    fontWeight: "800",
    color: FunctionColors.error,
    letterSpacing: 1,
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  titleSection: {
    marginBottom: Spacing.md,
  },
  broadcastTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: ProTennisColors.white,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  coachText: {
    fontSize: 12,
    fontWeight: "600",
    color: ProTennisColors.neonCyan,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: ProTennisColors.textMuted,
    fontStyle: "italic",
  },
  commentatorNote: {
    fontSize: 10,
    fontWeight: "500",
    color: Colors.dark.accentText,
    opacity: 0.7,
    marginTop: 6,
    letterSpacing: 0.3,
  },
  countdownContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    marginBottom: Spacing.md,
  },
  countdownBlock: {
    alignItems: "center",
    backgroundColor: ProTennisColors.surfaceElevated,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    minWidth: 48,
  },
  countdownNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.accentText,
    letterSpacing: -1,
  },
  countdownLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: ProTennisColors.textMuted,
    letterSpacing: 0.5,
  },
  countdownSeparator: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.accentText,
    opacity: 0.6,
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  primaryButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: ProTennisColors.midnightBlue,
    letterSpacing: 1,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ProTennisColors.neonCyan + "15",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: ProTennisColors.neonCyan + "40",
    gap: 6,
  },
  secondaryButtonPressed: {
    backgroundColor: ProTennisColors.neonCyan + "25",
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: ProTennisColors.neonCyan,
    letterSpacing: 0.5,
  },
}));
