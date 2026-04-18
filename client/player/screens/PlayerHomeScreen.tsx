import logger from "@/lib/logger";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Modal, Platform, TextInput, Alert, Image as RNImage } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, CardStyles, GlowColors } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import { useAuth } from "@/coach/context/AuthContext";
import { useAppMode } from "@/context/AppModeContext";
import { OwnerCard } from "@/player/components/OwnerCard";
import { PlayerStatusBar } from "@/player/components/PlayerStatusBar";
import { AcademyHubCard } from "@/player/components/AcademyHubCard";
import { ReviewPromptBanner } from "@/player/components/ReviewPromptBanner";
import { QuestTrackerCard } from "@/player/components/QuestTrackerCard";
import { SocialPulseCard } from "@/player/components/SocialPulseCard";
import { usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { usePlayer } from "@/player/context/PlayerContext";
import { BirthdayCelebrationModal, shouldShowBirthdayCelebration } from "@/player/components/BirthdayCelebrationModal";
import { BirthdayConfettiOverlay, BirthdayBanner, BirthdayXPBonusCard } from "@/player/components/BirthdayThemeOverlay";
import { useMissionControl, useAssignDailyQuests, useClaimQuestReward, useQuests } from "@/player/hooks/useQuests";
import { apiRequest, getApiUrl, getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { formatCredits } from "@/lib/dateUtils";
import Animated, { FadeIn, FadeOut, SlideInUp, useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, withRepeat } from "react-native-reanimated";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { useWebSocket } from "@/lib/useWebSocket";
import { GlowMarketSpotlight } from "@/player/components/GlowMarketSpotlight";
import { MatchReadinessCard } from "@/player/components/MatchReadinessCard";
import { SessionHeroCard } from "@/player/components/SessionHeroCard";
import { HeroCarousel } from "@/player/components/HeroCarousel";
import { UpcomingSessionsList } from "@/player/components/UpcomingSessionsList";
import { ChallengeCard } from "@/player/components/ChallengeCard";
import { MiniFeed } from "@/player/components/MiniFeed";
import { TodayAtAGlance } from "@/player/components/TodayAtAGlance";
import LessonRatingModal from "@/player/components/LessonRatingModal";

interface VacationData {
  active: boolean;
  currentVacation: { id: string; startDate: string; endDate: string } | null;
  upcomingVacation: { id: string; startDate: string; endDate: string } | null;
  holidays: Array<{ id: string; startDate: string; endDate: string }>;
}

interface OwnerProfileData {
  profile: {
    ownerName: string;
    academyName: string;
    role: string;
    visionTags: string[];
    publicMessage?: string;
    approved: boolean;
  } | null;
}

interface PendingRequestData {
  id: string;
  status: "pending" | "awaiting_player_reply" | "declined";
  sessionType: string;
  requestedStart: string;
  requestedEnd: string;
  coachName: string | null;
  expiresAt: string | null;
  counterProposedStart: string | null;
  counterProposedEnd: string | null;
  responseNote: string | null;
  declineReason: string | null;
}

interface DashboardData {
  pendingRequest?: PendingRequestData | null;
  player: {
    id: string;
    name: string;
    level: number;
    xp: number;
    glowScore: number;
    ballLevel: string | null;
    streak: number;
    dateOfBirth?: string | null;
    profilePhotoUrl?: string | null;
  };
  coach: {
    id: string;
    name: string;
    photoUrl?: string | null;
    yearsExperience?: number;
    philosophyTags?: string[];
    publicQuote?: string | null;
    bioApproved?: boolean;
  } | null;
  academy: {
    id: string;
    name: string;
  } | null;
  nextSession: {
    id: string;
    date: string;
    type: string;
    courtName?: string;
  } | null;
  lastFeedback: {
    message: string;
    date: string;
    coachName: string;
  } | null;
  credits?: {
    total: number;
    group: number;
    private: number;
    semi_private: number;
  };
  recentXpGains: Array<{
    id: string;
    amount: number;
    reason: string;
    date: string;
  }>;
}

interface OwnerAcademyStats {
  isOwnerView: boolean;
  academy: {
    id: string;
    name: string;
  };
  stats: {
    totalPlayers: number;
    activePlayers: number;
    totalCoaches: number;
    sessionsThisMonth: number;
    completedSessions: number;
    avgAttendanceRate: number;
  };
  topPerformers: Array<{
    id: string;
    name: string;
    level: number;
    totalXp: number;
    glowScore: number;
    ballLevel: string;
  }>;
  levelDistribution: {
    beginner: number;
    intermediate: number;
    advanced: number;
  };
  recentActivity: Array<{
    type: string;
    message: string;
    time: string;
  }>;
}

type SessionStatus = "UPCOMING" | "STARTING_SOON" | "LIVE" | "ENDED";

function getSessionStatus(sessionDate: Date): SessionStatus {
  const now = new Date();
  const diff = sessionDate.getTime() - now.getTime();
  const minutesUntil = diff / (1000 * 60);
  
  if (minutesUntil < -60) return "ENDED";
  if (minutesUntil <= 0) return "LIVE";
  if (minutesUntil <= 60) return "STARTING_SOON";
  return "UPCOMING";
}

function getStatusColor(status: SessionStatus): string {
  switch (status) {
    case "LIVE": return Colors.dark.error;
    case "STARTING_SOON": return Colors.dark.orange;
    case "UPCOMING": return Colors.dark.primary;
    case "ENDED": return Colors.dark.textMuted;
  }
}

function getStatusLabel(status: SessionStatus): string {
  switch (status) {
    case "LIVE": return "LIVE NOW";
    case "STARTING_SOON": return "STARTING SOON";
    case "UPCOMING": return "UPCOMING";
    case "ENDED": return "ENDED";
  }
}

type StreakLevel = { name: string; label: string; color: string; progress: number; icon: string };

function getStreakLevel(streak: number): StreakLevel {
  if (streak >= 6) return { name: "INFERNO", label: "ON FIRE", color: "#FF4136", progress: 1.0, icon: "flame" };
  if (streak >= 3) return { name: "SURGE", label: "RISING", color: Colors.dark.orange, progress: 0.65, icon: "flash" };
  return { name: "SPARK", label: "WARMING UP", color: Colors.dark.xpCyan, progress: 0.3, icon: "flash-outline" };
}

function calculatePlayerAge(dateOfBirth: string | null | undefined): number {
  if (!dateOfBirth) return 18;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

const ADULT_CANCEL_REASONS = [
  { id: "sick", label: "Feeling unwell", icon: "medkit" },
  { id: "schedule_conflict", label: "Schedule conflict", icon: "calendar" },
  { id: "work_trip", label: "Work trip", icon: "briefcase" },
  { id: "other", label: "Other (required explanation)", icon: "create" },
];

const MINOR_CANCEL_REASONS = [
  { id: "sick", label: "Feeling unwell", icon: "medkit" },
  { id: "school_trip", label: "School trip", icon: "bus" },
  { id: "birthday_party", label: "Birthday party", icon: "gift" },
  { id: "family_event", label: "Family event", icon: "people" },
  { id: "other", label: "Other (required explanation)", icon: "create" },
];

const ADULT_GROUP_REASONS = [
  { id: "sick", label: "Feeling unwell", icon: "medkit" },
  { id: "schedule_conflict", label: "Schedule conflict", icon: "calendar" },
  { id: "work_trip", label: "Work trip", icon: "briefcase" },
  { id: "other", label: "Other (required explanation)", icon: "create" },
];

const MINOR_GROUP_REASONS = [
  { id: "sick", label: "Feeling unwell", icon: "medkit" },
  { id: "school_trip", label: "School trip", icon: "bus" },
  { id: "birthday_party", label: "Birthday party", icon: "gift" },
  { id: "family_event", label: "Family event", icon: "people" },
  { id: "other", label: "Other (required explanation)", icon: "create" },
];

function CircularGauge({ 
  progress, 
  size = 80, 
  strokeWidth = 6,
  color,
  glowColor,
  children 
}: { 
  progress: number; 
  size?: number; 
  strokeWidth?: number;
  color: string;
  glowColor?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(1, Math.max(0, progress)));
  
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={Colors.dark.backgroundSecondary}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

function GameCountdown({ targetDate }: { targetDate: Date }) {
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
  
  const status = getSessionStatus(targetDate);
  const statusColor = getStatusColor(status);
  
  if (status === "LIVE") {
    return (
      <View style={gameStyles.liveContainer}>
        <View style={[gameStyles.liveDot, { backgroundColor: Colors.dark.error }]} />
        <Text style={gameStyles.liveText}>LIVE</Text>
      </View>
    );
  }
  
  const formatNum = (n: number) => n.toString().padStart(2, "0");
  
  return (
    <View style={gameStyles.countdownContainer}>
      <View style={gameStyles.countdownBlock}>
        <Text style={[gameStyles.countdownNumber, { color: statusColor }]}>{formatNum(timeLeft.hours)}</Text>
        <Text style={gameStyles.countdownLabel}>HRS</Text>
      </View>
      <Text style={[gameStyles.countdownSeparator, { color: statusColor }]}>:</Text>
      <View style={gameStyles.countdownBlock}>
        <Text style={[gameStyles.countdownNumber, { color: statusColor }]}>{formatNum(timeLeft.minutes)}</Text>
        <Text style={gameStyles.countdownLabel}>MIN</Text>
      </View>
      <Text style={[gameStyles.countdownSeparator, { color: statusColor }]}>:</Text>
      <View style={gameStyles.countdownBlock}>
        <Text style={[gameStyles.countdownNumber, { color: statusColor }]}>{formatNum(timeLeft.seconds)}</Text>
        <Text style={gameStyles.countdownLabel}>SEC</Text>
      </View>
    </View>
  );
}

interface MissionCardProps {
  session: { id: string; date: string; type: string; courtName?: string; duration?: number; time?: string };
  coach: { name: string } | null;
  isVacationActive: boolean;
  upcomingOverlapsSession: boolean;
  onCancel: () => void;
  onLate: () => void;
  onReportIssue: () => void;
}

function MissionCountdownRing({ targetDate, sessionDuration = 60, size = 140, onSessionEnded }: { targetDate: Date; sessionDuration?: number; size?: number; onSessionEnded?: () => void }) {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [timeRemaining, setTimeRemaining] = useState({ minutes: 0, seconds: 0 });
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const hasCalledOnEnded = useRef(false);

  // Reset the fired flag whenever the target session changes (stable timestamp primitive)
  const targetTimestamp = targetDate.getTime();
  useEffect(() => {
    hasCalledOnEnded.current = false;
  }, [targetTimestamp]);
  
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const sessionStart = targetDate.getTime();
      const sessionEnd = sessionStart + (sessionDuration * 60 * 1000);
      
      if (now.getTime() >= sessionEnd) {
        setIsSessionEnded(true);
        setTimeRemaining({ minutes: 0, seconds: 0 });
        if (!hasCalledOnEnded.current) {
          hasCalledOnEnded.current = true;
          onSessionEnded?.();
        }
      } else if (now.getTime() >= sessionStart && now.getTime() < sessionEnd) {
        setIsSessionEnded(false);
        const remaining = Math.max(0, sessionEnd - now.getTime());
        const mins = Math.floor(remaining / (1000 * 60));
        const secs = Math.floor((remaining % (1000 * 60)) / 1000);
        setTimeRemaining({ minutes: mins, seconds: secs });
      } else {
        setIsSessionEnded(false);
      }
      
      const diff = Math.max(0, targetDate.getTime() - now.getTime());
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft({ hours, minutes, seconds });
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [targetDate, sessionDuration]);
  
  const status = getSessionStatus(targetDate);
  const statusColor = getStatusColor(status);
  const formatNum = (n: number) => n.toString().padStart(2, "0");
  
  const hoursProgress = Math.min(1, timeLeft.hours / 24);
  const minutesProgress = timeLeft.minutes / 60;
  const secondsProgress = timeLeft.seconds / 60;
  
  const outerRadius = (size - 8) / 2;
  const middleRadius = (size - 24) / 2;
  const innerRadius = (size - 40) / 2;
  
  if (status === "LIVE" && !isSessionEnded) {
    const totalSessionSeconds = sessionDuration * 60;
    const remainingSeconds = (timeRemaining.minutes * 60) + timeRemaining.seconds;
    const progress = totalSessionSeconds > 0 ? remainingSeconds / totalSessionSeconds : 0;
    
    return (
      <View style={[missionStyles.countdownRing, { width: size, height: size }]}>
        <Svg width={size} height={size} style={{ position: "absolute" }}>
          <Circle cx={size/2} cy={size/2} r={outerRadius} stroke={Colors.dark.backgroundSecondary} strokeWidth={4} fill="transparent" />
          <Circle 
            cx={size/2} cy={size/2} r={outerRadius} 
            stroke={Colors.dark.error} strokeWidth={4} fill="transparent"
            strokeDasharray={2 * Math.PI * outerRadius}
            strokeDashoffset={2 * Math.PI * outerRadius * (1 - progress)}
            strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
          />
        </Svg>
        <LinearGradient
          colors={[Colors.dark.error + "30", Colors.dark.error + "10"]}
          style={[missionStyles.liveRingGradient, { width: size - 20, height: size - 20, borderRadius: (size - 20) / 2 }]}
        >
          <Animated.View entering={FadeIn.duration(500)} style={{ alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.dark.error, marginRight: 6 }} />
              <Text style={[missionStyles.liveText, { fontSize: 14 }]}>IN SESSION</Text>
            </View>
            <Text style={[missionStyles.countdownTime, { color: Colors.dark.error, fontSize: 28 }]}>
              {formatNum(timeRemaining.minutes)}:{formatNum(timeRemaining.seconds)}
            </Text>
            <Text style={[missionStyles.liveSubtext, { fontSize: 10, marginTop: 2 }]}>TIME REMAINING</Text>
          </Animated.View>
        </LinearGradient>
      </View>
    );
  }
  
  if (isSessionEnded) {
    return (
      <View style={[missionStyles.countdownRing, { width: size, height: size }]}>
        <Svg width={size} height={size} style={{ position: "absolute" }}>
          <Circle cx={size/2} cy={size/2} r={outerRadius} stroke={Colors.dark.primary + "40"} strokeWidth={4} fill="transparent" />
        </Svg>
        <LinearGradient
          colors={[Colors.dark.primary + "30", Colors.dark.primary + "10"]}
          style={[missionStyles.liveRingGradient, { width: size - 20, height: size - 20, borderRadius: (size - 20) / 2 }]}
        >
          <Animated.View entering={FadeIn.duration(500)} style={{ alignItems: "center" }}>
            <Ionicons name="checkmark-circle" size={32} color={Colors.dark.primary} />
            <Text style={[missionStyles.liveText, { fontSize: 12, color: Colors.dark.primary, marginTop: 4 }]}>SESSION</Text>
            <Text style={[missionStyles.liveText, { fontSize: 12, color: Colors.dark.primary }]}>COMPLETE</Text>
          </Animated.View>
        </LinearGradient>
      </View>
    );
  }
  
  return (
    <View style={[missionStyles.countdownRing, { width: size, height: size }]}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size/2} cy={size/2} r={outerRadius} stroke={Colors.dark.backgroundSecondary} strokeWidth={4} fill="transparent" />
        <Circle 
          cx={size/2} cy={size/2} r={outerRadius} 
          stroke={statusColor + "60"} strokeWidth={4} fill="transparent"
          strokeDasharray={2 * Math.PI * outerRadius}
          strokeDashoffset={2 * Math.PI * outerRadius * (1 - hoursProgress)}
          strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        />
        <Circle cx={size/2} cy={size/2} r={middleRadius} stroke={Colors.dark.backgroundSecondary} strokeWidth={3} fill="transparent" />
        <Circle 
          cx={size/2} cy={size/2} r={middleRadius} 
          stroke={statusColor + "80"} strokeWidth={3} fill="transparent"
          strokeDasharray={2 * Math.PI * middleRadius}
          strokeDashoffset={2 * Math.PI * middleRadius * (1 - minutesProgress)}
          strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        />
        <Circle cx={size/2} cy={size/2} r={innerRadius} stroke={Colors.dark.backgroundSecondary} strokeWidth={2} fill="transparent" />
        <Circle 
          cx={size/2} cy={size/2} r={innerRadius} 
          stroke={statusColor} strokeWidth={2} fill="transparent"
          strokeDasharray={2 * Math.PI * innerRadius}
          strokeDashoffset={2 * Math.PI * innerRadius * (1 - secondsProgress)}
          strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        />
      </Svg>
      <View style={missionStyles.countdownCenter}>
        <Text style={[missionStyles.countdownTime, { color: statusColor }]}>
          {formatNum(timeLeft.hours)}:{formatNum(timeLeft.minutes)}
        </Text>
        <Text style={missionStyles.countdownSeconds}>{formatNum(timeLeft.seconds)}</Text>
      </View>
    </View>
  );
}

const DECLINE_REASON_LABELS: Record<string, string> = {
  schedule_conflict: "Schedule conflict",
  skill_mismatch: "Skill level mismatch",
  court_unavailable: "Court unavailable",
  personal: "Personal reason",
  response_timeout: "Coach didn't respond in time",
};

function useRequestCountdown(expiresAt: string | null | undefined) {
  const [remaining, setRemaining] = useState<number>(0);
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

function formatRequestCountdown(ms: number): string | null {
  if (ms <= 0) return null;
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (h > 0) return `Coach has ${h}h ${m}m to respond`;
  if (m > 0) return `Coach has ${m}m to respond`;
  return "Coach response deadline soon";
}

function PendingRequestCard({ request }: { request: PendingRequestData }) {
  const navigation = useNavigation<any>();
  const remainingMs = useRequestCountdown(request.expiresAt);
  const countdownLabel = request.status === "pending" && !request.counterProposedStart
    ? formatRequestCountdown(remainingMs)
    : null;

  const isCounterProposed = request.status === "pending" && !!request.counterProposedStart;
  const isAwaiting = request.status === "awaiting_player_reply";
  const isDeclined = request.status === "declined";

  const start = new Date(request.requestedStart);
  const dateStr = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeStr = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  let accentColor: string = Colors.dark.orange;
  let iconName: keyof typeof Ionicons.glyphMap = "time-outline";
  let statusLabel = "Pending";
  let statusDetail = `Waiting for coach · ${dateStr} at ${timeStr}`;

  if (isCounterProposed || isAwaiting) {
    accentColor = Colors.dark.xpCyan ?? Colors.dark.primary;
    iconName = "swap-horizontal-outline";
    statusLabel = "Reply needed";
    const altStart = request.counterProposedStart ? new Date(request.counterProposedStart) : null;
    statusDetail = altStart
      ? `Coach suggested ${altStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${altStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Coach suggested a new time";
  } else if (isDeclined) {
    accentColor = Colors.dark.error;
    iconName = "close-circle-outline";
    statusLabel = "Declined";
    const reason = request.declineReason
      ? (DECLINE_REASON_LABELS[request.declineReason] ?? request.declineReason)
      : request.responseNote;
    statusDetail = reason ? `Reason: ${reason}` : "Your lesson request was declined";
  }

  return (
    <Pressable
      style={[pendingReqStyles.card, { borderColor: accentColor + "50" }]}
      onPress={() => navigation.navigate("MyLessonRequests")}
    >
      <View style={pendingReqStyles.iconCol}>
        <Ionicons name={iconName} size={22} color={accentColor} />
      </View>
      <View style={pendingReqStyles.textCol}>
        <View style={pendingReqStyles.topRow}>
          <View style={[pendingReqStyles.badge, { backgroundColor: accentColor + "20" }]}>
            <Text style={[pendingReqStyles.badgeText, { color: accentColor }]}>{statusLabel}</Text>
          </View>
          <Text style={pendingReqStyles.sessionType}>
            {request.sessionType.replace("_", " ").toUpperCase()}
          </Text>
        </View>
        <Text style={pendingReqStyles.detailText} numberOfLines={1}>{statusDetail}</Text>
        {countdownLabel ? (
          <Text style={[pendingReqStyles.coachText, { color: accentColor }]} numberOfLines={1}>{countdownLabel}</Text>
        ) : request.coachName ? (
          <Text style={pendingReqStyles.coachText} numberOfLines={1}>{request.coachName}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

const pendingReqStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#11141A",
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: 12,
  },
  iconCol: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  sessionType: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  detailText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  coachText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
});

const RATING_DISMISSED_KEY = (sessionId: string) => `session_rating_dismissed_${sessionId}`;

function MissionCard({ session, coach, isVacationActive, upcomingOverlapsSession, onCancel, onLate, onReportIssue }: MissionCardProps) {
  const sessionDate = new Date(session.date);
  const status = getSessionStatus(sessionDate);
  const statusColor = getStatusColor(status);
  const shouldHideActions = isVacationActive || upcomingOverlapsSession;
  
  const isGroupSession = session.type === "group";
  const sessionTypeLabel = session.type === "private" ? "PRIVATE" : 
                           session.type === "group" ? "GROUP" : 
                           session.type === "semi" ? "SEMI-PRIVATE" : "TRAINING";
  
  const [showRatingModal, setShowRatingModal] = useState(false);

  const handleSessionEnded = useCallback(async () => {
    try {
      const dismissed = await AsyncStorage.getItem(RATING_DISMISSED_KEY(session.id));
      if (dismissed) return;

      // Cross-device guard: check server first to avoid re-prompting on a second device
      const res = await apiRequest("GET", `/api/player/sessions/${session.id}/my-rating`);
      if (res.ok) {
        const data = await res.json();
        if (data.rating) {
          // Already rated on another device — mark locally so we don't check again
          await AsyncStorage.setItem(RATING_DISMISSED_KEY(session.id), "1");
          return;
        }
      }
      setShowRatingModal(true);
    } catch {
      // silently ignore — fall back to showing modal
      setShowRatingModal(true);
    }
  }, [session.id]);

  const handleRatingClose = useCallback(async () => {
    try {
      await AsyncStorage.setItem(RATING_DISMISSED_KEY(session.id), "1");
    } catch {
      // silently ignore
    }
    setShowRatingModal(false);
  }, [session.id]);

  return (
    <>
    <LessonRatingModal
      visible={showRatingModal}
      sessionId={session.id}
      onClose={handleRatingClose}
    />
    <Animated.View entering={FadeIn.duration(400)} style={missionStyles.card}>
      <LinearGradient
        colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault + "E0"]}
        style={missionStyles.cardGradient}
      >
        <View style={missionStyles.headerRow}>
          <View style={[missionStyles.missionBadge, { borderColor: statusColor }]}>
            <Ionicons name="navigate" size={12} color={statusColor} />
            <Text style={[missionStyles.missionBadgeText, { color: statusColor }]}>NEXT MISSION</Text>
          </View>
          <View style={[missionStyles.statusPill, { backgroundColor: statusColor + "20", borderColor: statusColor }]}>
            {status === "LIVE" ? <View style={[missionStyles.statusDot, { backgroundColor: statusColor }]} /> : null}
            <Text style={[missionStyles.statusText, { color: statusColor }]}>{getStatusLabel(status)}</Text>
          </View>
        </View>
        
        <View style={missionStyles.contentRow}>
          <View style={missionStyles.infoPanel}>
            <View style={missionStyles.typeTag}>
              <Ionicons name="tennisball" size={14} color={Colors.dark.primary} />
              <Text style={missionStyles.typeText}>{sessionTypeLabel}</Text>
            </View>
            {session.courtName ? (
              <View style={missionStyles.detailRow}>
                <Ionicons name="location" size={14} color={Colors.dark.textMuted} />
                <Text style={missionStyles.detailText}>{session.courtName}</Text>
              </View>
            ) : null}
            {coach ? (
              <View style={missionStyles.detailRow}>
                <View style={missionStyles.coachDot} />
                <Text style={missionStyles.detailText}>{coach.name}</Text>
              </View>
            ) : null}
          </View>
          
          <MissionCountdownRing targetDate={sessionDate} sessionDuration={session.duration || 60} size={130} onSessionEnded={handleSessionEnded} />
        </View>
        
        {shouldHideActions ? (
          <View style={missionStyles.lockedActions}>
            <Ionicons name="lock-closed" size={16} color={Colors.dark.textMuted} />
            <Text style={missionStyles.lockedText}>
              {isVacationActive ? "Vacation Mode Active" : "During Vacation"}
            </Text>
          </View>
        ) : (
          <View style={missionStyles.actionRow}>
            <Pressable style={missionStyles.actionToggle} onPress={onCancel}>
              <View style={[missionStyles.actionGlow, { backgroundColor: isGroupSession ? Colors.dark.orange + "15" : Colors.dark.error + "15" }]}>
                <Ionicons name={isGroupSession ? "hand-left" : "close"} size={20} color={isGroupSession ? Colors.dark.orange : Colors.dark.error} />
              </View>
              <Text style={[missionStyles.actionLabel, { color: isGroupSession ? Colors.dark.orange : Colors.dark.error }]}>
                {isGroupSession ? "CAN'T ATTEND" : "CANCEL"}
              </Text>
            </Pressable>
            <View style={missionStyles.actionDivider} />
            <Pressable style={missionStyles.actionToggle} onPress={onLate}>
              <View style={[missionStyles.actionGlow, { backgroundColor: Colors.dark.orange + "15" }]}>
                <Ionicons name="time" size={20} color={Colors.dark.orange} />
              </View>
              <Text style={[missionStyles.actionLabel, { color: Colors.dark.orange }]}>DELAY</Text>
            </Pressable>
            <View style={missionStyles.actionDivider} />
            <Pressable style={missionStyles.actionToggle} onPress={onReportIssue}>
              <View style={[missionStyles.actionGlow, { backgroundColor: Colors.dark.error + "15" }]}>
                <Ionicons name="alert-circle" size={20} color={Colors.dark.error} />
              </View>
              <Text style={[missionStyles.actionLabel, { color: Colors.dark.error }]}>REPORT</Text>
            </Pressable>
          </View>
        )}
        
        <View style={missionStyles.cornerAccent} />
        <View style={missionStyles.cornerAccentBR} />
      </LinearGradient>
    </Animated.View>
    </>
  );
}

const MOTIVATIONAL_MESSAGES = [
  { title: "Your racket is waiting!", subtitle: "Time to hit the court and level up" },
  { title: "Champions train daily!", subtitle: "Book your next session now" },
  { title: "Feeling the itch?", subtitle: "Let's get you on the court" },
  { title: "Ready to improve?", subtitle: "Your next breakthrough awaits" },
  { title: "Miss the court?", subtitle: "Book a lesson and get playing" },
];

function NoMissionCard() {
  const navigation = useNavigation<any>();
  const [messageIndex] = useState(() => Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length));
  const message = MOTIVATIONAL_MESSAGES[messageIndex];
  
  const handleBookLesson = () => {
    navigation.navigate("LessonBooking");
  };
  
  return (
    <View style={missionStyles.noMissionCard}>
      <View style={missionStyles.noMissionRing}>
        <Ionicons name="tennisball" size={48} color={Colors.dark.primary} />
      </View>
      <Text style={missionStyles.noMissionTitle}>{message.title}</Text>
      <Text style={missionStyles.noMissionSubtitle}>{message.subtitle}</Text>
      <Pressable style={missionStyles.bookLessonButton} onPress={handleBookLesson}>
        <Ionicons name="calendar-outline" size={18} color={Colors.dark.buttonText} />
        <Text style={missionStyles.bookLessonText}>Book a Lesson</Text>
      </Pressable>
    </View>
  );
}

function NoSessionCard() {
  return (
    <View style={gameStyles.noSessionCard}>
      <Ionicons name="tennisball-outline" size={40} color={Colors.dark.textMuted} />
      <Text style={gameStyles.noSessionTitle}>No Active Training</Text>
      <Text style={gameStyles.noSessionSubtitle}>Your next session will appear here</Text>
    </View>
  );
}

function MentorCard({ coach, onPress }: { coach: { id: string; name: string; photoUrl?: string | null; yearsExperience?: number }; onPress: () => void }) {
  const coachPhotoUri = buildPhotoUrl(coach.photoUrl) || null;
  
  return (
    <Pressable style={mentorStyles.card} onPress={onPress}>
      {coachPhotoUri ? (
        Platform.OS === 'web' ? (
          <RNImage
            source={{ uri: coachPhotoUri }}
            style={mentorStyles.avatarImage}
            resizeMode="cover"
          />
        ) : (
          <Image
            source={{ uri: coachPhotoUri }}
            style={mentorStyles.avatarImage}
            contentFit="cover"
          />
        )
      ) : (
        <View style={mentorStyles.avatar}>
          <Text style={mentorStyles.avatarText}>{coach.name.charAt(0)}</Text>
        </View>
      )}
      <View style={mentorStyles.info}>
        <Text style={mentorStyles.label}>Your Coach</Text>
        <Text style={mentorStyles.name}>{coach.name}</Text>
      </View>
      <View style={mentorStyles.badge}>
        <Ionicons name="ribbon" size={14} color={Colors.dark.primary} />
        <Text style={mentorStyles.badgeText}>PRO</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function OwnerStatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <View style={ownerStyles.statCard}>
      <View style={[ownerStyles.statIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[ownerStyles.statValue, { color }]}>{value}</Text>
      <Text style={ownerStyles.statLabel}>{label}</Text>
    </View>
  );
}

function TopPerformerCard({ performer, rank }: { performer: OwnerAcademyStats["topPerformers"][0]; rank: number }) {
  const rankColor = rank === 1 ? Colors.dark.gold : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : Colors.dark.textMuted;
  
  return (
    <View style={ownerStyles.performerCard}>
      <View style={ownerStyles.performerRank}>
        <Text style={[ownerStyles.rankNumber, { color: rankColor }]}>{rank}</Text>
      </View>
      <View style={ownerStyles.performerAvatar}>
        <Text style={ownerStyles.performerAvatarText}>{performer.name.charAt(0)}</Text>
      </View>
      <View style={ownerStyles.performerInfo}>
        <Text style={ownerStyles.performerName} numberOfLines={1}>{performer.name}</Text>
        <Text style={ownerStyles.performerLevel}>Lv.{performer.level} - {performer.totalXp.toLocaleString()} XP</Text>
      </View>
      <View style={ownerStyles.performerGlow}>
        <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
        <Text style={ownerStyles.performerGlowText}>{performer.glowScore}</Text>
      </View>
    </View>
  );
}

interface PlayerStatusAvatarProps {
  player: DashboardData["player"];
  coach: DashboardData["coach"];
  academy: DashboardData["academy"];
}

function PlayerStatusAvatar({ player, coach, academy }: PlayerStatusAvatarProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const profilePhotoUri = buildPhotoUrl(player.profilePhotoUrl) || null;
  
  return (
    <>
      <Pressable 
        style={styles.avatarContainer}
        onPress={() => setShowStatusMenu(true)}
      >
        {profilePhotoUri ? (
          Platform.OS === 'web' ? (
            <RNImage
              source={{ uri: profilePhotoUri }}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          ) : (
            <Image
              source={{ uri: profilePhotoUri }}
              style={styles.avatarImage}
              contentFit="cover"
            />
          )
        ) : (
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.xpCyan]}
            style={styles.avatarGradient}
          >
            <View style={styles.avatarInner}>
              <Text style={styles.avatarText}>{player.name.charAt(0)}</Text>
            </View>
          </LinearGradient>
        )}
      </Pressable>
      
      <Modal
        visible={showStatusMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusMenu(false)}
      >
        <Pressable 
          style={statusStyles.overlay}
          onPress={() => setShowStatusMenu(false)}
        >
          <View style={statusStyles.menu}>
            <View style={statusStyles.header}>
              {profilePhotoUri ? (
                Platform.OS === 'web' ? (
                  <RNImage
                    source={{ uri: profilePhotoUri }}
                    style={statusStyles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={{ uri: profilePhotoUri }}
                    style={statusStyles.avatarImage}
                    contentFit="cover"
                  />
                )
              ) : (
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                  style={statusStyles.avatarGradient}
                >
                  <View style={statusStyles.avatarInner}>
                    <Text style={statusStyles.avatarText}>{player.name.charAt(0)}</Text>
                  </View>
                </LinearGradient>
              )}
              <Text style={statusStyles.playerName}>{player.name}</Text>
              {academy ? (
                <Text style={statusStyles.academyName}>{academy.name}</Text>
              ) : null}
            </View>
            
            <View style={statusStyles.statsRow}>
              <View style={statusStyles.statItem}>
                <Ionicons name="star" size={18} color={Colors.dark.gold} />
                <Text style={statusStyles.statValue}>Level {player.level}</Text>
              </View>
              <View style={statusStyles.statItem}>
                <Ionicons name="flash" size={18} color={Colors.dark.xpCyan} />
                <Text style={statusStyles.statValue}>{player.glowScore} Glow</Text>
              </View>
            </View>
            
            <View style={statusStyles.statsRow}>
              <View style={statusStyles.statItem}>
                <Ionicons name="flame" size={18} color={Colors.dark.orange} />
                <Text style={statusStyles.statValue}>{player.streak} day streak</Text>
              </View>
              <View style={statusStyles.statItem}>
                <Ionicons name="trending-up" size={18} color={Colors.dark.primary} />
                <Text style={statusStyles.statValue}>{player.xp.toLocaleString()} XP</Text>
              </View>
            </View>
            
            {player.ballLevel ? (
              <View style={statusStyles.ballLevelRow}>
                <Ionicons name="tennisball" size={18} color={Colors.dark.primary} />
                <Text style={statusStyles.ballLevelText}>{player.ballLevel} Ball</Text>
              </View>
            ) : null}
            
            {coach ? (
              <View style={statusStyles.coachRow}>
                <View style={statusStyles.coachAvatar}>
                  <Ionicons name="ribbon" size={14} color={Colors.dark.primary} />
                </View>
                <View>
                  <Text style={statusStyles.coachLabel}>Coach</Text>
                  <Text style={statusStyles.coachName}>{coach.name}</Text>
                </View>
              </View>
            ) : null}
            
            <Pressable 
              style={statusStyles.closeButton}
              onPress={() => setShowStatusMenu(false)}
            >
              <Text style={statusStyles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function PlayerHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const track = useTrackFeature();
  const { user } = useAuth();
  const { mode } = useAppMode();
  const { openDrawer } = usePlayerDrawer();
  const { navigateToTab } = useTabNavigation();
  const queryClient = useQueryClient();
  
  const isPlayer = user?.role === "player";
  const isOwnerRole = user?.role === "owner" || user?.role === "academy_owner" || user?.role === "platform_owner";
  const canAccessPlayerMode = isPlayer || isOwnerRole;
  
  const hasPlayerProfile = !!user?.playerId;
  const isInPlayerMode = mode === "player";
  
  const showPlayerDashboard = isInPlayerMode && hasPlayerProfile;
  const showOwnerOverview = isOwnerRole && !showPlayerDashboard;

  // WebSocket for real-time updates
  useWebSocket({
    onNewMessage: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/unread-count"] });
    }, [queryClient]),
    onNewSession: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/sessions"] });
    }, [queryClient]),
    onFeedbackReceived: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/notifications"] });
    }, [queryClient]),
    onSessionUpdate: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/sessions"] });
    }, [queryClient]),
    onConnected: useCallback(() => {
      // Refresh dashboard data when WebSocket reconnects
      if (showPlayerDashboard) {
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      }
    }, [queryClient, showPlayerDashboard]),
  });
  
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: canAccessPlayerMode && showPlayerDashboard,
    staleTime: 0, // Always consider data stale so it refetches
    refetchOnWindowFocus: true, // Auto-refresh when app comes to foreground
    refetchOnMount: true, // Refresh when component mounts
  });
  
  const { data: ownerStats, isLoading: ownerLoading, error: ownerError } = useQuery<OwnerAcademyStats>({
    queryKey: ["/api/owner/academy-stats"],
    enabled: showOwnerOverview,
  });
  
  const { data: ownerProfileData } = useQuery<OwnerProfileData>({
    queryKey: ["/api/player/academy-owner"],
    enabled: canAccessPlayerMode && showPlayerDashboard,
  });
  
  // Refresh dashboard data when screen comes into focus (for credit updates)
  useFocusEffect(
    useCallback(() => {
      if (canAccessPlayerMode && showPlayerDashboard) {
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      }
    }, [canAccessPlayerMode, showPlayerDashboard, queryClient])
  );
  
  const { data: vacationData } = useQuery<VacationData>({
    queryKey: ["/api/player/me/vacation"],
    enabled: canAccessPlayerMode && showPlayerDashboard,
  });
  
  // Mission Control hooks (only fetch when player dashboard is active)
  const { data: missionControlData } = useMissionControl(canAccessPlayerMode && showPlayerDashboard);
  const { data: questsData } = useQuests();
  const assignDailyQuests = useAssignDailyQuests();
  const claimQuestReward = useClaimQuestReward();
  
  // Assign daily quests on screen focus if player has profile
  useFocusEffect(
    useCallback(() => {
      if (canAccessPlayerMode && showPlayerDashboard && !assignDailyQuests.isPending) {
        assignDailyQuests.mutate();
      }
    }, [canAccessPlayerMode, showPlayerDashboard])
  );
  
  const [fallbackRatingSessionId, setFallbackRatingSessionId] = useState<string | null>(null);

  // Server-driven fallback: check for any unrated completed sessions on screen focus
  useFocusEffect(
    useCallback(() => {
      if (!canAccessPlayerMode || !showPlayerDashboard) return;
      (async () => {
        try {
          const res = await apiRequest("GET", "/api/player/sessions/pending-rating");
          if (!res.ok) return;
          const { sessionId } = await res.json();
          if (!sessionId) return;
          const dismissed = await AsyncStorage.getItem(RATING_DISMISSED_KEY(sessionId));
          if (!dismissed) {
            setFallbackRatingSessionId(sessionId);
          }
        } catch {
          // silently ignore
        }
      })();
    }, [canAccessPlayerMode, showPlayerDashboard])
  );

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showLateModal, setShowLateModal] = useState(false);
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState("");
  const [lateMinutes, setLateMinutes] = useState(10);
  const [lateMessage, setLateMessage] = useState("");
  const [vacationStartDate, setVacationStartDate] = useState("");
  const [vacationEndDate, setVacationEndDate] = useState("");
  const [reportIssueType, setReportIssueType] = useState<string | null>(null);
  const [reportIssueText, setReportIssueText] = useState("");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);
  
  const { isBirthday } = usePlayer();
  
  useEffect(() => {
    logger.log("[Birthday] isBirthday:", isBirthday, "showPlayerDashboard:", showPlayerDashboard);
    if (isBirthday && showPlayerDashboard) {
      shouldShowBirthdayCelebration(isBirthday).then((shouldShow) => {
        logger.log("[Birthday] shouldShow:", shouldShow); if (shouldShow) {
          setShowBirthdayModal(true);
        }
      });
    }
  }, [isBirthday, showPlayerDashboard]);
  
  const playerAge = calculatePlayerAge(data?.player?.dateOfBirth);
  const isMinorPlayer = playerAge <= 17;
  
  const cancelSessionMutation = useMutation({
    mutationFn: async ({ sessionId, reason, reasonText, sessionType }: { sessionId: string; reason: string; reasonText?: string; sessionType: string }) => {
      const endpoint = sessionType === "group" 
        ? `/api/player/me/sessions/${sessionId}/mark-unavailable`
        : `/api/player/me/sessions/${sessionId}/cancel`;
      return apiRequest("POST", endpoint, { reason, reasonText });
    },
    onSuccess: (response: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/sessions"] });
      setShowCancelModal(false);
      setCancelReason(null);
      setCancelReasonText("");
      
      if (variables.sessionType === "group") {
        setActionSuccess("Marked as unavailable. Your coach has been notified.");
      } else {
        setActionSuccess(response.isLateCancellation 
          ? "Session cancelled. This counts as a late cancellation."
          : "Session cancelled successfully.");
      }
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to process request");
    },
  });
  
  const notifyLateMutation = useMutation({
    mutationFn: async ({ sessionId, minutes, message }: { sessionId: string; minutes: number; message: string }) => {
      return apiRequest("POST", `/api/player/me/sessions/${sessionId}/late`, { minutes, message });
    },
    onSuccess: () => {
      setShowLateModal(false);
      setLateMinutes(10);
      setLateMessage("");
      setActionSuccess("Coach has been notified that you're running late.");
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to notify coach");
    },
  });
  
  const setVacationMutation = useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: string; endDate: string }) => {
      return apiRequest("POST", "/api/player/me/vacation", { startDate, endDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/vacation"] });
      setShowVacationModal(false);
      setVacationStartDate("");
      setVacationEndDate("");
      setActionSuccess("Vacation set! Enjoy your break.");
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to set vacation");
    },
  });
  
  const cancelVacationMutation = useMutation({
    mutationFn: async (vacationId: string) => {
      return apiRequest("DELETE", `/api/player/me/vacation/${vacationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/vacation"] });
      setActionSuccess("Vacation cancelled. Welcome back!");
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to cancel vacation");
    },
  });
  
  const reportIssueMutation = useMutation({
    mutationFn: async ({ sessionId, issueType, description }: { sessionId: string; issueType: string; description: string }) => {
      return apiRequest("POST", `/api/player/me/sessions/${sessionId}/report-issue`, { issueType, description });
    },
    onSuccess: () => {
      setShowReportModal(false);
      setReportIssueType(null);
      setReportIssueText("");
      setActionSuccess("Issue reported. Your coach will be notified.");
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to report issue");
    },
  });
  
  const formatVacationDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  
  const getVacationDaysRemaining = () => {
    if (!vacationData?.currentVacation) return 0;
    const end = new Date(vacationData.currentVacation.endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  if (!canAccessPlayerMode) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <CollapsibleModeSwitcher />
        <Ionicons name="tennisball" size={48} color={Colors.dark.xpCyan} />
        <Text style={styles.errorText}>Player Mode</Text>
        <Text style={styles.errorSubtext}>Sign in with a player or owner account to view this dashboard</Text>
      </View>
    );
  }

  if (showOwnerOverview && ownerLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
        <Text style={styles.loadingText}>Loading academy overview...</Text>
      </View>
    );
  }

  if (showOwnerOverview && ownerError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <CollapsibleModeSwitcher />
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Unable to load academy stats</Text>
        <Text style={styles.errorSubtext}>Please try again later</Text>
      </View>
    );
  }

  if (showOwnerOverview && ownerStats) {
    const { stats, topPerformers, levelDistribution, recentActivity, academy } = ownerStats;
    const totalDistribution = levelDistribution.beginner + levelDistribution.intermediate + levelDistribution.advanced;
    
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <CollapsibleModeSwitcher />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={ownerStyles.header}>
            <View style={ownerStyles.ownerBadge}>
              <Ionicons name="business" size={14} color={Colors.dark.gold} />
              <Text style={ownerStyles.ownerBadgeText}>Academy Overview</Text>
            </View>
            <View style={ownerStyles.headerTop}>
              <View>
                <Text style={ownerStyles.greeting}>Welcome, Owner</Text>
                <Text style={ownerStyles.academyName}>{academy.name}</Text>
              </View>
              <View style={ownerStyles.avatarContainer}>
                <LinearGradient
                  colors={[Colors.dark.gold, Colors.dark.orange]}
                  style={ownerStyles.avatarGradient}
                >
                  <View style={ownerStyles.avatarInner}>
                    <Ionicons name="school" size={24} color={Colors.dark.gold} />
                  </View>
                </LinearGradient>
              </View>
            </View>
          </View>

          <View style={ownerStyles.statsGrid}>
            <OwnerStatCard 
              label="Players" 
              value={stats.totalPlayers} 
              icon="people" 
              color={Colors.dark.xpCyan} 
            />
            <OwnerStatCard 
              label="Coaches" 
              value={stats.totalCoaches} 
              icon="person" 
              color={Colors.dark.primary} 
            />
            <OwnerStatCard 
              label="Sessions" 
              value={stats.sessionsThisMonth} 
              icon="calendar" 
              color={Colors.dark.orange} 
            />
            <OwnerStatCard 
              label="Attendance" 
              value={`${stats.avgAttendanceRate}%`} 
              icon="checkmark-circle" 
              color={Colors.dark.successNeon} 
            />
          </View>

          <View style={ownerStyles.section}>
            <View style={ownerStyles.sectionHeader}>
              <Ionicons name="trophy" size={18} color={Colors.dark.gold} />
              <Text style={ownerStyles.sectionTitle}>Top Performers</Text>
            </View>
            <View style={ownerStyles.performersCard}>
              {topPerformers.map((performer, index) => (
                <TopPerformerCard key={performer.id} performer={performer} rank={index + 1} />
              ))}
            </View>
          </View>

          <View style={ownerStyles.section}>
            <View style={ownerStyles.sectionHeader}>
              <Ionicons name="bar-chart" size={18} color={Colors.dark.xpCyan} />
              <Text style={ownerStyles.sectionTitle}>Level Distribution</Text>
            </View>
            <View style={ownerStyles.distributionCard}>
              <View style={ownerStyles.distributionRow}>
                <Text style={ownerStyles.distributionLabel}>Beginner (Lv.1-3)</Text>
                <View style={ownerStyles.distributionBar}>
                  <View style={[ownerStyles.distributionFill, { width: `${(levelDistribution.beginner / totalDistribution) * 100}%`, backgroundColor: Colors.dark.primary }]} />
                </View>
                <Text style={ownerStyles.distributionValue}>{levelDistribution.beginner}</Text>
              </View>
              <View style={ownerStyles.distributionRow}>
                <Text style={ownerStyles.distributionLabel}>Intermediate (Lv.4-7)</Text>
                <View style={ownerStyles.distributionBar}>
                  <View style={[ownerStyles.distributionFill, { width: `${(levelDistribution.intermediate / totalDistribution) * 100}%`, backgroundColor: Colors.dark.xpCyan }]} />
                </View>
                <Text style={ownerStyles.distributionValue}>{levelDistribution.intermediate}</Text>
              </View>
              <View style={ownerStyles.distributionRow}>
                <Text style={ownerStyles.distributionLabel}>Advanced (Lv.8+)</Text>
                <View style={ownerStyles.distributionBar}>
                  <View style={[ownerStyles.distributionFill, { width: `${(levelDistribution.advanced / totalDistribution) * 100}%`, backgroundColor: Colors.dark.gold }]} />
                </View>
                <Text style={ownerStyles.distributionValue}>{levelDistribution.advanced}</Text>
              </View>
            </View>
          </View>

          <View style={ownerStyles.section}>
            <View style={ownerStyles.sectionHeader}>
              <Ionicons name="time" size={18} color={Colors.dark.textMuted} />
              <Text style={ownerStyles.sectionTitle}>Recent Activity</Text>
            </View>
            <View style={ownerStyles.activityCard}>
              {recentActivity.map((activity, index) => (
                <View key={index} style={ownerStyles.activityRow}>
                  <Ionicons 
                    name={activity.type === "session" ? "calendar" : activity.type === "xp" ? "trending-up" : "checkmark-circle"} 
                    size={16} 
                    color={Colors.dark.xpCyan} 
                  />
                  <View style={ownerStyles.activityInfo}>
                    <Text style={ownerStyles.activityMessage}>{activity.message}</Text>
                    <Text style={ownerStyles.activityTime}>{activity.time}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  if (error || !data || !data.player) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <CollapsibleModeSwitcher />
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>No player profile found</Text>
        <Text style={styles.errorSubtext}>Please set up your player profile or switch to another mode</Text>
      </View>
    );
  }

  const { player, coach, academy, nextSession, lastFeedback, pendingRequest } = data;

  const isVacationActive = vacationData?.active || false;
  const upcomingVacation = vacationData?.upcomingVacation;
  const sessionDate = nextSession?.date ? new Date(nextSession.date) : null;
  const upcomingOverlapsSession = !!(upcomingVacation && sessionDate && 
    new Date(upcomingVacation.startDate) <= sessionDate && 
    new Date(upcomingVacation.endDate) >= sessionDate);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Fallback: show rating modal for any unrated completed session found on focus */}
      {fallbackRatingSessionId ? (
        <LessonRatingModal
          visible={!!fallbackRatingSessionId}
          sessionId={fallbackRatingSessionId}
          onClose={async () => {
            try { await AsyncStorage.setItem(RATING_DISMISSED_KEY(fallbackRatingSessionId), "1"); } catch {}
            setFallbackRatingSessionId(null);
          }}
          onSubmitted={() => setFallbackRatingSessionId(null)}
        />
      ) : null}

      <CollapsibleModeSwitcher />
      
      {actionSuccess ? (
        <Animated.View 
          entering={SlideInUp.duration(300)} 
          exiting={FadeOut.duration(200)}
          style={styles.successBanner}
        >
          <Ionicons name="checkmark-circle" size={18} color={Colors.dark.buttonText} />
          <Text style={styles.successBannerText}>{actionSuccess}</Text>
        </Animated.View>
      ) : null}
      
      {/* Birthday Confetti Overlay - Covers entire screen when it's player's birthday */}
      {isBirthday && <BirthdayConfettiOverlay />}
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
        showsVerticalScrollIndicator={false}
      >
        
        {/* Birthday Banner - Shows festive header on birthday */}
        {isBirthday && (
          <BirthdayBanner 
            playerName={player.name || "Champion"} 
            playerAge={playerAge}
          />
        )}
        
        {/* A) Player Profile Bar - Always first at top */}
        <PlayerStatusBar 
          player={player}
          coach={coach}
          lastFeedback={lastFeedback}
          onAvatarPress={openDrawer}
        />

        {/* Pending booking request status card */}
        {pendingRequest ? (
          <PendingRequestCard request={pendingRequest} />
        ) : null}
        
        {/* Birthday XP Bonus Card - Shows 2x XP message on birthday */}
        {isBirthday && <BirthdayXPBonusCard />}

        {/* B) HERO: Next Mission Card */}
        {nextSession ? (
          <MissionCard
            session={nextSession}
            coach={coach}
            isVacationActive={isVacationActive}
            upcomingOverlapsSession={upcomingOverlapsSession}
            onCancel={() => setShowCancelModal(true)}
            onLate={() => setShowLateModal(true)}
            onReportIssue={() => setShowReportModal(true)}
          />
        ) : (
          <NoMissionCard />
        )}

        {/* B) Progress Snapshot - Level & XP Progress */}
        <View style={styles.progressSnapshot}>
          <View style={styles.progressSnapshotHeader}>
            <Ionicons name="trending-up" size={18} color={Colors.dark.primary} />
            <Text style={styles.progressSnapshotTitle}>Progress</Text>
          </View>
          <View style={styles.progressSnapshotContent}>
            <View style={styles.levelRingContainer}>
              <CircularGauge 
                progress={(player.xp % 500) / 500} 
                size={70} 
                strokeWidth={5}
                color={Colors.dark.primary}
              >
                <Text style={styles.levelNumber}>{player.level}</Text>
                <Text style={styles.levelLabel}>LVL</Text>
              </CircularGauge>
            </View>
            <View style={styles.progressStats}>
              <View style={styles.progressStatRow}>
                <View style={styles.progressStatItem}>
                  <Ionicons name="flash" size={16} color={Colors.dark.xpCyan} />
                  <Text style={styles.progressStatValue}>{player.xp} XP</Text>
                </View>
                <View style={styles.progressStatItem}>
                  <Ionicons name="flame" size={16} color={Colors.dark.orange} />
                  <Text style={styles.progressStatValue}>{player.streak} Streak</Text>
                </View>
              </View>
              <View style={styles.xpToNextLevel}>
                <Text style={styles.xpToNextLevelText}>
                  {500 - (player.xp % 500)} XP to level {player.level + 1}
                </Text>
                <View style={styles.xpProgressBar}>
                  <View style={[styles.xpProgressFill, { width: `${((player.xp % 500) / 500) * 100}%` }]} />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Match Readiness Card - shows when tournament match is within 24h */}
        {player?.id ? <MatchReadinessCard playerId={player.id} /> : null}

        {/* Lessons, Match, Social Feed, Today cards - always visible with collapsed pill when no data */}
        <HeroCarousel />
        <UpcomingSessionsList />
        <ChallengeCard />
        <MiniFeed />
        <TodayAtAGlance />

        {/* C) Daily Quests - Always show with empty state */}
        <QuestTrackerCard 
          quests={missionControlData?.quests?.today || []}
          completedCount={missionControlData?.quests?.completedCount || 0}
          totalCount={missionControlData?.quests?.totalCount || 0}
          streak={questsData?.streak?.currentStreak || 0}
          streakMultiplier={questsData?.streak?.multiplier || 1}
          onClaimReward={(quest) => claimQuestReward.mutate(quest.id)}
          onViewAll={() => {
            track("home:quest_tracker");
            navigateToTab("Growth", { screen: "QuestsMain" });
          }}
        />

        {/* E) Social Highlights - Always show */}
        <SocialPulseCard 
          newMoments={missionControlData?.social?.newMoments || 0}
          openToPlay={missionControlData?.social?.openToPlay || 0}
          onMomentsPress={() => navigation.navigate("CommunityTab")}
        />

        {/* Vacation Badge - contextual notification */}
        {vacationData?.active && vacationData.currentVacation ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.vacationBadge}>
            <LinearGradient
              colors={[Colors.dark.xpCyan + "30", Colors.dark.primary + "20"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.vacationBadgeGradient}
            >
              <View style={styles.vacationBadgeContent}>
                <View style={styles.vacationBadgeLeft}>
                  <Ionicons name="airplane" size={18} color={Colors.dark.xpCyan} />
                  <View>
                    <Text style={styles.vacationBadgeTitle}>Vacation Mode</Text>
                    <Text style={styles.vacationBadgeSubtitle}>
                      {getVacationDaysRemaining()} days remaining
                    </Text>
                  </View>
                </View>
                <Pressable 
                  style={styles.vacationEndButton}
                  onPress={() => {
                    Alert.alert(
                      "End Vacation Early?",
                      "You'll be available for sessions again. This cannot be undone.",
                      [
                        { text: "Stay on Vacation", style: "cancel" },
                        { 
                          text: "End Vacation", 
                          style: "destructive",
                          onPress: () => cancelVacationMutation.mutate(vacationData.currentVacation!.id)
                        }
                      ]
                    );
                  }}
                >
                  <Text style={styles.vacationEndButtonText}>End Early</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </Animated.View>
        ) : null}

        {/* Smart Alert: Low Credits Warning */}
        {data?.credits && data.credits.total <= 3 && data.credits.total > 0 ? (
          <Pressable 
            style={styles.smartAlert}
            onPress={() => {
              if (data?.player?.id) {
                navigation.navigate("ParentCreditStore", { playerId: data.player.id });
              }
            }}
          >
            <View style={styles.smartAlertIcon}>
              <Ionicons name="warning" size={20} color={Colors.dark.orange} />
            </View>
            <View style={styles.smartAlertContent}>
              <Text style={styles.smartAlertTitle}>Credits Running Low</Text>
              <Text style={styles.smartAlertSubtitle}>Only {formatCredits(data.credits.total)} credits left - top up to keep training!</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.orange} />
          </Pressable>
        ) : null}

        <ReviewPromptBanner />
        
        {!vacationData?.active && !vacationData?.upcomingVacation ? (
          <Pressable 
            style={styles.vacationModeCard}
            onPress={() => setShowVacationModal(true)}
          >
            <View style={styles.vacationModeContent}>
              <View style={styles.vacationModeIcon}>
                <Ionicons name="airplane" size={24} color={Colors.dark.xpCyan} />
              </View>
              <View style={styles.vacationModeText}>
                <Text style={styles.vacationModeTitle}>Going on vacation?</Text>
                <Text style={styles.vacationModeSubtitle}>Set your dates and we'll pause lessons</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>
        ) : null}
        
        {vacationData?.upcomingVacation && !vacationData.active ? (
          <View style={styles.upcomingVacationCard}>
            <View style={styles.upcomingVacationContent}>
              <Ionicons name="calendar" size={20} color={Colors.dark.xpCyan} />
              <View style={styles.upcomingVacationText}>
                <Text style={styles.upcomingVacationTitle}>Vacation Planned</Text>
                <Text style={styles.upcomingVacationDates}>
                  {formatVacationDate(vacationData.upcomingVacation.startDate)} - {formatVacationDate(vacationData.upcomingVacation.endDate)}
                </Text>
              </View>
              <Pressable 
                style={styles.upcomingVacationCancel}
                onPress={() => cancelVacationMutation.mutate(vacationData.upcomingVacation!.id)}
              >
                <Ionicons name="close" size={18} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
          </View>
        ) : null}
        
        {lastFeedback ? (
          <Pressable 
            style={styles.feedbackCard}
            onPress={() => navigateToTab("Growth")}
          >
            <View style={styles.feedbackHeader}>
              <Ionicons name="chatbubble" size={20} color={GlowColors.primary} />
              <Text style={styles.feedbackTitle}>Coach Feedback</Text>
            </View>
            <Text style={styles.feedbackMessage}>"{lastFeedback.message}"</Text>
            <View style={styles.feedbackFooter}>
              <Text style={styles.feedbackCoach}>- {lastFeedback.coachName}</Text>
              <View style={styles.viewProgressCta}>
                <Text style={styles.viewProgressText}>View Progress</Text>
                <Ionicons name="arrow-forward" size={14} color={Colors.dark.primary} />
              </View>
            </View>
          </Pressable>
        ) : null}

        {!academy ? (
          <AcademyHubCard 
            hasAcademy={false} 
            onBrowsePress={() => navigation.navigate("AcademyBrowser")}
          />
        ) : null}

        {academy ? (
          <View style={styles.academyContextRow}>
            <Ionicons name="location" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.academyContextText}>Training at {academy.name}</Text>
          </View>
        ) : null}

        <GlowMarketSpotlight />

        <Pressable 
          style={styles.courtBookingCard}
          onPress={() => navigation.navigate("QuickBook")}
        >
          <LinearGradient
            colors={[Colors.dark.xpCyan + "15", Colors.dark.backgroundSecondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.courtBookingGradient}
          >
            <View style={styles.courtBookingIcon}>
              <Ionicons name="flash" size={24} color={Colors.dark.xpCyan} />
            </View>
            <View style={styles.courtBookingContent}>
              <Text style={styles.courtBookingTitle}>Quick Book</Text>
              <Text style={styles.courtBookingSubtitle}>3-tap booking - Book in seconds</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.xpCyan} />
          </LinearGradient>
        </Pressable>

        {coach ? (
          <MentorCard 
            coach={coach} 
            onPress={() => navigation.navigate("CoachProfile", { coachId: coach.id })}
          />
        ) : null}
      </ScrollView>
      
      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCancelModal(false)} />
          <View style={styles.modalContent}>
            {nextSession?.type === "group" ? (
              <>
                <View style={styles.modalHeader}>
                  <Ionicons name="hand-left" size={28} color={Colors.dark.orange} />
                  <Text style={styles.modalTitle}>Mark as Unavailable</Text>
                </View>
                
                <View style={[styles.cancelNotice, { marginBottom: Spacing.md, backgroundColor: Colors.dark.orange + "15" }]}>
                  <Ionicons name="information-circle" size={16} color={Colors.dark.orange} />
                  <Text style={styles.cancelNoticeText}>
                    This group session will still be counted. Please let us know the reason for your absence.
                  </Text>
                </View>
                
                <View style={styles.cancelReasonsList}>
                  {(isMinorPlayer ? MINOR_GROUP_REASONS : ADULT_GROUP_REASONS).map((reason) => (
                    <Pressable
                      key={reason.id}
                      style={[
                        styles.cancelReasonItem,
                        cancelReason === reason.id && styles.cancelReasonItemSelected,
                      ]}
                      onPress={() => setCancelReason(reason.id)}
                    >
                      <Ionicons 
                        name={reason.icon as any} 
                        size={20} 
                        color={cancelReason === reason.id ? Colors.dark.xpCyan : Colors.dark.textMuted} 
                      />
                      <Text style={[
                        styles.cancelReasonText,
                        cancelReason === reason.id && styles.cancelReasonTextSelected,
                      ]}>{reason.label}</Text>
                      {cancelReason === reason.id ? (
                        <Ionicons name="checkmark-circle" size={20} color={Colors.dark.xpCyan} />
                      ) : null}
                    </Pressable>
                  ))}
                </View>
                
                {cancelReason === "other" ? (
                  <TextInput
                    style={styles.lateMessageInput}
                    placeholder="Please explain why you can't attend (required)"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={cancelReasonText}
                    onChangeText={setCancelReasonText}
                    multiline
                    maxLength={200}
                  />
                ) : null}
                
                <View style={styles.modalActions}>
                  <Pressable 
                    style={styles.modalCancelButton}
                    onPress={() => { setShowCancelModal(false); setCancelReason(null); setCancelReasonText(""); }}
                  >
                    <Text style={styles.modalCancelButtonText}>Never Mind</Text>
                  </Pressable>
                  <Pressable 
                    style={[
                      styles.modalConfirmButton,
                      { backgroundColor: Colors.dark.orange },
                      (!cancelReason || (cancelReason === "other" && !cancelReasonText.trim())) && styles.modalConfirmButtonDisabled,
                    ]}
                    onPress={() => {
                      if (cancelReason && nextSession && (cancelReason !== "other" || cancelReasonText.trim())) {
                        cancelSessionMutation.mutate({ 
                          sessionId: nextSession.id, 
                          reason: cancelReason, 
                          reasonText: cancelReasonText,
                          sessionType: "group" 
                        });
                      }
                    }}
                    disabled={!cancelReason || (cancelReason === "other" && !cancelReasonText.trim()) || cancelSessionMutation.isPending}
                  >
                    {cancelSessionMutation.isPending ? (
                      <ActivityIndicator size="small" color={Colors.dark.text} />
                    ) : (
                      <Text style={styles.modalConfirmButtonText}>Confirm</Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Ionicons name="close-circle" size={28} color={Colors.dark.error} />
                  <Text style={styles.modalTitle}>Cancel Session</Text>
                </View>
                
                <Text style={styles.modalDescription}>
                  Are you sure you want to cancel this {nextSession?.type === "semi" ? "semi-private" : "private"} session? Please select a reason:
                </Text>
                
                <View style={styles.cancelReasonsList}>
                  {(isMinorPlayer ? MINOR_CANCEL_REASONS : ADULT_CANCEL_REASONS).map((reason) => (
                    <Pressable
                      key={reason.id}
                      style={[
                        styles.cancelReasonItem,
                        cancelReason === reason.id && styles.cancelReasonItemSelected,
                      ]}
                      onPress={() => setCancelReason(reason.id)}
                    >
                      <Ionicons 
                        name={reason.icon as any} 
                        size={20} 
                        color={cancelReason === reason.id ? Colors.dark.xpCyan : Colors.dark.textMuted} 
                      />
                      <Text style={[
                        styles.cancelReasonText,
                        cancelReason === reason.id && styles.cancelReasonTextSelected,
                      ]}>{reason.label}</Text>
                      {cancelReason === reason.id ? (
                        <Ionicons name="checkmark-circle" size={20} color={Colors.dark.xpCyan} />
                      ) : null}
                    </Pressable>
                  ))}
                </View>
                
                {cancelReason === "other" ? (
                  <TextInput
                    style={styles.lateMessageInput}
                    placeholder="Optional: Tell us more"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={cancelReasonText}
                    onChangeText={setCancelReasonText}
                    multiline
                    maxLength={200}
                  />
                ) : null}
                
                {(() => {
                  const sessionDate = nextSession?.date ? new Date(nextSession.date) : null;
                  const hoursUntilSession = sessionDate ? (sessionDate.getTime() - Date.now()) / (1000 * 60 * 60) : 24;
                  const isLateCancellation = hoursUntilSession < 24;
                  
                  return isLateCancellation ? (
                    <View style={[styles.cancelNotice, { backgroundColor: Colors.dark.error + "25", borderWidth: 1, borderColor: Colors.dark.error }]}>
                      <Ionicons name="warning" size={20} color={Colors.dark.error} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cancelNoticeText, { color: Colors.dark.error, fontWeight: "700", fontSize: 14 }]}>
                          LATE CANCELLATION - YOU WILL BE CHARGED
                        </Text>
                        <Text style={[styles.cancelNoticeText, { marginTop: 4 }]}>
                          This session is within 24 hours. Cancelling now means you will still be charged the full session fee.
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.cancelNotice}>
                      <Ionicons name="information-circle" size={16} color={Colors.dark.orange} />
                      <Text style={styles.cancelNoticeText}>
                        Free cancellation available. Cancel at least 24 hours before to avoid charges.
                      </Text>
                    </View>
                  );
                })()}
                
                <View style={styles.modalActions}>
                  <Pressable 
                    style={styles.modalCancelButton}
                    onPress={() => { setShowCancelModal(false); setCancelReason(null); setCancelReasonText(""); }}
                  >
                    <Text style={styles.modalCancelButtonText}>Never Mind</Text>
                  </Pressable>
                  <Pressable 
                    style={[
                      styles.modalConfirmButton,
                      !cancelReason && styles.modalConfirmButtonDisabled,
                    ]}
                    onPress={() => {
                      if (cancelReason && nextSession) {
                        cancelSessionMutation.mutate({ 
                          sessionId: nextSession.id, 
                          reason: cancelReason, 
                          reasonText: cancelReasonText,
                          sessionType: nextSession.type 
                        });
                      }
                    }}
                    disabled={!cancelReason || cancelSessionMutation.isPending}
                  >
                    {cancelSessionMutation.isPending ? (
                      <ActivityIndicator size="small" color={Colors.dark.text} />
                    ) : (
                      <Text style={styles.modalConfirmButtonText}>Confirm Cancel</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      
      <Modal
        visible={showLateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowLateModal(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="time" size={28} color={Colors.dark.orange} />
              <Text style={styles.modalTitle}>Running Late?</Text>
            </View>
            
            <Text style={styles.modalDescription}>
              Let your coach know you're on the way. How late will you be?
            </Text>
            
            <View style={styles.lateMinutesPicker}>
              {[5, 10, 15, 20, 30].map((mins) => (
                <Pressable
                  key={mins}
                  style={[
                    styles.lateMinutesOption,
                    lateMinutes === mins && styles.lateMinutesOptionSelected,
                  ]}
                  onPress={() => setLateMinutes(mins)}
                >
                  <Text style={[
                    styles.lateMinutesText,
                    lateMinutes === mins && styles.lateMinutesTextSelected,
                  ]}>{mins} min</Text>
                </Pressable>
              ))}
            </View>
            
            <TextInput
              style={styles.lateMessageInput}
              placeholder="Optional message (e.g., 'Stuck in traffic')"
              placeholderTextColor={Colors.dark.textMuted}
              value={lateMessage}
              onChangeText={setLateMessage}
              multiline
              maxLength={100}
            />
            
            <View style={styles.modalActions}>
              <Pressable 
                style={styles.modalCancelButton}
                onPress={() => setShowLateModal(false)}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={styles.modalConfirmButton}
                onPress={() => {
                  if (nextSession) {
                    notifyLateMutation.mutate({ 
                      sessionId: nextSession.id, 
                      minutes: lateMinutes,
                      message: lateMessage,
                    });
                  }
                }}
                disabled={notifyLateMutation.isPending}
              >
                {notifyLateMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.text} />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>Notify Coach</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      
      <Modal
        visible={showVacationModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVacationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowVacationModal(false)} />
          <KeyboardAwareScrollViewCompat 
            contentContainerStyle={styles.vacationModalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Ionicons name="airplane" size={28} color={Colors.dark.xpCyan} />
                <Text style={styles.modalTitle}>Set Vacation</Text>
              </View>
              
              <Text style={styles.modalDescription}>
                Taking a break? Let us know when you'll be away.
              </Text>
              
              <View style={styles.vacationDateInputs}>
                <View style={styles.vacationDateField}>
                  <Text style={styles.vacationDateLabel}>Start Date</Text>
                  <TextInput
                    style={styles.vacationDateInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={vacationStartDate}
                    onChangeText={setVacationStartDate}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.vacationDateField}>
                  <Text style={styles.vacationDateLabel}>End Date</Text>
                  <TextInput
                    style={styles.vacationDateInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={vacationEndDate}
                    onChangeText={setVacationEndDate}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
              
              {(() => {
                const isValidDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d).getTime());
                const startValid = isValidDate(vacationStartDate);
                const endValid = isValidDate(vacationEndDate);
                const startDate = new Date(vacationStartDate);
                const endDate = new Date(vacationEndDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                const errorMessage = 
                  (vacationStartDate && !startValid) ? "Start date format should be YYYY-MM-DD" :
                  (vacationEndDate && !endValid) ? "End date format should be YYYY-MM-DD" :
                  (startValid && startDate < today) ? "Start date must be today or later" :
                  (startValid && endValid && endDate < startDate) ? "End date must be after start date" :
                  null;
                
                return errorMessage ? (
                  <View style={styles.vacationError}>
                    <Ionicons name="alert-circle" size={16} color={Colors.dark.error} />
                    <Text style={styles.vacationErrorText}>{errorMessage}</Text>
                  </View>
                ) : null;
              })()}
              
              <View style={styles.vacationTip}>
                <Ionicons name="information-circle" size={16} color={Colors.dark.xpCyan} />
                <Text style={styles.vacationTipText}>
                  Sessions during this period won't be scheduled.
                </Text>
              </View>
              
              <View style={styles.modalActions}>
                <Pressable 
                  style={styles.modalCancelButton}
                  onPress={() => setShowVacationModal(false)}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable 
                  style={[
                    styles.modalConfirmButton,
                    (!vacationStartDate || !vacationEndDate) && styles.modalConfirmButtonDisabled,
                  ]}
                  onPress={() => {
                    const isValidDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d).getTime());
                    if (!isValidDate(vacationStartDate) || !isValidDate(vacationEndDate)) {
                      Alert.alert("Invalid Date", "Please enter dates in YYYY-MM-DD format");
                      return;
                    }
                    const startDate = new Date(vacationStartDate);
                    const endDate = new Date(vacationEndDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    if (startDate < today) {
                      Alert.alert("Invalid Date", "Start date must be today or later");
                      return;
                    }
                    if (endDate < startDate) {
                      Alert.alert("Invalid Date", "End date must be after start date");
                      return;
                    }
                    
                    setVacationMutation.mutate({ 
                      startDate: vacationStartDate, 
                      endDate: vacationEndDate,
                    });
                  }}
                  disabled={!vacationStartDate || !vacationEndDate || setVacationMutation.isPending}
                >
                  {setVacationMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.text} />
                  ) : (
                    <Text style={styles.modalConfirmButtonText}>Set Vacation</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
      
      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowReportModal(false)} />
          <KeyboardAwareScrollViewCompat 
            contentContainerStyle={styles.vacationModalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Ionicons name="alert-circle" size={28} color={Colors.dark.error} />
                <Text style={styles.modalTitle}>Report an Issue</Text>
              </View>
              
              <Text style={styles.modalDescription}>
                Having a problem with this session? Let us know.
              </Text>
              
              <View style={styles.reportIssueOptions}>
                {[
                  { id: "equipment", label: "Equipment Problem", icon: "tennisball" },
                  { id: "court", label: "Court Issue", icon: "location" },
                  { id: "safety", label: "Safety Concern", icon: "shield" },
                  { id: "coach", label: "Coach Not Here", icon: "person" },
                  { id: "other", label: "Other Issue", icon: "ellipsis-horizontal" },
                ].map((option) => (
                  <Pressable
                    key={option.id}
                    style={[
                      styles.reportIssueOption,
                      reportIssueType === option.id && styles.reportIssueOptionSelected,
                    ]}
                    onPress={() => setReportIssueType(option.id)}
                  >
                    <Ionicons 
                      name={option.icon as any} 
                      size={20} 
                      color={reportIssueType === option.id ? Colors.dark.error : Colors.dark.textMuted} 
                    />
                    <Text style={[
                      styles.reportIssueOptionText,
                      reportIssueType === option.id && styles.reportIssueOptionTextSelected,
                    ]}>
                      {option.label}
                    </Text>
                    {reportIssueType === option.id ? (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.dark.error} />
                    ) : null}
                  </Pressable>
                ))}
              </View>
              
              <TextInput
                style={styles.reportIssueTextInput}
                placeholder="Describe the issue (optional)"
                placeholderTextColor={Colors.dark.textMuted}
                value={reportIssueText}
                onChangeText={setReportIssueText}
                multiline
                numberOfLines={3}
              />
              
              <View style={styles.modalActions}>
                <Pressable 
                  style={styles.modalCancelButton}
                  onPress={() => setShowReportModal(false)}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable 
                  style={[
                    styles.reportIssueSubmitButton,
                    !reportIssueType && styles.modalConfirmButtonDisabled,
                  ]}
                  onPress={() => {
                    if (nextSession && reportIssueType) {
                      reportIssueMutation.mutate({ 
                        sessionId: nextSession.id, 
                        issueType: reportIssueType,
                        description: reportIssueText,
                      });
                    }
                  }}
                  disabled={!reportIssueType || (reportIssueType === "other" && !reportIssueText.trim()) || reportIssueMutation.isPending}
                >
                  {reportIssueMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.text} />
                  ) : (
                    <Text style={styles.modalConfirmButtonText}>Report Issue</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
      
      <BirthdayCelebrationModal
        visible={showBirthdayModal}
        onDismiss={() => setShowBirthdayModal(false)}
        playerName={data?.player?.name?.split(" ")[0]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  errorSubtext: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  scrollView: {
    flex: 1,
  },
  modeSwitcherContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  header: {
    padding: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  xpSection: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  greeting: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  playerName: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  avatarContainer: {
    width: 56,
    height: 56,
  },
  avatarGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    padding: 2,
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarInner: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  levelContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  levelText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  glowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  glowText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  xpBarContainer: {
    marginTop: Spacing.xs,
  },
  xpBarTrack: {
    height: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 2,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  xpLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  xpText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  nextSessionCard: {
    ...CardStyles.glowCard,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  nextSessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  nextSessionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    flex: 1,
  },
  countdownBadge: {
    backgroundColor: "rgba(46, 204, 64, 0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  countdownText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  nextSessionDetails: {
    gap: 4,
  },
  sessionType: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sessionCourt: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  sessionCoach: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
  // Progress Snapshot styles
  progressSnapshot: {
    ...CardStyles.glowCard,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  progressSnapshotHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  progressSnapshotTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  progressSnapshotContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  levelRingContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  levelNumber: {
    ...Typography.h2,
    color: Colors.dark.primary,
    fontSize: 22,
    fontWeight: "700",
  },
  levelLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  progressStats: {
    flex: 1,
    gap: Spacing.xs,
  },
  progressStatRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  progressStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  progressStatValue: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  xpToNextLevel: {
    marginTop: Spacing.xs,
  },
  xpToNextLevelText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 11,
    marginBottom: 4,
  },
  xpProgressBar: {
    height: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  xpProgressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 3,
  },
  // Smart Alert styles
  smartAlert: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.orange + "15",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.orange + "40",
    gap: Spacing.sm,
  },
  smartAlertIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.orange + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  smartAlertContent: {
    flex: 1,
  },
  smartAlertTitle: {
    ...Typography.body,
    color: Colors.dark.orange,
    fontWeight: "600",
    fontSize: 14,
  },
  smartAlertSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  // Credits Card styles
  creditsCard: {
    ...CardStyles.glowCard,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    padding: Spacing.sm,
    borderColor: "rgba(255, 215, 0, 0.4)",
    borderWidth: 1,
  },
  creditsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  creditsTitle: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  creditsTotalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  creditsTotalValue: {
    ...Typography.h2,
    color: Colors.dark.gold,
    fontSize: 24,
  },
  creditsTotalLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  creditsTypeRow: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  creditsTypeItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: Spacing.xs,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.xs,
  },
  creditsTypeValue: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
    fontSize: 14,
  },
  creditsTypeLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 9,
  },
  creditsEmptyText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
    fontStyle: "italic",
  },
  buyCreditsButton: {
    marginTop: Spacing.xs,
  },
  buyCreditsGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  buyCreditsText: {
    ...Typography.caption,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  feedbackCard: {
    ...CardStyles.glowCard,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    borderColor: GlowColors.primary + "25",
  },
  feedbackHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  feedbackTitle: {
    ...Typography.h4,
    color: GlowColors.primary,
    flex: 1,
  },
  feedbackMessage: {
    ...Typography.h4,
    color: Colors.dark.text,
    fontStyle: "italic",
    lineHeight: 26,
    marginBottom: Spacing.md,
  },
  feedbackCoach: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  feedbackFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewProgressCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  viewProgressText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    ...CardStyles.statusCard,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.xs,
  },
  statValue: {
    ...Typography.numberMedium,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  academyCard: {
    ...CardStyles.elevated,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
  },
  academyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  academyName: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  academyContextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  academyContextText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  courtBookingCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  courtBookingGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
    borderRadius: BorderRadius.lg,
  },
  courtBookingIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.xpCyan + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  courtBookingContent: {
    flex: 1,
  },
  courtBookingTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  courtBookingSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  coachInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  coachAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  coachAvatarText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  coachLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  coachSection: {
    marginTop: Spacing.sm,
  },
  coachDetails: {
    flex: 1,
  },
  coachExperience: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  coachPhilosophy: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: Spacing.sm,
  },
  philosophyTag: {
    backgroundColor: "rgba(46, 204, 64, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  philosophyTagText: {
    ...Typography.small,
    fontSize: 11,
    color: Colors.dark.primary,
  },
  coachQuote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  coachQuoteText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
    flex: 1,
  },
  ownerCardSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  ownerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
    marginBottom: Spacing.sm,
  },
  ownerBadgeText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  successBannerText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
    flex: 1,
  },
  vacationBadge: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  vacationBadgeGradient: {
    padding: Spacing.md,
  },
  vacationBadgeContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  vacationBadgeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  vacationBadgeTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  vacationBadgeSubtitle: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
  vacationEndButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  vacationEndButtonText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sessionActionStrip: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  sessionActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  sessionActionCancel: {
    backgroundColor: "rgba(255, 71, 87, 0.1)",
  },
  sessionActionLate: {
    backgroundColor: "rgba(255, 165, 0, 0.1)",
  },
  sessionActionText: {
    ...Typography.small,
    fontWeight: "600",
  },
  vacationModeCard: {
    ...CardStyles.glowCard,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
    borderStyle: "dashed",
  },
  vacationModeContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  vacationModeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.xpCyan + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  vacationModeText: {
    flex: 1,
  },
  vacationModeTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  vacationModeSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.md,
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 380,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  modalDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  cancelReasonsList: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  cancelReasonItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  cancelReasonItemSelected: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: Colors.dark.xpCyan + "10",
  },
  cancelReasonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  cancelReasonTextSelected: {
    color: Colors.dark.text,
  },
  cancelNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.orange + "15",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  cancelNoticeText: {
    ...Typography.small,
    color: Colors.dark.orange,
    flex: 1,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
  },
  modalCancelButtonText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
  },
  modalConfirmButtonDisabled: {
    opacity: 0.5,
  },
  modalConfirmButtonText: {
    ...Typography.small,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  lateMinutesPicker: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  lateMinutesOption: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  lateMinutesOptionSelected: {
    borderColor: Colors.dark.orange,
    backgroundColor: Colors.dark.orange + "15",
  },
  lateMinutesText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  lateMinutesTextSelected: {
    color: Colors.dark.orange,
  },
  lateMessageInput: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    minHeight: 60,
    textAlignVertical: "top",
  },
  vacationDateInputs: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  vacationDateField: {
    flex: 1,
    minWidth: 0,
  },
  vacationDateLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: 4,
  },
  vacationDateInput: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    textAlign: "center",
  },
  vacationTip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.xpCyan + "15",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  vacationTipText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    flex: 1,
  },
  vacationError: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.error + "15",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  vacationErrorText: {
    ...Typography.caption,
    color: Colors.dark.error,
    flex: 1,
  },
  vacationModalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  upcomingVacationCard: {
    ...CardStyles.glowCard,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  upcomingVacationContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  upcomingVacationText: {
    flex: 1,
  },
  upcomingVacationTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  upcomingVacationDates: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
  upcomingVacationCancel: {
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
  },
  vacationSessionNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  vacationSessionNoteText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontStyle: "italic",
  },
  reportIssueOptions: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  reportIssueOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  reportIssueOptionSelected: {
    borderColor: Colors.dark.error,
    backgroundColor: Colors.dark.error + "10",
  },
  reportIssueOptionText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  reportIssueOptionTextSelected: {
    color: Colors.dark.text,
  },
  reportIssueTextInput: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  reportIssueSubmitButton: {
    flex: 1,
    backgroundColor: Colors.dark.error,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
});

