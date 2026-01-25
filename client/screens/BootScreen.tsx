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
import { Colors, Spacing, FontSizes } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { useAppMode } from "@/context/AppModeContext";
import { getApiUrl } from "@/lib/query-client";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

type UserRole = "coach" | "player" | "academy_owner" | "admin" | "platform";

interface Tip {
  title: string;
  description: string;
  icon: string;
}

const TIPS_BY_ROLE: Record<UserRole, Tip[]> = {
  coach: [
    { title: "Calendar Booking", description: "Tap any time slot to create a lesson instantly", icon: "📅" },
    { title: "Quick Attendance", description: "Swipe left on a player to mark them present or late", icon: "✓" },
    { title: "Earnings Dashboard", description: "Track your monthly earnings and payout history", icon: "💰" },
    { title: "Session Feedback", description: "Give instant feedback after every lesson", icon: "⭐" },
    { title: "Series Management", description: "Create recurring lessons with one tap", icon: "🔄" },
    { title: "Player Progress", description: "View each player's Glow Level progression", icon: "📈" },
    { title: "Court Availability", description: "See real-time court availability before booking", icon: "🎾" },
    { title: "Message Players", description: "Chat directly with players and parents", icon: "💬" },
    { title: "XP Rewards", description: "Award XP to players for great performance", icon: "🏆" },
    { title: "Holiday Mode", description: "Freeze lessons during vacations with one click", icon: "🌴" },
    { title: "Smart Scheduling", description: "AI suggests optimal lesson times based on your history", icon: "🤖" },
    { title: "Burnout Prevention", description: "Track your workload to stay balanced", icon: "❤️" },
    { title: "Extend Classes", description: "Extend a series with extra weeks in seconds", icon: "➕" },
    { title: "Court Preferences", description: "Set your preferred courts for faster booking", icon: "🎯" },
    { title: "Invoice Generation", description: "Generate invoices automatically for parents", icon: "📄" },
  ],
  player: [
    { title: "Book a Court", description: "Reserve your favorite court with just one tap", icon: "🎾" },
    { title: "Track Your Level", description: "Watch your Glow Level grow with every session", icon: "📊" },
    { title: "Challenge Friends", description: "Invite friends to a match and compare stats", icon: "⚔️" },
    { title: "View Schedule", description: "See all your upcoming lessons at a glance", icon: "📅" },
    { title: "Coach Availability", description: "Check when your coach is free for extra lessons", icon: "👨‍🏫" },
    { title: "Earn XP", description: "Complete sessions and challenges to earn XP", icon: "⭐" },
    { title: "Match History", description: "Review all your past matches and scores", icon: "📈" },
    { title: "Skill Badges", description: "Unlock badges as you master new skills", icon: "🏅" },
    { title: "Join Open Sessions", description: "Find and join group sessions with other players", icon: "👥" },
    { title: "Progress Reports", description: "Get detailed feedback from your coach", icon: "📋" },
    { title: "Leaderboards", description: "Compete with other players in your academy", icon: "🏆" },
    { title: "Credit Balance", description: "Track your lesson credits and packages", icon: "💳" },
    { title: "Quick Rebook", description: "Rebook your favorite lesson with one tap", icon: "🔄" },
    { title: "Social Feed", description: "See what your tennis friends are up to", icon: "📱" },
    { title: "Achievement Unlocks", description: "Celebrate milestones with special rewards", icon: "🎉" },
  ],
  academy_owner: [
    { title: "Revenue Dashboard", description: "Track real-time revenue across all courts", icon: "💰" },
    { title: "Coach Management", description: "View and manage all your coaches in one place", icon: "👨‍🏫" },
    { title: "Student Growth", description: "Monitor student enrollment trends monthly", icon: "📈" },
    { title: "Court Utilization", description: "See which courts are most popular", icon: "🎾" },
    { title: "Payout Overview", description: "Manage coach payouts and commissions", icon: "💸" },
    { title: "Booking Analytics", description: "Analyze peak hours and optimize pricing", icon: "📊" },
    { title: "Parent Communications", description: "Send announcements to all parents", icon: "📢" },
    { title: "Credit Packages", description: "Create and manage lesson credit packages", icon: "💳" },
    { title: "Holiday Calendar", description: "Set academy-wide holidays and closures", icon: "🗓️" },
    { title: "Performance Reports", description: "Generate detailed performance reports", icon: "📋" },
    { title: "New Enrollments", description: "Track new student sign-ups weekly", icon: "➕" },
    { title: "Retention Metrics", description: "Monitor student retention rates", icon: "🔄" },
    { title: "Court Maintenance", description: "Schedule and track court maintenance", icon: "🔧" },
    { title: "Pricing Rules", description: "Set dynamic pricing for peak hours", icon: "💎" },
    { title: "Staff Schedule", description: "View all staff schedules at once", icon: "📅" },
  ],
  admin: [
    { title: "System Overview", description: "Monitor all academies from one dashboard", icon: "🖥️" },
    { title: "User Management", description: "Manage users across all academies", icon: "👥" },
    { title: "Platform Analytics", description: "View platform-wide statistics", icon: "📊" },
    { title: "Support Tickets", description: "Handle support requests efficiently", icon: "🎫" },
    { title: "Academy Onboarding", description: "Set up new academies quickly", icon: "🏢" },
    { title: "Billing Management", description: "Manage subscriptions and payments", icon: "💳" },
    { title: "Feature Flags", description: "Toggle features for specific academies", icon: "🚩" },
    { title: "Audit Logs", description: "Track all system changes and actions", icon: "📜" },
    { title: "Performance Monitoring", description: "Monitor system health and speed", icon: "⚡" },
    { title: "Data Exports", description: "Export data for reporting and analysis", icon: "📤" },
    { title: "Integration Settings", description: "Configure third-party integrations", icon: "🔌" },
    { title: "Notification Center", description: "Send platform-wide announcements", icon: "📢" },
    { title: "Role Permissions", description: "Configure user roles and access", icon: "🔐" },
    { title: "Maintenance Mode", description: "Toggle maintenance mode when needed", icon: "🔧" },
    { title: "Database Health", description: "Monitor database performance", icon: "💾" },
  ],
  platform: [
    { title: "Global Dashboard", description: "See all platform metrics at a glance", icon: "🌍" },
    { title: "Academy Network", description: "Manage your network of academies", icon: "🏢" },
    { title: "Revenue Insights", description: "Track revenue across all academies", icon: "💰" },
    { title: "Growth Metrics", description: "Monitor platform growth trends", icon: "📈" },
    { title: "Partner Management", description: "Manage academy partnerships", icon: "🤝" },
    { title: "Global Settings", description: "Configure platform-wide settings", icon: "⚙️" },
    { title: "Feature Rollouts", description: "Control feature availability", icon: "🚀" },
    { title: "Support Overview", description: "Monitor support across academies", icon: "🎧" },
    { title: "Compliance Center", description: "Ensure all academies meet standards", icon: "✅" },
    { title: "Marketing Tools", description: "Access marketing and promotion tools", icon: "📣" },
    { title: "API Management", description: "Monitor and manage API usage", icon: "🔗" },
    { title: "White Label Options", description: "Customize branding per academy", icon: "🎨" },
    { title: "Benchmark Reports", description: "Compare academy performance", icon: "📊" },
    { title: "Expansion Planning", description: "Plan new academy launches", icon: "🗺️" },
    { title: "Customer Success", description: "Track academy satisfaction scores", icon: "⭐" },
  ],
};

