import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
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
  Image as RNImage,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { MatchSummaryCard } from "./MatchSummaryCard";
import { GlowLessonsStack } from "./GlowLessonsStack";
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
  Colors,
} from "@/constants/theme";
import { usePlayerState } from "../context/PlayerStateContext";
import { useAuth } from "@/coach/context/AuthContext";
import {
  getApiUrl,
  getAuthHeaders,
  getEffectivePlayerId,
  buildPhotoUrl,
} from "@/lib/query-client";
import { useTabNavigation } from "@/components/TabNavigationContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const ROTATE_MS = 6000;
const PAUSE_RESUME_MS = 8000;
const PRIORITY_LOCK_MIN = 120;
const HERO_SLOT_HEIGHT = 380;
const USER_PAUSED_STORAGE_KEY = "hero-carousel-paused-v2";
const PAUSED_HYDRATION_FALLBACK_MS = 1000;

const HeroPillContext = React.createContext<{ onInteract: () => void }>({
  onInteract: () => {},
});

type SlotId = "train" | "glow_lessons" | "compete" | "events" | "friend_spotlight";
interface SlotMeta {
  id: SlotId;
  label: string;
  accent: string;
}

const GLOW_LESSONS_ACCENT = "#E040FB";
const FRIEND_SPOTLIGHT_ACCENT = GlowColors.primary;

const SLOTS: SlotMeta[] = [
  { id: "train", label: "TRAIN", accent: GlowColors.primary },
  { id: "glow_lessons", label: "GLOW LESSONS", accent: GLOW_LESSONS_ACCENT },
  { id: "compete", label: "OPEN MATCHES", accent: FunctionColors.info },
  { id: "events", label: "TOURNAMENTS & EVENTS", accent: RoleColors.owner },
  { id: "friend_spotlight", label: "FRIEND SPOTLIGHT", accent: FRIEND_SPOTLIGHT_ACCENT },
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
  ballLevel?: string | null;
  levelMatch?: "exact" | "adjacent";
  levelDirection?: "higher" | "lower" | null;
  host?: {
    id?: string;
    name: string;
    photoUrl?: string | null;
    ballLevel?: string | null;
    level?: number;
  };
}

