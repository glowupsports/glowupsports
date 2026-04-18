import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { SessionHeroCard } from "./SessionHeroCard";
import {
  Spacing,
  BorderRadius,
  FontSizes,
  Typography,
  GlowColors,
  FunctionColors,
  RoleColors,
  Backgrounds,
  TextColors,
} from "@/constants/theme";
import { usePlayerState } from "../context/PlayerStateContext";
import { useAuth } from "@/coach/context/AuthContext";
import {
  getApiUrl,
  getAuthHeaders,
  getEffectivePlayerId,
} from "@/lib/query-client";
import { useTabNavigation } from "@/components/TabNavigationContext";

const ROTATE_MS = 6000;
const PAUSE_RESUME_MS = 3000;
const PRIORITY_LOCK_MIN = 120;
const HERO_SLOT_HEIGHT = 260;
const LOCKED_IDLE_DRIFT_MS = 10000;

type SlotId = "train" | "compete" | "events";
interface SlotMeta {
  id: SlotId;
  label: string;
  accent: string;
}

const SLOTS: SlotMeta[] = [
  { id: "train", label: "TRAIN", accent: GlowColors.primary },
  { id: "compete", label: "COMPETE", accent: FunctionColors.info },
  { id: "events", label: "EVENTS", accent: RoleColors.owner },
];

interface ChallengeData {
  id: string | number;
  challengerId: string | number;
  opponentId: string | number;
  status: string;
  matchType: string;
  matchFormat: string;
  scheduledDate: string;
  scheduledTime: string;
  courtName?: string;
  challengerName?: string;
  opponentName?: string;
}

interface OpenMatchLite {
  id: string;
  hostPlayerId?: string;
  matchType: string;
  sport?: string;
  scheduledTime?: string;
  courtName?: string;
  locationName?: string;
  currentPlayers: number;
  maxPlayers: number;
  costPerPlayer?: string | null;
  currency?: string;
  host?: { name: string };
}

interface TournamentLite {
  id: string;
  name: string;
  sport: string;
  startDate: string;
  startTime?: string | null;
  location: string;
  spotsTotal: number;
  spotsTaken: number;
  isRegistered: boolean;
  status: string;
  distanceKm?: number | null;
}

interface TournamentsPayload {
  upcoming: TournamentLite[];
  myTournaments: TournamentLite[];
}

function formatShortDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatTime(t?: string | null): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatTimeLeft(target: Date): string {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "Now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Tomorrow";
  if (days < 7) return `in ${days}d`;
  const weeks = Math.floor(days / 7);
  return `in ${weeks}w`;
}

function challengeToDate(c: { scheduledDate: string; scheduledTime: string }): Date | null {
  const [y, mo, d] = c.scheduledDate.split("-").map(Number);
  const [h, mi] = c.scheduledTime.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;
  return new Date(y, mo - 1, d, h, mi);
}

function isDoubles(matchType?: string): boolean {
  return (matchType || "").toLowerCase().includes("doubles");
}

function MatchTypeChip({ matchType, accent }: { matchType?: string; accent: string }) {
  const label = isDoubles(matchType) ? "DOUBLES" : "SINGLES";
  return (
    <View style={[styles.chip, { borderColor: `${accent}55`, backgroundColor: `${accent}18` }]}>
      <Ionicons
        name={isDoubles(matchType) ? "people" : "person"}
        size={10}
        color={accent}
      />
      <Text style={[styles.chipText, { color: accent }]}>{label}</Text>
    </View>
  );
}

function TimeLeftChip({ target, accent }: { target: Date; accent: string }) {
  return (
    <View style={[styles.chip, { borderColor: `${accent}55`, backgroundColor: `${accent}18` }]}>
      <Ionicons name="time-outline" size={10} color={accent} />
      <Text style={[styles.chipText, { color: accent }]}>{formatTimeLeft(target)}</Text>
    </View>
  );
}