const MIN_BOOT_TIME = 1800;
const MAX_BOOT_TIME = 4500;

interface BootScreenProps {
  onBootComplete: () => void;
}

export default function BootScreen({ onBootComplete }: BootScreenProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
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
  const tips = TIPS_BY_ROLE[currentRole] || TIPS_BY_ROLE.player;
  const shuffledTips = useRef(
    [...tips].sort(() => Math.random() - 0.5).slice(0, 5)
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
        prefetchPromises.push(
          queryClient.prefetchQuery({
            queryKey: ["/api/coach/calendar"],
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
          <Text style={styles.tagline}>Your Tennis Journey Starts Here</Text>
        </Animated.View>

        <View style={styles.tipContainer}>
          <Animated.View style={[styles.tipCard, { opacity: tipFadeAnim }]}>
            <Text style={styles.tipIcon}>{currentTip?.icon}</Text>
            <Text style={styles.tipTitle}>{currentTip?.title}</Text>
            <Text style={styles.tipDescription}>{currentTip?.description}</Text>
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
            {bootPhase === "ready" ? "Ready!" : "Loading your tennis world..."}
          </Text>
        </View>

        <Text style={styles.roleLabel}>
          {currentRole === "coach" && "Coach Mode"}
          {currentRole === "player" && "Player Mode"}
          {currentRole === "academy_owner" && "Academy Owner"}
          {currentRole === "admin" && "Admin Mode"}
          {currentRole === "platform" && "Platform Mode"}
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
    color: Colors.dark.backgroundRoot,
  },
  appName: {
    fontSize: FontSizes["2xl"],
    fontWeight: "bold",
    color: Colors.dark.text,
    marginTop: Spacing.lg,
  },
  tagline: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.xs,
  },
  tipContainer: {
    height: 140,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  tipCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: Spacing.lg,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  tipIcon: {
    fontSize: 32,
    marginBottom: Spacing.sm,
  },
  tipTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
    textAlign: "center",
  },
  tipDescription: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
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
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.sm,
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