const ownerStyles = StyleSheet.create({
  header: {
    padding: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  ownerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  ownerBadgeText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  academyName: {
    ...Typography.h2,
    color: Colors.dark.gold,
  },
  avatarContainer: {
    width: 56,
    height: 56,
  },
  avatarGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    padding: 2,
  },
  avatarInner: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  statCard: {
    width: "47%",
    ...CardStyles.elevated,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.xs,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  statValue: {
    ...Typography.h2,
    fontWeight: "700",
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  section: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  performersCard: {
    ...CardStyles.elevated,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  performerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  performerRank: {
    width: 24,
    alignItems: "center",
  },
  rankNumber: {
    ...Typography.h4,
    fontWeight: "700",
  },
  performerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  performerAvatarText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  performerInfo: {
    flex: 1,
  },
  performerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  performerLevel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  performerGlow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  performerGlowText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  distributionCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  distributionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  distributionLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    width: 130,
  },
  distributionBar: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 4,
    overflow: "hidden",
  },
  distributionFill: {
    height: "100%",
    borderRadius: 4,
  },
  distributionValue: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
    width: 24,
    textAlign: "right",
  },
  activityCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  activityInfo: {
    flex: 1,
  },
  activityMessage: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  activityTime: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
});

const statusStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  menu: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 320,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    padding: 3,
    marginBottom: Spacing.md,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: Spacing.md,
  },
  avatarInner: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 37,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    ...Typography.h1,
    color: Colors.dark.text,
    fontSize: 32,
  },
  playerName: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  academyName: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: Spacing.md,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  ballLevelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  ballLevelText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  coachAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  coachLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  closeButton: {
    backgroundColor: Colors.dark.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  closeButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});

const hudStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
  },
  levelText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  barsContainer: {
    flex: 1,
    gap: Spacing.xs,
  },
  barContainer: {
    gap: 2,
  },
  barHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  barLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  barLabel: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase" as const,
  },
  barValue: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "600",
  },
  barTrack: {
    height: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  glowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  glowText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
});

const missionStyles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardGradient: {
    padding: Spacing.lg,
    position: "relative",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  missionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
  },
  missionBadgeText: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  infoPanel: {
    flex: 1,
    gap: Spacing.sm,
  },
  typeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
  },
  typeText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "700",
    letterSpacing: 1,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  coachDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.xpCyan,
  },
  detailText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  countdownRing: {
    alignItems: "center",
    justifyContent: "center",
  },
  countdownCenter: {
    alignItems: "center",
  },
  countdownTime: {
    fontSize: 24,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  countdownSeconds: {
    ...Typography.caption,
    fontSize: 14,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  liveRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    overflow: "hidden",
  },
  liveRingGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: Colors.dark.error,
    borderRadius: 65,
  },
  liveText: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.error,
    textAlign: "center",
  },
  liveSubtext: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.dark.error,
    fontWeight: "600",
    letterSpacing: 1,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xl,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  actionToggle: {
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  actionGlow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  actionLabel: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  actionDivider: {
    width: 1,
    height: 50,
    backgroundColor: Colors.dark.border,
  },
  lockedActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  lockedText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  cornerAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 20,
    height: 20,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: Colors.dark.primary + "40",
    borderTopLeftRadius: BorderRadius.lg,
  },
  cornerAccentBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: Colors.dark.xpCyan + "40",
    borderBottomRightRadius: BorderRadius.lg,
  },
  noMissionCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.xl,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
    alignItems: "center",
    gap: Spacing.sm,
  },
  noMissionRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  noMissionTitle: {
    ...Typography.h4,
    color: Colors.dark.textMuted,
    letterSpacing: 2,
  },
  noMissionSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  bookLessonButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  bookLessonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});