function XpChip({ amount, accent }: { amount: number; accent: string }) {
  return (
    <View style={[styles.chip, { borderColor: `${accent}55`, backgroundColor: `${accent}18` }]}>
      <Ionicons name="flash" size={10} color={accent} />
      <Text style={[styles.chipText, { color: accent }]}>+{amount} XP</Text>
    </View>
  );
}

// =============================================================================
// COMPETE LENS
// =============================================================================
const COMPETE_ACCENT = FunctionColors.info;

function CompeteCard() {
  const { user } = useAuth();
  const playerId = getEffectivePlayerId(user?.playerId);
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  const queryClient = useQueryClient();

  const { data: challenges = [] } = useQuery<ChallengeData[]>({
    queryKey: ["/api/matches/challenge", playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const res = await fetch(
        new URL(
          `/api/matches/challenge?playerId=${playerId}`,
          getApiUrl()
        ).toString(),
        { headers: getAuthHeaders(), credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!playerId,
  });

  const { data: openMatches = [] } = useQuery<OpenMatchLite[]>({
    queryKey: ["/api/open-matches"],
    enabled: !!playerId,
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, accepted }: { id: string | number; accepted: boolean }) =>
      apiRequest("POST", `/api/matches/challenge/${id}/respond`, {
        response: accepted ? "accepted" : "declined",
        playerId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches/challenge"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches/challenges"] });
    },
    onError: (err: any) => {
      Alert.alert("Could not respond", err?.message || "Please try again.");
    },
  });

  const joinMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("POST", `/api/open-matches/${id}/join`, { playerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches"] });
      Alert.alert("Joined!", "You're in. See match details in Play.");
    },
    onError: (err: any) => {
      Alert.alert("Could not join", err?.message || "Please try again.");
    },
  });

  const goCreateMatch = () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      navigateToTab("PlayStack", { screen: "CreateMatch" } as any);
    } catch {
      try {
        navigation.navigate("CreateMatch");
      } catch {}
    }
  };

  const goOpenMatches = () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      navigateToTab("PlayStack", { screen: "OpenMatches" } as any);
    } catch {
      try {
        navigation.navigate("OpenMatches");
      } catch {}
    }
  };

  const goPlayers = () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      navigateToTab("PlayStack", {
        screen: "Play",
        params: { initialTab: "Players" },
      } as any);
    } catch {
      try {
        navigation.navigate("Play", { initialTab: "Players" });
      } catch {}
    }
  };

  const incomingChallenge = challenges.find(
    (c) =>
      c.status === "pending" && String(c.opponentId) === String(playerId)
  );

  const isFutureChallenge = (c: ChallengeData) => {
    if (!c.scheduledDate || !c.scheduledTime) return false;
    const [y, mo, d] = c.scheduledDate.split("-").map(Number);
    const [h, mi] = c.scheduledTime.split(":").map(Number);
    if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return false;
    return new Date(y, mo - 1, d, h, mi).getTime() > Date.now();
  };

  const acceptedChallenge = challenges
    .filter(
      (c) =>
        c.status === "accepted" &&
        (String(c.challengerId) === String(playerId) ||
          String(c.opponentId) === String(playerId)) &&
        isFutureChallenge(c)
    )
    .sort((a, b) =>
      `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(
        `${b.scheduledDate} ${b.scheduledTime}`
      )
    )[0];

  const upcomingOpenMatch = openMatches
    .filter((m) => m.scheduledTime && new Date(m.scheduledTime) > new Date())
    .sort(
      (a, b) =>
        new Date(a.scheduledTime!).getTime() -
        new Date(b.scheduledTime!).getTime()
    )[0];

  // Variant 1: Incoming challenge — inline Accept/Decline (parity with ChallengeCard).
  if (incomingChallenge) {
    const target = challengeToDate(incomingChallenge);
    return (
      <LensShell accent={COMPETE_ACCENT} label="COMPETE" icon="flash">
        <View style={styles.chipRow}>
          <MatchTypeChip matchType={incomingChallenge.matchType} accent={COMPETE_ACCENT} />
          {target ? <TimeLeftChip target={target} accent={COMPETE_ACCENT} /> : null}
          <XpChip amount={50} accent={COMPETE_ACCENT} />
        </View>
        <Text style={styles.lensTitle}>
          {incomingChallenge.challengerName || "A player"} challenges you!
        </Text>
        <Text style={styles.lensSubtitle}>
          {formatShortDate(incomingChallenge.scheduledDate)} ·{" "}
          {formatTime(incomingChallenge.scheduledTime)}
          {incomingChallenge.courtName ? ` · ${incomingChallenge.courtName}` : ""}
        </Text>
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.ctaPrimary, { backgroundColor: COMPETE_ACCENT, marginTop: 0 }]}
            disabled={respondMutation.isPending}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              respondMutation.mutate({ id: incomingChallenge.id, accepted: true });
            }}
          >
            <Text style={styles.ctaPrimaryText}>
              {respondMutation.isPending ? "..." : "Accept"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.ctaSecondary, { borderColor: "rgba(255,255,255,0.25)", marginTop: 0 }]}
            disabled={respondMutation.isPending}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              respondMutation.mutate({ id: incomingChallenge.id, accepted: false });
            }}
          >
            <Text style={[styles.ctaSecondaryText, { color: TextColors.secondary }]}>
              Decline
            </Text>
          </Pressable>
        </View>
      </LensShell>
    );
  }

  // Variant 2: Accepted upcoming challenge — View Match goes to Players tab where ChallengeCard renders match details.
  if (acceptedChallenge) {
    const isChallenger =
      String(acceptedChallenge.challengerId) === String(playerId);
    const oppName = isChallenger
      ? acceptedChallenge.opponentName
      : acceptedChallenge.challengerName;
    const target = challengeToDate(acceptedChallenge);
    return (
      <LensShell accent={COMPETE_ACCENT} label="COMPETE" icon="tennisball">
        <View style={styles.chipRow}>
          <MatchTypeChip matchType={acceptedChallenge.matchType} accent={COMPETE_ACCENT} />
          {target ? <TimeLeftChip target={target} accent={COMPETE_ACCENT} /> : null}
          <XpChip amount={50} accent={COMPETE_ACCENT} />
        </View>
        <Text style={styles.lensTitle}>Match vs {oppName || "Opponent"}</Text>
        <Text style={styles.lensSubtitle}>
          {formatShortDate(acceptedChallenge.scheduledDate)} ·{" "}
          {formatTime(acceptedChallenge.scheduledTime)}
          {acceptedChallenge.courtName ? ` · ${acceptedChallenge.courtName}` : ""}
        </Text>
        <Pressable
          style={[styles.ctaSecondary, { borderColor: COMPETE_ACCENT }]}
          onPress={goPlayers}
        >
          <Text style={[styles.ctaSecondaryText, { color: COMPETE_ACCENT }]}>
            View Match
          </Text>
          <Ionicons name="chevron-forward" size={14} color={COMPETE_ACCENT} />
        </Pressable>
      </LensShell>
    );
  }

  // Variant 3: Open match available — direct join via mutation (parity with PremiumMatchCard onJoin).
  if (upcomingOpenMatch) {
    const target = upcomingOpenMatch.scheduledTime
      ? new Date(upcomingOpenMatch.scheduledTime)
      : null;
    const when = target
      ? target.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Soon";
    const spots =
      upcomingOpenMatch.maxPlayers - upcomingOpenMatch.currentPlayers;
    const isHost = String(upcomingOpenMatch.hostPlayerId) === String(playerId);
    return (
      <LensShell accent={COMPETE_ACCENT} label="COMPETE" icon="people">
        <View style={styles.chipRow}>
          <MatchTypeChip matchType={upcomingOpenMatch.matchType} accent={COMPETE_ACCENT} />
          {target ? <TimeLeftChip target={target} accent={COMPETE_ACCENT} /> : null}
          <XpChip amount={75} accent={COMPETE_ACCENT} />
        </View>
        <Text style={styles.lensTitle} numberOfLines={1}>
          Open match{upcomingOpenMatch.host?.name ? ` · ${upcomingOpenMatch.host.name}` : ""}
        </Text>
        <Text style={styles.lensSubtitle} numberOfLines={2}>
          {when}
          {upcomingOpenMatch.courtName ? ` · ${upcomingOpenMatch.courtName}` : ""}
          {spots > 0 ? ` · ${spots} spot${spots === 1 ? "" : "s"} left` : ""}
        </Text>
        <Pressable
          style={[styles.ctaPrimary, { backgroundColor: COMPETE_ACCENT }]}
          disabled={joinMutation.isPending}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            if (isHost) {
              goOpenMatches();
            } else {
              joinMutation.mutate(upcomingOpenMatch.id);
            }
          }}
        >
          <Text style={styles.ctaPrimaryText}>
            {isHost ? "Manage" : joinMutation.isPending ? "Joining..." : "Join Match"}
          </Text>
          <Ionicons name="arrow-forward" size={14} color={Backgrounds.root} />
        </Pressable>
      </LensShell>
    );
  }

  // Variant 4: Empty state — Create Match (per task spec).
  return (
    <LensShell
      accent={COMPETE_ACCENT}
      label="COMPETE"
      icon="tennisball-outline"
    >
      <Text style={styles.lensTitle}>Find your first match</Text>
      <Text style={styles.lensSubtitle}>
        Create a match or browse open matches near you.
      </Text>
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.ctaPrimary, { backgroundColor: COMPETE_ACCENT, marginTop: 0 }]}
          onPress={goCreateMatch}
        >
          <Text style={styles.ctaPrimaryText}>Create Match</Text>
          <Ionicons name="add" size={14} color={Backgrounds.root} />
        </Pressable>
        <Pressable
          style={[styles.ctaSecondary, { borderColor: COMPETE_ACCENT, marginTop: 0 }]}
          onPress={goOpenMatches}
        >
          <Text style={[styles.ctaSecondaryText, { color: COMPETE_ACCENT }]}>Browse</Text>
        </Pressable>
      </View>
    </LensShell>
  );
}

// =============================================================================
// EVENTS LENS
// =============================================================================
const EVENTS_ACCENT = RoleColors.owner;

function EventsCard() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  const { state } = usePlayerState();

  const { data } = useQuery<TournamentsPayload>({
    queryKey: ["/api/player/tournaments"],
    enabled: !!user?.playerId,
  });

  const all = [
    ...(data?.myTournaments ?? []),
    ...(data?.upcoming ?? []),
  ];
  const seen = new Set<string>();
  const next = all
    .filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return t.status !== "completed";
    })
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    )[0];

  // Group event fallback: when no tournament exists, surface the next group
  // event from the player dashboard payload (PlayerStateContext.nextEventTime)
  // if one is set. The dashboard payload only exposes a relative time string
  // today, so we use it as a soft signal that "something is coming up".
  const groupEventTime = state.nextEventTime;

  const goToTournaments = (id?: string) => {
    Haptics.selectionAsync().catch(() => {});
    try {
      if (id) {
        navigateToTab("Growth", {
          screen: "TournamentDetail",
          params: { tournamentId: id },
        } as any);
      } else {
        navigateToTab("Growth", { screen: "Tournaments" } as any);
      }
    } catch {
      try {
        navigation.navigate(id ? "TournamentDetail" : "Tournaments", id ? { tournamentId: id } : undefined);
      } catch {}
    }
  };

  if (next) {
    const target = (() => {
      try {
        const d = new Date(next.startDate);
        return Number.isNaN(d.getTime()) ? null : d;
      } catch {
        return null;
      }
    })();
    return (
      <LensShell accent={EVENTS_ACCENT} label="EVENTS" icon="trophy">
        <View style={styles.chipRow}>
          {target ? <TimeLeftChip target={target} accent={EVENTS_ACCENT} /> : null}
          <View
            style={[
              styles.chip,
              { borderColor: `${EVENTS_ACCENT}55`, backgroundColor: `${EVENTS_ACCENT}18` },
            ]}
          >
            <Ionicons name="trophy" size={10} color={EVENTS_ACCENT} />
            <Text style={[styles.chipText, { color: EVENTS_ACCENT }]}>
              {(next.sport || "TENNIS").toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.lensTitle} numberOfLines={2}>
          {next.name}
        </Text>
        <Text style={styles.lensSubtitle} numberOfLines={2}>
          {formatShortDate(next.startDate)}
          {next.startTime ? ` · ${formatTime(next.startTime)}` : ""}
          {next.location ? ` · ${next.location}` : ""}
        </Text>
        <Pressable
          style={[styles.ctaPrimary, { backgroundColor: EVENTS_ACCENT }]}
          onPress={() => goToTournaments(next.id)}
        >
          <Text style={styles.ctaPrimaryText}>
            {next.isRegistered ? "View Event" : "Register"}
          </Text>
          <Ionicons name="arrow-forward" size={14} color={Backgrounds.root} />
        </Pressable>
      </LensShell>
    );
  }

  // Group event fallback: surface the next dashboard event if one is queued.
  if (groupEventTime) {
    return (
      <LensShell accent={EVENTS_ACCENT} label="EVENTS" icon="people">
        <View style={styles.chipRow}>
          <View
            style={[
              styles.chip,
              { borderColor: `${EVENTS_ACCENT}55`, backgroundColor: `${EVENTS_ACCENT}18` },
            ]}
          >
            <Ionicons name="people" size={10} color={EVENTS_ACCENT} />
            <Text style={[styles.chipText, { color: EVENTS_ACCENT }]}>GROUP EVENT</Text>
          </View>
        </View>
        <Text style={styles.lensTitle}>Group event coming up</Text>
        <Text style={styles.lensSubtitle}>
          Your next group event starts in {groupEventTime}.
        </Text>
        <Pressable
          style={[styles.ctaSecondary, { borderColor: EVENTS_ACCENT }]}
          onPress={() => goToTournaments()}
        >
          <Text style={[styles.ctaSecondaryText, { color: EVENTS_ACCENT }]}>View</Text>
          <Ionicons name="chevron-forward" size={14} color={EVENTS_ACCENT} />
        </Pressable>
      </LensShell>
    );
  }

  return (
    <LensShell accent={EVENTS_ACCENT} label="EVENTS" icon="trophy-outline">
      <Text style={styles.lensTitle}>Discover tournaments nearby</Text>
      <Text style={styles.lensSubtitle}>
        Browse local tournaments and ladders to test your game.
      </Text>
      <Pressable
        style={[styles.ctaPrimary, { backgroundColor: EVENTS_ACCENT }]}
        onPress={() => goToTournaments()}
      >
        <Text style={styles.ctaPrimaryText}>Explore</Text>
        <Ionicons name="arrow-forward" size={14} color={Backgrounds.root} />
      </Pressable>
    </LensShell>
  );
}

// =============================================================================
// LENS SHELL (consistent COMPETE/EVENTS card surface)
// =============================================================================
function LensShell({
  accent,
  label,
  icon,
  children,
}: {
  accent: string;
  label: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.lensShell, { borderColor: `${accent}40` }]}>
      <LinearGradient
        colors={[`${accent}18`, "rgba(17, 20, 26, 0.0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.lensGradient}
      >
        <View style={styles.lensHeader}>
          <View style={[styles.lensIconWrap, { backgroundColor: `${accent}25` }]}>
            <Ionicons name={icon} size={14} color={accent} />
          </View>
          <Text style={[styles.lensLabel, { color: accent }]}>{label}</Text>
        </View>
        <View style={styles.lensBody}>{children}</View>
      </LinearGradient>
    </View>
  );
}

// =============================================================================
// CAROUSEL
// =============================================================================
interface HeroCarouselProps {
  onBookSession?: () => void;
  onCheckIn?: () => void;
  onCancel?: () => void;
  onExtend?: () => void;
  onFindMatch?: () => void;
}

export function HeroCarousel({
  onBookSession,
  onCheckIn,
  onCancel,
  onExtend,
  onFindMatch,
}: HeroCarouselProps = {}) {
  const { state } = usePlayerState();
  const [containerWidth, setContainerWidth] = useState<number>(
    Dimensions.get("window").width
  );
  const listRef = useRef<FlatList<SlotMeta>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockEngagedRef = useRef(false);
  const progress = useSharedValue(0);

  const priorityLocked =
    state.minutesToNextSession != null &&
    state.minutesToNextSession >= 0 &&
    state.minutesToNextSession <= PRIORITY_LOCK_MIN;

  const scrollTo = useCallback((idx: number) => {
    try {
      listRef.current?.scrollToIndex({ index: idx, animated: true });
    } catch {}
  }, []);

  const startProgress = useCallback(() => {
    cancelAnimation(progress);
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: ROTATE_MS,
      easing: Easing.linear,
    });
  }, [progress]);

  const advance = useCallback(() => {
    setActiveIndex((prev) => {
      const next = (prev + 1) % SLOTS.length;
      scrollTo(next);
      return next;
    });
  }, [scrollTo]);

  // Auto-rotate
  useEffect(() => {
    if (paused || priorityLocked) {
      cancelAnimation(progress);
      progress.value = 0;
      if (rotateTimerRef.current) clearTimeout(rotateTimerRef.current);
      return;
    }
    startProgress();
    rotateTimerRef.current = setTimeout(advance, ROTATE_MS);
    return () => {
      if (rotateTimerRef.current) clearTimeout(rotateTimerRef.current);
    };
  }, [activeIndex, paused, priorityLocked, advance, startProgress, progress]);

  // Priority lock: snap to TRAIN once when the lock first engages, but
  // afterwards respect manual swipes / dot taps so the player can still
  // peek at COMPETE / EVENTS while a session is upcoming.
  useEffect(() => {
    if (priorityLocked) {
      if (!lockEngagedRef.current) {
        lockEngagedRef.current = true;
        if (activeIndex !== 0) {
          scrollTo(0);
          setActiveIndex(0);
        }
      }
    } else {
      lockEngagedRef.current = false;
      if (lockedIdleTimerRef.current) {
        clearTimeout(lockedIdleTimerRef.current);
        lockedIdleTimerRef.current = null;
      }
    }
  }, [priorityLocked, activeIndex, scrollTo]);

  // Idle drift-back: while locked, if the player is on COMPETE/EVENTS and
  // does nothing for ~10s, slide quietly back to TRAIN so the countdown
  // is front-and-center again.
  useEffect(() => {
    if (lockedIdleTimerRef.current) {
      clearTimeout(lockedIdleTimerRef.current);
      lockedIdleTimerRef.current = null;
    }
    if (priorityLocked && activeIndex !== 0 && !paused) {
      lockedIdleTimerRef.current = setTimeout(() => {
        scrollTo(0);
        setActiveIndex(0);
      }, LOCKED_IDLE_DRIFT_MS);
    }
    return () => {
      if (lockedIdleTimerRef.current) {
        clearTimeout(lockedIdleTimerRef.current);
        lockedIdleTimerRef.current = null;
      }
    };
  }, [priorityLocked, activeIndex, paused, scrollTo]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rotateTimerRef.current) clearTimeout(rotateTimerRef.current);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (lockedIdleTimerRef.current) clearTimeout(lockedIdleTimerRef.current);
    };
  }, []);

  const pauseNow = useCallback(() => {
    setPaused(true);
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const scheduleResume = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setPaused(false), PAUSE_RESUME_MS);
  }, []);

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (containerWidth <= 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    if (idx !== activeIndex) {
      setActiveIndex(idx);
      Haptics.selectionAsync().catch(() => {});
    }
    scheduleResume();
  };

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const renderItem = ({ item }: { item: SlotMeta }) => (
    <View
      style={{
        width: containerWidth,
        height: HERO_SLOT_HEIGHT,
        overflow: "hidden",
        justifyContent: "center",
      }}
    >
      {item.id === "train" && (
        <SessionHeroCard
          onBookSession={onBookSession}
          onCheckIn={onCheckIn}
          onCancel={onCancel}
          onExtend={onExtend}
          onFindMatch={onFindMatch}
        />
      )}
      {item.id === "compete" && <CompeteCard />}
      {item.id === "events" && <EventsCard />}
    </View>
  );

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && w !== containerWidth) setContainerWidth(w);
      }}
    >
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        {!priorityLocked && !paused ? (
          <Animated.View
            style={[
              styles.progressFill,
              { backgroundColor: SLOTS[activeIndex].accent },
              progressStyle,
            ]}
          />
        ) : null}
      </View>

      <Pressable onPressIn={pauseNow} onPressOut={scheduleResume}>
        <FlatList
          ref={listRef}
          data={SLOTS}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          onMomentumScrollEnd={handleMomentumEnd}
          onScrollBeginDrag={pauseNow}
          getItemLayout={(_, idx) => ({
            length: containerWidth,
            offset: containerWidth * idx,
            index: idx,
          })}
          decelerationRate="fast"
          snapToInterval={containerWidth}
          extraData={containerWidth}
        />
      </Pressable>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLOTS.map((s, i) => {
          const active = i === activeIndex;
          return (
            <Pressable
              key={s.id}
              hitSlop={8}
              onPress={() => {
                pauseNow();
                setActiveIndex(i);
                scrollTo(i);
                scheduleResume();
              }}
              style={[
                styles.dot,
                {
                  width: active ? 18 : 6,
                  backgroundColor: active ? s.accent : "rgba(255,255,255,0.18)",
                },
              ]}
            />
          );
        })}
      </View>

      {priorityLocked ? (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={11} color={GlowColors.primary} />
          <Text style={styles.lockText}>SESSION SOON</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  progressTrack: {
    marginHorizontal: Spacing.lg,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressFill: {
    height: "100%",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    marginBottom: Spacing.sm,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  lockBadge: {
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(200,255,61,0.1)",
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
  lockText: {
    fontSize: 10,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 0.5,
  },
  // Lens shell
  lensShell: {
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    backgroundColor: Backgrounds.card,
    overflow: "hidden",
    height: HERO_SLOT_HEIGHT - Spacing.md * 2,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: Spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  lensGradient: {
    flex: 1,
    padding: Spacing.lg,
  },
  lensHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  lensIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  lensLabel: {
    ...Typography.labelSmall,
    fontWeight: "700",
  },
  lensBody: {
    flex: 1,
    justifyContent: "center",
    gap: Spacing.sm,
  },
  lensTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: TextColors.primary,
  },
  lensSubtitle: {
    fontSize: FontSizes.sm,
    color: TextColors.secondary,
    lineHeight: 18,
  },
  ctaPrimary: {
    marginTop: Spacing.md,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: GlowColors.primary,
  },
  ctaPrimaryText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Backgrounds.root,
  },
  ctaSecondary: {
    marginTop: Spacing.md,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  ctaSecondaryText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
  },
});
