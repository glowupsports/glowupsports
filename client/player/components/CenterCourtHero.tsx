import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { ProTennisColors, Spacing, BorderRadius, GlowColors, Colors } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface SessionData {
  id: string;
  date: string;
  type: string;
  courtName?: string;
  coachName?: string;
  duration?: number;
}

interface CenterCourtHeroProps {
  nextSession: SessionData | null;
  onCheckIn?: () => void;
  onBookSession?: () => void;
  onFindMatch?: () => void;
}

function CountdownTimer({ targetDate }: { targetDate: Date }) {
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
    <View style={countdownStyles.container}>
      <View style={countdownStyles.block}>
        <Text style={countdownStyles.number}>{formatNum(timeLeft.hours)}</Text>
        <Text style={countdownStyles.label}>HRS</Text>
      </View>
      <Text style={countdownStyles.separator}>:</Text>
      <View style={countdownStyles.block}>
        <Text style={countdownStyles.number}>{formatNum(timeLeft.minutes)}</Text>
        <Text style={countdownStyles.label}>MIN</Text>
      </View>
      <Text style={countdownStyles.separator}>:</Text>
      <View style={countdownStyles.block}>
        <Text style={countdownStyles.number}>{formatNum(timeLeft.seconds)}</Text>
        <Text style={countdownStyles.label}>SEC</Text>
      </View>
    </View>
  );
}

const countdownStyles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  block: {
    alignItems: "center",
    backgroundColor: ProTennisColors.surfaceElevated,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    minWidth: 56,
  },
  number: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.accentText,
    letterSpacing: -1,
  },
  label: {
    fontSize: 9,
    fontWeight: "600",
    color: ProTennisColors.textMuted,
    letterSpacing: 1,
  },
  separator: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.accentText,
    opacity: 0.6,
  },
}));

function SessionScheduled({ session, onCheckIn }: { session: SessionData; onCheckIn?: () => void }) {
  const pulseDot = useSharedValue(0);
  const sessionDate = new Date(session.date);
  const now = new Date();
  const minutesUntil = (sessionDate.getTime() - now.getTime()) / (1000 * 60);
  const canCheckIn = minutesUntil <= 60 && minutesUntil > -60;
  const isLive = minutesUntil <= 0 && minutesUntil > -60;
  
  useEffect(() => {
    pulseDot.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
  }, []);
  
  const dotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseDot.value, [0, 1], [0.4, 1]),
    transform: [{ scale: interpolate(pulseDot.value, [0, 1], [0.9, 1.1]) }],
  }));

  const handleCheckIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onCheckIn?.();
  };

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.sessionCard}>
      <View style={styles.sessionHeader}>
        <Animated.View style={[styles.liveDot, dotStyle, { backgroundColor: isLive ? ProTennisColors.live : ProTennisColors.success }]} />
        <Text style={styles.sessionLabel}>{isLive ? "LIVE NOW" : "NEXT SESSION"}</Text>
      </View>
      
      <CountdownTimer targetDate={sessionDate} />
      
      <View style={styles.sessionInfo}>
        <View style={styles.infoRow}>
          <Ionicons name="tennisball-outline" size={14} color={ProTennisColors.textMuted} />
          <Text style={styles.infoText}>{session.type || "Training"}</Text>
        </View>
        {session.coachName && (
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={14} color={ProTennisColors.textMuted} />
            <Text style={styles.infoText}>{session.coachName}</Text>
          </View>
        )}
        {session.courtName && (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color={ProTennisColors.textMuted} />
            <Text style={styles.infoText}>{session.courtName}</Text>
          </View>
        )}
      </View>
      
      {canCheckIn && (
        <Pressable style={styles.checkInButton} onPress={handleCheckIn}>
          <LinearGradient
            colors={ProTennisColors.gradientElectric as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.checkInGradient}
          >
            <Ionicons name="checkmark-circle" size={20} color={ProTennisColors.midnightBlue} />
            <Text style={styles.checkInText}>CHECK IN</Text>
          </LinearGradient>
        </Pressable>
      )}
    </Animated.View>
  );
}