const gameStyles = StyleSheet.create({
  trainingCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  trainingCardGradient: {
    padding: Spacing.lg,
  },
  trainingHeader: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "700",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  countdownContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: Spacing.lg,
    gap: Spacing.xs,
  },
  countdownBlock: {
    alignItems: "center",
    minWidth: 50,
  },
  countdownNumber: {
    fontSize: 36,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  countdownLabel: {
    ...Typography.caption,
    fontSize: 9,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  countdownSeparator: {
    fontSize: 28,
    fontWeight: "300",
    marginBottom: 16,
  },
  liveContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginVertical: Spacing.xl,
  },
  liveDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  liveText: {
    fontSize: 40,
    fontWeight: "800",
    color: Colors.dark.error,
    letterSpacing: 4,
  },
  sessionInfo: {
    alignItems: "center",
    gap: 4,
    marginBottom: Spacing.md,
  },
  sessionType: {
    ...Typography.h4,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sessionDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sessionDetailText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  actionButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  cancelButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.error + "15",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.error + "30",
  },
  lateButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.orange + "15",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.orange + "30",
  },
  actionButtonText: {
    ...Typography.body,
    fontWeight: "600",
  },
  vacationNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  vacationNoteText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontStyle: "italic",
  },
  noSessionCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.xl,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
  },
  noSessionTitle: {
    ...Typography.h4,
    color: Colors.dark.textMuted,
  },
  noSessionSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
});

const mentorStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarText: {
    ...Typography.h4,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  info: {
    flex: 1,
  },
  label: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  name: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "700",
    fontSize: 10,
  },
});