function getBallLevelColor(level?: string | null): string {
  const l = (level || "").toLowerCase();
  if (l.includes("blue")) return "#3B82F6";
  if (l.includes("red")) return "#EF4444";
  if (l.includes("orange")) return "#F97316";
  if (l.includes("green")) return "#22C55E";
  if (l.includes("yellow")) return "#EAB308";
  if (l.includes("glow")) return "#E040FB";
  return GlowColors.primary;
}

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
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

  // Hero needs to surface the player's OWN upcoming open match (so they can
  // jump back to manage it) — that requires `?includeMine=true`. We use a
  // distinct cache key from the bare /api/open-matches query (used by
  // OpenMatchesRow) so the two never overwrite each other's cached payloads.
  const { data: openMatches = [] } = useQuery<OpenMatchLite[]>({
    queryKey: ["/api/open-matches", { includeMine: true }],
    queryFn: async () => {
      if (!playerId) return [];
      const res = await fetch(
        new URL(`/api/open-matches?includeMine=true`, getApiUrl()).toString(),
        { headers: getAuthHeaders(), credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json();
    },
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
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches", { includeMine: true }] });
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

  const goPlayerFinder = () => {
    try {
      navigation.navigate("PlayerFinder");
    } catch {
      try {
        navigation.getParent()?.navigate("PlayerFinder");
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

  // Priority: own upcoming match first (so player can manage it), then any
  // other joinable upcoming match. We never show an empty CTA when the
  // player already has a hosted match queued up.
  const futureSorted = openMatches
    .filter((m) => m.scheduledTime && new Date(m.scheduledTime) > new Date())
    .sort(
      (a, b) =>
        new Date(a.scheduledTime!).getTime() -
        new Date(b.scheduledTime!).getTime()
    );
  const isMine = (m: OpenMatchLite) =>
    String(m.host?.id || m.hostPlayerId) === String(playerId);
  const myUpcomingMatch = futureSorted.find(isMine);
  const otherUpcomingMatch = futureSorted.find((m) => !isMine(m));
  const upcomingOpenMatch = myUpcomingMatch || otherUpcomingMatch;

  // Variant 1: Incoming challenge — inline Accept/Decline (parity with ChallengeCard).
  if (incomingChallenge) {
    const target = challengeToDate(incomingChallenge);
    return (
      <LensShell accent={COMPETE_ACCENT} label="OPEN MATCHES" icon="flash" actionLabel="Find Matches" onAction={goOpenMatches}>
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
            style={[styles.ctaSecondary, { borderColor: Colors.dark.chipBorder, marginTop: 0 }]}
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
      <LensShell accent={COMPETE_ACCENT} label="OPEN MATCHES" icon="flash" actionLabel="Find Matches" onAction={goOpenMatches}>
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

  // Variant 3: Open match available — own match prioritized (Manage),
  // otherwise next joinable match (Join). Rendered via the shared
  // MatchSummaryCard so the visual matches the OpenMatches feed and row.
  if (upcomingOpenMatch) {
    const isHost =
      String(upcomingOpenMatch.host?.id || upcomingOpenMatch.hostPlayerId) ===
      String(playerId);

    const goManageMatch = () => {
      const matchId = upcomingOpenMatch.id;
      if (!matchId) {
        goOpenMatches();
        return;
      }
      try {
        navigation.navigate("ManageMatch", { matchId });
      } catch {
        goOpenMatches();
      }
    };

    return (
      <LensShell accent={COMPETE_ACCENT} label="OPEN MATCHES" icon="flash" actionLabel="Find Matches" onAction={goOpenMatches}>
        <MatchSummaryCard
          embedded
          matchId={upcomingOpenMatch.id}
          matchType={upcomingOpenMatch.matchType}
          sport={upcomingOpenMatch.sport}
          scheduledTime={upcomingOpenMatch.scheduledTime}
          courtName={upcomingOpenMatch.courtName}
          locationName={upcomingOpenMatch.locationName}
          host={upcomingOpenMatch.host}
          ballLevel={upcomingOpenMatch.ballLevel}
          currentPlayers={upcomingOpenMatch.currentPlayers}
          maxPlayers={upcomingOpenMatch.maxPlayers}
          costPerPlayer={upcomingOpenMatch.costPerPlayer}
          currency={upcomingOpenMatch.currency}
          levelMatch={upcomingOpenMatch.levelMatch}
          levelDirection={upcomingOpenMatch.levelDirection}
          isHost={isHost}
          joining={joinMutation.isPending}
          onJoin={() => joinMutation.mutate(upcomingOpenMatch.id)}
          onManage={goManageMatch}
          accent={COMPETE_ACCENT}
        />
      </LensShell>
    );
  }

  // Variant 4: Empty state — Create Match (per task spec).
  return (
    <LensShell
      accent={COMPETE_ACCENT}
      label="OPEN MATCHES"
      icon="flash"
      actionLabel="Find Matches"
      onAction={goOpenMatches}
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
      <LensShell accent={EVENTS_ACCENT} label="TOURNAMENTS & EVENTS" icon="trophy" actionLabel="See All" onAction={() => goToTournaments()}>
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

  // Designed empty state — no tournaments scheduled
  return (
    <LensShell accent={EVENTS_ACCENT} label="TOURNAMENTS & EVENTS" icon="trophy-outline" actionLabel="See All" onAction={() => goToTournaments()}>
      <View style={styles.chipRow}>
        <View
          style={[
            styles.chip,
            { borderColor: `${EVENTS_ACCENT}55`, backgroundColor: `${EVENTS_ACCENT}18` },
          ]}
        >
          <Ionicons name="sparkles-outline" size={10} color={EVENTS_ACCENT} />
          <Text style={[styles.chipText, { color: EVENTS_ACCENT }]}>DISCOVER</Text>
        </View>
      </View>
      <Text style={styles.lensTitle}>Find your next event</Text>
      <Text style={styles.lensSubtitle}>
        Browse local tournaments, ladders & community meetups near you.
      </Text>
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.ctaPrimary, { backgroundColor: EVENTS_ACCENT, marginTop: 0 }]}
          onPress={() => goToTournaments()}
        >
          <Text style={styles.ctaPrimaryText}>Explore</Text>
          <Ionicons name="arrow-forward" size={14} color={Backgrounds.root} />
        </Pressable>
      </View>
    </LensShell>
  );
}

// =============================================================================
// FRIEND SPOTLIGHT LENS
// =============================================================================
interface FriendSpotlightConnection {
  id: string;
  status: string;
  matchesPlayed: number;
  lastPlayedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  player: {
    id: string;
    name: string;
    photoUrl: string | null;
    profilePhotoUrl?: string | null;
    level: number;
    glowScore: number;
    ballLevel: string | null;
    openToPlay: boolean;
  } | null;
}

function FriendSpotlightLensCard() {
  const navigation = useNavigation<any>();

  const { data: connectionsData } = useQuery<{ friends: FriendSpotlightConnection[] }>({
    queryKey: ["/api/player/connections"],
  });

  const friends = (connectionsData?.friends || [])
    .filter((c) => c.player)
    .slice()
    .sort((a, b) => {
      const aTime = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0;
      const bTime = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      if ((b.matchesPlayed || 0) !== (a.matchesPlayed || 0)) {
        return (b.matchesPlayed || 0) - (a.matchesPlayed || 0);
      }
      const aAcc = a.acceptedAt || a.createdAt;
      const bAcc = b.acceptedAt || b.createdAt;
      return new Date(bAcc).getTime() - new Date(aAcc).getTime();
    })
    .slice(0, 3);

  const goToFriends = () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      navigation.navigate("FriendsList");
    } catch {}
  };

  const goToPlayerProfile = (playerId: string) => {
    Haptics.selectionAsync().catch(() => {});
    try {
      navigation.navigate("PublicProfile", { playerId });
    } catch {}
  };

  const goFindPlayers = () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      navigation.navigate("FriendsList");
    } catch {}
  };

  if (friends.length === 0) {
    return (
      <LensShell
        accent={FRIEND_SPOTLIGHT_ACCENT}
        label="FRIEND SPOTLIGHT"
        icon="people"
        actionLabel="View All"
        onAction={goToFriends}
      >
        <View style={friendSpotlightStyles.emptyWrap}>
          <View style={[friendSpotlightStyles.emptyIcon, { borderColor: `${FRIEND_SPOTLIGHT_ACCENT}55`, backgroundColor: `${FRIEND_SPOTLIGHT_ACCENT}18` }]}>
            <Ionicons name="people-outline" size={28} color={FRIEND_SPOTLIGHT_ACCENT} />
          </View>
          <Text style={styles.lensTitle}>Add friends to see their progress</Text>
          <Text style={styles.lensSubtitle}>
            Connect with players from your academy and follow their week.
          </Text>
          <Pressable
            style={[styles.ctaPrimary, { backgroundColor: FRIEND_SPOTLIGHT_ACCENT }]}
            onPress={goFindPlayers}
          >
            <Text style={styles.ctaPrimaryText}>Add friends</Text>
            <Ionicons name="arrow-forward" size={14} color={Backgrounds.root} />
          </Pressable>
        </View>
      </LensShell>
    );
  }

  return (
    <LensShell
      accent={FRIEND_SPOTLIGHT_ACCENT}
      label="FRIEND SPOTLIGHT"
      icon="people"
      actionLabel="View All"
      onAction={goToFriends}
    >
      <Text style={[styles.lensSubtitle, { marginBottom: Spacing.xs }]}>Most active this week</Text>
      <View style={friendSpotlightStyles.list}>
        {friends.map((conn, idx) => {
          const p = conn.player!;
          const photoUri = buildPhotoUrl(p.photoUrl ?? p.profilePhotoUrl ?? null);
          const stat =
            (conn.matchesPlayed || 0) > 0
              ? `${conn.matchesPlayed} match${conn.matchesPlayed === 1 ? "" : "es"}`
              : `Lvl ${p.level || 1}`;
          return (
            <Pressable
              key={conn.id}
              onPress={() => goToPlayerProfile(p.id)}
              style={({ pressed }) => [
                friendSpotlightStyles.row,
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={friendSpotlightStyles.rank}>
                <Text style={[friendSpotlightStyles.rankText, { color: FRIEND_SPOTLIGHT_ACCENT }]}>
                  {idx + 1}
                </Text>
              </View>
              <View style={[friendSpotlightStyles.avatarRing, { borderColor: `${FRIEND_SPOTLIGHT_ACCENT}88` }]}>
                {photoUri ? (
                  <RNImage source={{ uri: photoUri }} style={friendSpotlightStyles.avatarImg} />
                ) : (
                  <View style={[friendSpotlightStyles.avatarFallback, { backgroundColor: `${FRIEND_SPOTLIGHT_ACCENT}22` }]}>
                    <Ionicons name="person" size={18} color={FRIEND_SPOTLIGHT_ACCENT} />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={friendSpotlightStyles.name} numberOfLines={1}>{p.name}</Text>
                <Text style={friendSpotlightStyles.stat} numberOfLines={1}>{stat}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={TextColors.muted} />
            </Pressable>
          );
        })}
      </View>
    </LensShell>
  );
}

const friendSpotlightStyles = makeReactiveStyles(() => StyleSheet.create({
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  list: {
    gap: Spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.chipBackground,
  },
  rank: {
    width: 22,
    alignItems: "center",
  },
  rankText: {
    fontSize: 14,
    fontWeight: "800",
  },
  avatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.chipBackground,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: TextColors.primary,
  },
  stat: {
    fontSize: FontSizes.sm,
    color: TextColors.secondary,
    marginTop: 1,
  },
}));

// =============================================================================
// LENS SHELL (consistent COMPETE/EVENTS card surface)
// =============================================================================
function LensShell({
  accent,
  label,
  icon,
  children,
  actionLabel,
  onAction,
}: {
  accent: string;
  label: string;
  icon: any;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  // iOS 26-inspired glass shell: blurred surface, accent gradient wash,
  // top inner highlight line, accent-tinted hairline border, soft outer
  // accent glow. Used by all 4 hero carousel slots so they share the same
  // outer dimensions, header strip, and material.
  return (
    <View
      style={[
        styles.lensShellOuter,
        Platform.select({
          ios: {
            shadowColor: accent,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.35,
            shadowRadius: 14,
          },
          android: { elevation: 6 },
          default: { boxShadow: `0 0 18px ${accent}55` } as any,
        }),
      ]}
    >
      <View
        style={[
          styles.lensShell,
          { borderColor: `${accent}55` },
        ]}
      >
        <BlurView
          intensity={Platform.OS === "web" ? 0 : 28}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[`${accent}26`, Backgrounds.glass, Backgrounds.glass]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.lensTopHighlight, { backgroundColor: `${accent}AA` }]} />
        <View style={styles.lensInner}>
          <View style={styles.lensHeader}>
            <View style={[styles.lensIconWrap, { backgroundColor: `${accent}25`, borderColor: `${accent}55` }]}>
              <Ionicons name={icon} size={14} color={accent} />
            </View>
            <Text style={[styles.lensLabel, { color: accent }]}>{label}</Text>
            {actionLabel && onAction ? (
              <View style={styles.jumpPillSpacer} />
            ) : null}
            {actionLabel && onAction ? (
              <JumpPill accent={accent} label={actionLabel} onPress={onAction} />
            ) : null}
          </View>
          <View style={styles.lensBody}>{children}</View>
        </View>
      </View>
    </View>
  );
}

function JumpPill({
  accent,
  label,
  onPress,
}: {
  accent: string;
  label: string;
  onPress: () => void;
}) {
  const { onInteract } = useContext(HeroPillContext);
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onInteract();
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.jumpPill,
        { borderColor: `${accent}66`, backgroundColor: `${accent}1A` },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[styles.jumpPillText, { color: accent }]} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={12} color={accent} />
    </Pressable>
  );
}

function SlotHeaderStrip({
  accent,
  icon,
  label,
  actionLabel,
  onAction,
}: {
  accent: string;
  icon: any;
  label: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.slotHeaderStrip}>
      <View style={[styles.lensIconWrap, { backgroundColor: `${accent}25` }]}>
        <Ionicons name={icon} size={14} color={accent} />
      </View>
      <Text style={[styles.lensLabel, { color: accent }]}>{label}</Text>
      <View style={{ flex: 1 }} />
      <JumpPill accent={accent} label={actionLabel} onPress={onAction} />
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
  const navigation = useNavigation<any>();
  const { navigateToTab, setScrollEnabled } = useTabNavigation();
  const [containerWidth, setContainerWidth] = useState<number>(
    Dimensions.get("window").width
  );
  const listRef = useRef<FlatList<SlotMeta>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [pausedHydrated, setPausedHydrated] = useState(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(0);

  const sessionSoon =
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

  // Hydrate persisted pause preference on mount. AsyncStorage is async, so
  // we read it in a useEffect and gate auto-rotate via `pausedHydrated`
  // until the read resolves. This avoids a flash of rotation on first
  // paint before we know whether the player previously paused the carousel.
  useEffect(() => {
    let cancelled = false;
    // Fallback: never let a hung/failing AsyncStorage freeze rotation forever.
    const fallback = setTimeout(() => {
      if (!cancelled) setPausedHydrated(true);
    }, PAUSED_HYDRATION_FALLBACK_MS);
    AsyncStorage.getItem(USER_PAUSED_STORAGE_KEY)
      .then((val) => {
        if (cancelled) return;
        if (val === "1") setUserPaused(true);
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        clearTimeout(fallback);
        setPausedHydrated(true);
      });
    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, []);

  // Auto-rotate — runs in all cases unless user has explicitly paused
  // (or briefly paused while pressing/swiping).
  useEffect(() => {
    if (paused || userPaused || !pausedHydrated) {
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
  }, [activeIndex, paused, userPaused, pausedHydrated, advance, startProgress, progress]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rotateTimerRef.current) clearTimeout(rotateTimerRef.current);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const parentScrollDisabledRef = useRef(false);
  const disableParentScroll = useCallback(() => {
    if (parentScrollDisabledRef.current) return;
    parentScrollDisabledRef.current = true;
    setScrollEnabled(false);
  }, [setScrollEnabled]);
  const enableParentScroll = useCallback(() => {
    if (!parentScrollDisabledRef.current) return;
    parentScrollDisabledRef.current = false;
    setScrollEnabled(true);
  }, [setScrollEnabled]);

  useEffect(() => {
    return () => {
      if (parentScrollDisabledRef.current) {
        parentScrollDisabledRef.current = false;
        setScrollEnabled(true);
      }
    };
  }, [setScrollEnabled]);

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
    enableParentScroll();
  };

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const goSchedule = () => {
    try {
      navigateToTab("Growth", { screen: "ScheduleMain" } as any);
    } catch {
      try {
        navigation.navigate("ScheduleMain");
      } catch {}
    }
  };

  const goClassesDiscovery = () => {
    try {
      navigation.navigate("ClassesDiscovery");
    } catch {}
  };

  const renderItem = ({ item }: { item: SlotMeta }) => {
    if (item.id === "train") {
      return (
        <View style={{ width: containerWidth, height: HERO_SLOT_HEIGHT }}>
          <LensShell
            accent={item.accent}
            label={item.label}
            icon="tennisball"
            actionLabel="View Schedule"
            onAction={goSchedule}
          >
            <SessionHeroCard
              onBookSession={onBookSession}
              onCheckIn={onCheckIn}
              onCancel={onCancel}
              onExtend={onExtend}
              onFindMatch={onFindMatch}
            />
          </LensShell>
        </View>
      );
    }
    if (item.id === "glow_lessons") {
      return (
        <View style={{ width: containerWidth, height: HERO_SLOT_HEIGHT }}>
          <LensShell
            accent={item.accent}
            label={item.label}
            icon="people"
            actionLabel="View All"
            onAction={goClassesDiscovery}
          >
            <GlowLessonsStack accent={GLOW_LESSONS_ACCENT} />
          </LensShell>
        </View>
      );
    }
    return (
      <View style={{ width: containerWidth, height: HERO_SLOT_HEIGHT }}>
        {item.id === "compete" && <CompeteCard />}
        {item.id === "events" && <EventsCard />}
        {item.id === "friend_spotlight" && <FriendSpotlightLensCard />}
      </View>
    );
  };

  return (
    <HeroPillContext.Provider
      value={{
        onInteract: () => {
          pauseNow();
          scheduleResume();
        },
      }}
    >
    <View
      style={styles.container}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && w !== containerWidth) setContainerWidth(w);
      }}
    >
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        {!paused && !userPaused ? (
          <Animated.View
            style={[
              styles.progressFill,
              { backgroundColor: SLOTS[activeIndex].accent },
              progressStyle,
            ]}
          />
        ) : null}
      </View>

      <View
        onTouchStart={() => {
          pauseNow();
        }}
        onTouchEnd={scheduleResume}
        onTouchCancel={scheduleResume}
        {...(Platform.OS === "web"
          ? ({
              onMouseDown: () => pauseNow(),
              onMouseUp: () => scheduleResume(),
              onMouseLeave: () => scheduleResume(),
            } as any)
          : {})}
      >
        <FlatList
          ref={listRef}
          data={SLOTS}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          onMomentumScrollEnd={handleMomentumEnd}
          onScrollBeginDrag={() => {
            pauseNow();
            if (rotateTimerRef.current) {
              clearTimeout(rotateTimerRef.current);
              rotateTimerRef.current = null;
            }
            cancelAnimation(progress);
            progress.value = 0;
            disableParentScroll();
          }}
          onScrollEndDrag={enableParentScroll}
          getItemLayout={(_, idx) => ({
            length: containerWidth,
            offset: containerWidth * idx,
            index: idx,
          })}
          decelerationRate="fast"
          snapToInterval={containerWidth}
          extraData={containerWidth}
        />
      </View>

      {/* Dots + Pause/Play */}
      <View style={styles.dotsRow}>
        <View style={{ width: 28 }} />
        <View style={styles.dotsInner}>
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
                    backgroundColor: active ? s.accent : Colors.dark.chipBackgroundStrong,
                  },
                ]}
              />
            );
          })}
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setUserPaused((p) => {
              const next = !p;
              AsyncStorage.setItem(
                USER_PAUSED_STORAGE_KEY,
                next ? "1" : "0"
              ).catch(() => {});
              return next;
            });
          }}
          accessibilityRole="button"
          accessibilityLabel={userPaused ? "Resume rotation" : "Pause rotation"}
          style={styles.pauseBtn}
        >
          <Ionicons
            name={userPaused ? "play" : "pause"}
            size={12}
            color={TextColors.secondary}
          />
        </Pressable>
      </View>

      {sessionSoon ? (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={11} color={Colors.dark.accentText} />
          <Text style={styles.lockText}>SESSION SOON</Text>
        </View>
      ) : null}
    </View>
    </HeroPillContext.Provider>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    width: "100%",
  },
  progressTrack: {
    marginHorizontal: Spacing.lg,
    height: 3,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressFill: {
    height: "100%",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginTop: 8,
    marginBottom: Spacing.sm,
  },
  dotsInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  pauseBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.chipBackgroundStrong,
  },
  lockBadge: {
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.dark.accentTextSoft,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
  lockText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.accentText,
    letterSpacing: 0.5,
  },
  // Lens shell
  lensShellOuter: {
    flex: 1,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadius.lg,
  },
  lensShell: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    backgroundColor: Backgrounds.glass,
    overflow: "hidden",
  },
  lensTopHighlight: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    height: 1,
    opacity: 0.55,
  },
  lensInner: {
    flex: 1,
    padding: Spacing.lg,
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
    borderWidth: 1,
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
    backgroundColor: Colors.dark.chipBackground,
  },
  ctaSecondaryText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
  },
  jumpPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  jumpPillText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  jumpPillSpacer: {
    flex: 1,
  },
  slotHeaderStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
}));

const openMatchHeroStyles = makeReactiveStyles(() => StyleSheet.create({
  hostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 2,
  },
  avatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.chipBackground,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
}));
