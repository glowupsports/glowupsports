import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, FontSizes } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { useAppMode } from "@/context/AppModeContext";
import { getApiUrl } from "@/lib/query-client";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

type UserRole = "coach" | "player" | "academy_owner" | "admin" | "platform" | "service_provider";

const GAME_MESSAGES_BY_ROLE: Record<UserRole, string[]> = {
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

const MIN_BOOT_TIME = 1800;
const MAX_BOOT_TIME = 4500;

interface BootScreenProps {
  onBootComplete: () => void;
}

export default function BootScreen({ onBootComplete }: BootScreenProps) {
  const queryClient = useQueryClient();
  const { user, isGuest } = useAuth();
  const { mode } = useAppMode();
  
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [bootPhase, setBootPhase] = useState<"loading" | "ready">("loading");
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const tipFadeAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  const bootStartTime = useRef(Date.now());
  const prefetchComplete = useRef(false);
  const timeoutReached = useRef(false);

  const currentRole = (mode || "player") as UserRole;
  const messages = GAME_MESSAGES_BY_ROLE[currentRole] || GAME_MESSAGES_BY_ROLE.player;
  const shuffledTips = useRef(
    [...messages].sort(() => Math.random() - 0.5)
  ).current;

  const checkAndComplete = useCallback(() => {
    const elapsed = Date.now() - bootStartTime.current;
    
    if (prefetchComplete.current && elapsed >= MIN_BOOT_TIME) {
      setBootPhase("ready");
      setTimeout(onBootComplete, 300);
    } else if (elapsed >= MAX_BOOT_TIME) {
      timeoutReached.current = true;
      setBootPhase("ready");
      setTimeout(onBootComplete, 300);
    }
  }, [onBootComplete]);

  const prefetchCriticalData = useCallback(async () => {
    const apiUrl = getApiUrl();
    const prefetchPromises: Promise<any>[] = [];

    setProgress(10);

    try {
      prefetchPromises.push(
        queryClient.prefetchQuery({
          queryKey: ["/api/me"],
          staleTime: 5 * 60 * 1000,
        })
      );
      setProgress(25);

      if (currentRole === "coach") {
        const todayStr = new Date().toISOString().split("T")[0];
        prefetchPromises.push(
          queryClient.prefetchQuery({
            queryKey: [`/api/coach/calendar?date=${todayStr}&view=week`],
            staleTime: 2 * 60 * 1000,
          }),
          queryClient.prefetchQuery({
            queryKey: ["/api/coach/series"],
            staleTime: 5 * 60 * 1000,
          }),
          queryClient.prefetchQuery({
            queryKey: ["/api/coach/earnings/summary"],
            staleTime: 5 * 60 * 1000,
          })
        );
      } else if (currentRole === "player") {
        prefetchPromises.push(
          queryClient.prefetchQuery({
            queryKey: ["/api/player/me/social"],
            staleTime: 2 * 60 * 1000,
          }),
          queryClient.prefetchQuery({
            queryKey: ["/api/play/sessions"],
            staleTime: 2 * 60 * 1000,
          })
        );
      }

      setProgress(50);

      await Promise.allSettled(prefetchPromises);
      
      setProgress(90);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setProgress(100);
      prefetchComplete.current = true;
      checkAndComplete();
    } catch (error) {
      console.warn("[Boot] Prefetch error:", error);
      prefetchComplete.current = true;
      checkAndComplete();
    }
  }, [currentRole, queryClient, checkAndComplete]);

  useEffect(() => {
    if (isGuest) {
      setTimeout(onBootComplete, 300);
      return;
    }

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    prefetchCriticalData();

    const maxTimeout = setTimeout(() => {
      if (!prefetchComplete.current) {
        timeoutReached.current = true;
        checkAndComplete();
      }
    }, MAX_BOOT_TIME);

    const minTimeout = setTimeout(() => {
      if (prefetchComplete.current) {
        checkAndComplete();
      }
    }, MIN_BOOT_TIME);

    return () => {
      clearTimeout(maxTimeout);
      clearTimeout(minTimeout);
    };
  }, [fadeAnim, pulseAnim, prefetchCriticalData, checkAndComplete]);

  useEffect(() => {
    const tipInterval = setInterval(() => {
      Animated.timing(tipFadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setCurrentTipIndex((prev) => (prev + 1) % shuffledTips.length);
        Animated.timing(tipFadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }, 2500);

    return () => clearInterval(tipInterval);
  }, [tipFadeAnim, shuffledTips.length]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  const currentTip = shuffledTips[currentTipIndex];

  return (
    <LinearGradient
      colors={[Colors.dark.backgroundRoot, "#0a1a1a", Colors.dark.backgroundRoot]}
      style={styles.container}
    >
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Animated.View style={[styles.logoContainer, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>GS</Text>
          </View>
          <Text style={styles.appName}>Glow Up Sports</Text>
          <Text style={styles.tagline}>GLOW PROTOCOL ACTIVE</Text>
        </Animated.View>

        <View style={styles.tipContainer}>
          <Animated.View style={[styles.tipCard, { opacity: tipFadeAnim }]}>
            <Text style={styles.systemLabel}>SYS.MSG</Text>
            <Text style={styles.systemMessage}>{shuffledTips[currentTipIndex]}</Text>
            <View style={styles.statusDotRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusDotText}>SYSTEM NOMINAL</Text>
            </View>
          </Animated.View>
        </View>

        <View style={styles.tipIndicators}>
          {shuffledTips.map((_, index) => (
            <View
              key={index}
              style={[
                styles.tipIndicator,
                index === currentTipIndex && styles.tipIndicatorActive,
              ]}
            />
          ))}
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {bootPhase === "ready" ? "SYSTEMS READY." : "BOOTING GLOW OS..."}
          </Text>
        </View>

        <Text style={styles.roleLabel}>
          {currentRole === "coach" && "Coach Mode"}
          {currentRole === "player" && "Player Mode"}
          {currentRole === "academy_owner" && "Academy Owner"}
          {currentRole === "admin" && "Admin Mode"}
          {currentRole === "platform" && "Platform Mode"}
          {currentRole === "service_provider" && "Provider Mode"}
        </Text>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    width: "100%",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  logoText: {
    fontSize: 36,
    fontWeight: "bold",
    color: Colors.dark.buttonText,
  },
  appName: {
    fontSize: FontSizes["2xl"],
    fontWeight: "bold",
    color: Colors.dark.text,
    marginTop: Spacing.lg,
  },
  tagline: {
    fontSize: 11,
    color: Colors.dark.primary,
    marginTop: Spacing.xs,
    letterSpacing: 3,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  tipContainer: {
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  tipCard: {
    backgroundColor: "rgba(200, 255, 61, 0.05)",
    borderRadius: 12,
    padding: Spacing.lg,
    alignItems: "flex-start",
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.2)",
  },
  systemLabel: {
    fontSize: 10,
    color: Colors.dark.primary,
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: Spacing.sm,
    opacity: 0.7,
  },
  systemMessage: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
  },
  statusDotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },
  statusDotText: {
    fontSize: 10,
    color: Colors.dark.primary,
    letterSpacing: 1.5,
    fontWeight: "600",
    opacity: 0.7,
  },
  tipIndicators: {
    flexDirection: "row",
    marginTop: Spacing.lg,
    marginBottom: Spacing["2xl"],
  },
  tipIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    marginHorizontal: 4,
  },
  tipIndicatorActive: {
    backgroundColor: Colors.dark.primary,
    width: 24,
  },
  progressContainer: {
    width: "100%",
    maxWidth: 280,
    alignItems: "center",
  },
  progressBar: {
    width: "100%",
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    color: Colors.dark.primary,
    marginTop: Spacing.sm,
    letterSpacing: 2,
    fontWeight: "600",
    textTransform: "uppercase",
    opacity: 0.75,
  },
  roleLabel: {
    position: "absolute",
    bottom: 40,
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
});