function NoSessionScheduled({ onBookSession, onFindMatch }: { onBookSession?: () => void; onFindMatch?: () => void }) {
  const navigation = useNavigation<any>();
  
  const handleBookSession = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onBookSession) {
      onBookSession();
    } else {
      navigation.navigate("LessonBooking");
    }
  };
  
  const handleFindMatch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onFindMatch) {
      onFindMatch();
    } else {
      navigation.navigate("PlayerTabs", { screen: "PlayStack", params: { screen: "OpenMatchFeed" } });
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.noSessionContainer}>
      <Text style={styles.offSeasonText}>OFF SEASON MODE</Text>
      <Text style={styles.offSeasonSubtext}>Ready to train?</Text>
      
      <View style={styles.actionCardsRow}>
        <Pressable style={styles.actionCard} onPress={handleBookSession}>
          {Platform.OS === "ios" ? (
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill}>
              <LinearGradient
                colors={[ProTennisColors.surfaceCard + "90", ProTennisColors.surfaceDark + "95"]}
                style={StyleSheet.absoluteFill}
              />
            </BlurView>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: ProTennisColors.surfaceCard }]} />
          )}
          <View style={styles.actionCardContent}>
            <View style={[styles.actionIconWrapper, { borderColor: Colors.dark.accentTextBorder }]}>
              <Ionicons name="calendar-outline" size={28} color={Colors.dark.accentText} />
            </View>
            <Text style={styles.actionTitle}>HIT THE COURT</Text>
            <Text style={styles.actionSubtitle}>Book a training session</Text>
          </View>
        </Pressable>
        
        <Pressable style={styles.actionCard} onPress={handleFindMatch}>
          {Platform.OS === "ios" ? (
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill}>
              <LinearGradient
                colors={[ProTennisColors.surfaceCard + "90", ProTennisColors.surfaceDark + "95"]}
                style={StyleSheet.absoluteFill}
              />
            </BlurView>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: ProTennisColors.surfaceCard }]} />
          )}
          <View style={styles.actionCardContent}>
            <View style={[styles.actionIconWrapper, { borderColor: ProTennisColors.neonCyan }]}>
              <Ionicons name="flash-outline" size={28} color={ProTennisColors.neonCyan} />
            </View>
            <Text style={styles.actionTitle}>CHALLENGE</Text>
            <Text style={styles.actionSubtitle}>Find a rival nearby</Text>
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function CenterCourtHero({ nextSession, onCheckIn, onBookSession, onFindMatch }: CenterCourtHeroProps) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[ProTennisColors.surfaceDark, ProTennisColors.midnightBlue]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.courtLinesOverlay}>
        <View style={styles.courtLine} />
        <View style={styles.courtLineVertical} />
      </View>
      
      {nextSession ? (
        <SessionScheduled session={nextSession} onCheckIn={onCheckIn} />
      ) : (
        <NoSessionScheduled onBookSession={onBookSession} onFindMatch={onFindMatch} />
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    minHeight: 200,
  },
  courtLinesOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.1,
  },
  courtLine: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: ProTennisColors.white,
  },
  courtLineVertical: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: ProTennisColors.white,
  },
  sessionCard: {
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.lg,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sessionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: ProTennisColors.textSecondary,
    letterSpacing: 2,
  },
  sessionInfo: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  infoText: {
    fontSize: 12,
    color: ProTennisColors.textMuted,
  },
  checkInButton: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  checkInGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  checkInText: {
    fontSize: 16,
    fontWeight: "800",
    color: ProTennisColors.midnightBlue,
    letterSpacing: 1,
  },
  noSessionContainer: {
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  offSeasonText: {
    fontSize: 14,
    fontWeight: "700",
    color: ProTennisColors.textMuted,
    letterSpacing: 3,
  },
  offSeasonSubtext: {
    fontSize: 18,
    fontWeight: "600",
    color: ProTennisColors.white,
    marginBottom: Spacing.sm,
  },
  actionCardsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  actionCard: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
  },
  actionCardContent: {
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: ProTennisColors.midnightBlue + "80",
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: ProTennisColors.white,
    letterSpacing: 0.5,
    marginTop: Spacing.xs,
  },
  actionSubtitle: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
    textAlign: "center",
  },
}));
