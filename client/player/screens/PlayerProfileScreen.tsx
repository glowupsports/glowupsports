import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { useTranslation } from "react-i18next";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform, Linking, Switch, Image as RNImage, Modal, FlatList, DimensionValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, CardStyles, GlowColors, TextColors } from "@/constants/theme";
import { Skeleton, SkeletonCard } from "@/components/SkeletonLoader";
import { LinearGradient } from "expo-linear-gradient";
import { useAppMode } from "@/context/AppModeContext";
import { useAuth } from "@/coach/context/AuthContext";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import PinEntryModal from "@/components/PinEntryModal";
import { GlowRankBadge } from "@/components/GlowLevelBadge";
import { apiRequest, getApiUrl, buildPhotoUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth";
import { usePlayer } from "@/player/context/PlayerContext";
import { SportBadge } from "@/components/SportBadge";
import { SPORTS, getSportConfig, getSportSkillLevelColor } from "@shared/sportConfig";

import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";
import { usePlayerAppearance, type PlayerAppearancePreference } from "@/player/context/PlayerAppearanceContext";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import PlayerDNACard from "@/player/components/PlayerDNACard";
import AchievementCelebrationModal from "@/player/components/AchievementCelebrationModal";
import { useAchievementCelebration } from "@/player/hooks/useAchievementCelebration";
import {
  getHealthConnectionState,
  setHealthConnected,
  requestHealthPermissions,
  type HealthConnectionState,
} from "@/player/services/healthService";
import LogMatchModal from "@/player/components/LogMatchModal";
type SportProfileRecord = Record<string, { ballLevel?: string | null; skillLevel?: string | null; category?: string | null; rating?: string | null }>;

interface AchievementItem {
  id: string;
  name: string;
  description: string;
  category: string;
  iconName: string;
  iconColor: string;
  rarity: string;
  rewardType: string;
  rewardLabel: string;
  earned: boolean;
  earnedAt: string | null;
  rewardClaimed: boolean;
  rewardClaimedAt: string | null;
  currentProgress: number;
  sessionsAway: number;
  triggerThreshold: number;
  triggerStat: string;
  sortOrder: number;
}

interface PersonalRecord {
  id: string;
  label: string;
  value: number;
  unit: string;
  icon: string;
  color: string;
  isNewPb: boolean;
  isPbLowerIsBetter?: boolean;
}

interface ProfileData {
  player: {
    id: string;
    name: string;
    email: string;
    level: number;
    xp: number;
    glowScore: number;
    ballLevel: string | null;
    streak: number;
    createdAt: string;
    dominantHand: string | null;
    backhandType: string | null;
    favoriteShot: string | null;
    tennisIdol: string | null;
    preferredPlayType: string | null;
    openToPlay: boolean;
    typicalPlayTimes: string[] | null;
    preferredCities: string[] | null;
    matchPreference: string | null;
    bio: string | null;
    displayName: string | null;
    profilePhotoUrl: string | null;
    playStyle: string | null;
    sportProfiles: SportProfileRecord | null;
    homeAddress?: string | null;
    homeLat?: number | null;
    homeLng?: number | null;
    skillTags?: string[] | null;
  };
  coach: {
    id: string;
    name: string;
    email?: string;
  } | null;
  academy: {
    id: string;
    name: string;
  } | null;
  stats: {
    sessionsAttended: number;
    sessionsTotal: number;
    sessionsCharged?: number;
    sessionsUncharged?: number;
    unchargedReasons?: { reason: string; count: number }[];
    attendanceRate: number;
  };
  social: {
    matchesPlayed: number;
    recentPartners: { id: string; name: string; lastPlayedAt: string }[];
    connectionsCount: number;
  };
  // Task #1039 — Cross-Country Ladders. Optional list of country-ladder ranks
  // for sports the player participates in.
  countryLadders?: {
    sport: string;
    countryCode: string;
    position: number;
    ladderId: string;
    playerCount: number;
  }[];
}

function getLevelTitle(level: number): string {
  if (level < 5) return "Beginner";
  if (level < 10) return "Rising Star";
  if (level < 15) return "Intermediate";
  if (level < 20) return "Advanced";
  if (level < 30) return "Expert";
  return "Champion";
}

function getBallLevelColor(ballLevel: string): string {
  switch (ballLevel.toLowerCase()) {
    case "blue": return "#3B82F6";
    case "red": return Colors.dark.ballRed;
    case "orange": return Colors.dark.ballOrange;
    case "green": return Colors.dark.ballGreen;
    case "yellow": return Colors.dark.ballYellow;
    case "adult":
    case "glow": return "#00E5FF"; // Cyan for adult players
    default: return Colors.dark.primary;
  }
}

interface GroupData {
  id: string;
  name: string;
  memberCount: number;
  type: string;
}

interface ConnectionData {
  id: string;
  player: { id: string; name: string; level: number; photoUrl?: string } | null;
  status: string;
}

interface ConnectionsResponse {
  friends: ConnectionData[];
  pendingReceived: ConnectionData[];
  pendingSent: ConnectionData[];
}

interface BadgeData {
  id: string;
  name: string;
  description: string;
  iconName: string;
  iconColor: string;
  rarity: string;
  category: string;
  earnedAt?: string;
}

interface TitleData {
  id: string;
  name: string;
  description: string;
  rarity: string;
  unlockedAt?: string;
  isEquipped?: boolean;
}

const RARITY_COLORS: Record<string, string> = {
  common: Colors.dark.textMuted,
  uncommon: Colors.dark.primary,
  rare: Colors.dark.primary,
  epic: "#9B59B6",
  legendary: Colors.dark.orange,
};

type PlayStyleKey = "baseline_warrior" | "net_ninja" | "serve_machine" | "all_court_ace" | "counter_puncher" | "tactical_mastermind";

const PLAY_STYLE_META: Record<PlayStyleKey, { name: string; color: string; icon: string }> = {
  baseline_warrior: { name: "Baseline Warrior", color: Colors.dark.accentText, icon: "tennisball" },
  net_ninja: { name: "Net Ninja", color: "#00E5FF", icon: "flash" },
  serve_machine: { name: "Serve Machine", color: "#FF8C00", icon: "rocket" },
  all_court_ace: { name: "All-Court Ace", color: TextColors.primary, icon: "star" },
  counter_puncher: { name: "Counter-Puncher", color: "#9B59B6", icon: "shield" },
  tactical_mastermind: { name: "Tactical Mastermind", color: "#FFD700", icon: "bulb" },
};

const ALL_ARCHETYPES: PlayStyleKey[] = ["baseline_warrior", "net_ninja", "serve_machine", "all_court_ace", "counter_puncher", "tactical_mastermind"];

type ProfileTab = "moments" | "friends" | "groups" | "matches";

interface SportProfilesSectionProps {
  sportProfiles: SportProfileRecord | null;
  onUpdateSports: (updatedProfiles: SportProfileRecord) => void;
  isSaving: boolean;
}

function SportProfilesSection({ sportProfiles, onUpdateSports, isSaving }: SportProfilesSectionProps) {
  const activeSports = sportProfiles ? Object.keys(sportProfiles) : [];
  const hasNoSports = activeSports.length === 0;

  const handleToggleSport = (sport: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentProfiles = sportProfiles || {};
    if (activeSports.includes(sport)) {
      const updated = { ...currentProfiles };
      delete updated[sport];
      onUpdateSports(updated);
    } else {
      const updated = { ...currentProfiles, [sport]: currentProfiles[sport] || {} };
      onUpdateSports(updated);
    }
  };

  if (hasNoSports) {
    return (
      <View style={sportSectionStyles.emptyCard}>
        <Ionicons name="tennisball-outline" size={32} color={Colors.dark.primary} />
        <Text style={sportSectionStyles.emptyTitle}>Which sports do you play?</Text>
        <Text style={sportSectionStyles.emptySubtitle}>Select the sports you participate in</Text>
        <View style={sportSectionStyles.sportToggleRow}>
          {SPORTS.map((sport) => {
            const cfg = getSportConfig(sport);
            return (
              <Pressable
                key={sport}
                style={[sportSectionStyles.sportToggleCard]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onUpdateSports({ [sport]: {} });
                }}
                disabled={isSaving}
              >
                <Ionicons name={cfg.icon as IoniconsName} size={28} color={cfg.color} />
                <Text style={[sportSectionStyles.sportToggleName, { color: cfg.color }]}>{cfg.displayName}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={sportSectionStyles.card}>
      <View style={sportSectionStyles.sportChipsRow}>
        {SPORTS.map((sport) => {
          const cfg = getSportConfig(sport);
          const isActive = activeSports.includes(sport);
          return (
            <Pressable
              key={sport}
              style={[
                sportSectionStyles.sportChip,
                isActive && { borderColor: cfg.color, backgroundColor: cfg.color + "20" },
              ]}
              onPress={() => handleToggleSport(sport)}
              disabled={isSaving}
            >
              <Ionicons name={cfg.icon as IoniconsName} size={14} color={isActive ? cfg.color : Colors.dark.textMuted} />
              <Text style={[sportSectionStyles.sportChipText, isActive && { color: cfg.color }]}>
                {cfg.displayName}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeSports.map((sport) => {
        const cfg = getSportConfig(sport);
        const profile = sportProfiles?.[sport] || {};
        const rawLevel = profile[cfg.profileField as keyof typeof profile] as string | null | undefined;
        const hasLevel = !!rawLevel;
        const levelLabel = hasLevel ? (getSportConfig(sport).skillLevels.find(l => l.key === rawLevel)?.label ?? rawLevel) : null;
        const levelColor = hasLevel ? getSportSkillLevelColor(sport, rawLevel) : null;

        return (
          <View key={sport} style={sportSectionStyles.sportRow}>
            <View style={sportSectionStyles.sportRowLeft}>
              <View style={[sportSectionStyles.sportIconCircle, { backgroundColor: cfg.color + "20" }]}>
                <Ionicons name={cfg.icon as IoniconsName} size={18} color={cfg.color} />
              </View>
              <Text style={sportSectionStyles.sportRowName}>{cfg.displayName}</Text>
            </View>
            <View style={sportSectionStyles.sportRowRight}>
              {hasLevel ? (
                <View style={[sportSectionStyles.levelBadge, { backgroundColor: (levelColor || cfg.color) + "25", borderColor: levelColor || cfg.color }]}>
                  <Text style={[sportSectionStyles.levelBadgeText, { color: levelColor || cfg.color }]}>
                    {levelLabel}
                  </Text>
                </View>
              ) : (
                <View style={sportSectionStyles.awaitingBadge}>
                  <Ionicons name="hourglass-outline" size={12} color={Colors.dark.textMuted} />
                  <Text style={sportSectionStyles.awaitingText}>Awaiting coach assessment</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const sportSectionStyles = makeReactiveStyles(() => StyleSheet.create({
  emptyCard: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  sportToggleRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  sportToggleCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
    gap: Spacing.xs,
  },
  sportToggleName: {
    ...Typography.caption,
    fontWeight: "700",
  },
  card: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  sectionTitle: {
    color: Colors.dark.text,
    fontWeight: "700",
  },
  sportChipsRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    flexWrap: "wrap",
  },
  sportChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  sportChipText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  sportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  sportRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sportIconCircle: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  sportRowName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sportRowRight: {
    alignItems: "flex-end",
  },
  levelBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  levelBadgeText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  awaitingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  awaitingText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
}));

// All skill tag options drawn from PLAYSTYLE_SKILL_TAGS (Task #1617)
const ALL_SKILL_TAGS = [
  "Deep Groundstrokes", "Consistency", "Endurance",
  "Net Play", "Volleys", "Approach Shots",
  "Strong Serve", "First Strike", "Power",
  "Versatility", "All-Court", "Adaptability",
  "Defense", "Counter Punching", "Speed",
  "Placement", "Strategy", "Spin Variation",
];

interface MyStrengthsSectionProps {
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  isSaving: boolean;
}

function MyStrengthsSection({ selectedTags, onToggleTag, isSaving }: MyStrengthsSectionProps) {
  return (
    <View style={strengthStyles.card}>
      <Text style={strengthStyles.hint}>Pick up to 3 tags that best describe your game</Text>
      <View style={strengthStyles.tagsWrap}>
        {ALL_SKILL_TAGS.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          const atLimit = selectedTags.length >= 3 && !isSelected;
          return (
            <Pressable
              key={tag}
              style={[
                strengthStyles.tag,
                isSelected && strengthStyles.tagSelected,
                atLimit && strengthStyles.tagDisabled,
              ]}
              onPress={() => {
                if (atLimit) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onToggleTag(tag);
              }}
              disabled={isSaving}
            >
              {isSelected ? (
                <Ionicons name="checkmark-circle" size={13} color={Colors.dark.primary} />
              ) : null}
              <Text style={[strengthStyles.tagText, isSelected && strengthStyles.tagTextSelected]}>
                {tag}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {selectedTags.length > 0 ? (
        <Text style={strengthStyles.selectedCount}>{selectedTags.length} / 3 selected</Text>
      ) : null}
    </View>
  );
}

const strengthStyles = makeReactiveStyles(() => StyleSheet.create({
  card: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  hint: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  tagSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "18",
  },
  tagDisabled: {
    opacity: 0.4,
  },
  tagText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  tagTextSelected: {
    color: Colors.dark.primary,
  },
  selectedCount: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "right",
  },
}));

export default function PlayerProfileScreen() {
  useThemeReactivity();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const track = useTrackFeature();
  const { setMode } = useAppMode();
  const { logout, isGuest } = useAuth();
  const { preference: appearancePref, setPreference: setAppearancePref } = usePlayerAppearance();
  // Task #1465 — pull the in-memory player snapshot so the avatar / level
  // badge / ball-level chip can paint on first frame instead of waiting
  // for the profile god-route. Mirrors the ProPlayerHomeScreen pattern.
  const playerCtx = usePlayer();
  const { isBirthday } = playerCtx;
  const [showPinModal, setShowPinModal] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("moments");
  const [showLogMatchModal, setShowLogMatchModal] = useState(false);
  const [showTitlesModal, setShowTitlesModal] = useState(false);
  const [showPlayStyleModal, setShowPlayStyleModal] = useState(false);
  const { celebrationAchievement, onCloseCelebration, enqueueNewlyEarned } = useAchievementCelebration(playerCtx.playerId ?? "");
  const [achievementsExpanded, setAchievementsExpanded] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<AchievementItem | null>(null);
  const queryClient = useQueryClient();

  const [healthState, setHealthState] = useState<HealthConnectionState | null>(null);
  const [healthConnecting, setHealthConnecting] = useState(false);
  const [showHealthDisclaimer, setShowHealthDisclaimer] = useState(false);

  const loadHealthState = useCallback(async () => {
    const state = await getHealthConnectionState();
    setHealthState(state);
  }, []);

  useEffect(() => {
    loadHealthState();
  }, [loadHealthState]);

  const handleHealthToggle = useCallback(async (value: boolean) => {
    if (!value) {
      await setHealthConnected(false);
      setHealthState((prev) => prev ? { ...prev, connected: false, lastSyncedAt: null } : prev);
      return;
    }
    setShowHealthDisclaimer(true);
  }, []);

  const handleHealthConnect = useCallback(async () => {
    setShowHealthDisclaimer(false);
    setHealthConnecting(true);
    try {
      const granted = await requestHealthPermissions();
      if (granted) {
        await setHealthConnected(true);
        setHealthState((prev) => prev ? { ...prev, connected: true } : prev);
      } else {
        Alert.alert(
          "Not Available",
          Platform.OS === "ios"
            ? "Apple Health requires the full Glow app (not Expo Go). Download the app to connect."
            : "Google Health Connect requires the full Glow app (not Expo Go). Download the app to connect.",
          [{ text: "OK" }],
        );
      }
    } finally {
      setHealthConnecting(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Data queries — god-endpoint pattern (Task #1387)
  //
  // The Profile tab used to fan ELEVEN parallel queries on mount.
  // We collapse to ONE call and derive every legacy variable name
  // from the response so the rest of this 2700-line file is unchanged.
  // ---------------------------------------------------------------------------
  interface DashboardCredits {
    total: number;
    group: number;
    private: number;
    semi_private: number;
  }
  interface V2LedgerEntry {
    id: string;
    type: string;
    delta: string | number;
    reason: string;
    balance_after: string | number;
    occurred_at: string;
    metadata?: Record<string, unknown> | null;
  }
  interface V2WalletData {
    v2Enabled: boolean;
    balance: { group: number; semi_private: number; private: number };
    activeLots: { id: string; type: string; qty_remaining: number; expires_at: string | null }[];
    recentLedger?: V2LedgerEntry[];
  }
  interface ProfileGodResponse {
    profile: ProfileData | null;
    groups: { myGroups: GroupData[]; discover: GroupData[] } | null;
    connections: ConnectionsResponse | null;
    dashboard: { credits?: DashboardCredits } | null;
    v2Wallet: V2WalletData | null;
    activeLiveMatch: {
      matches?: {
        id: string;
        sport: string;
        status: string;
        creatorId: string;
        opponentIds: string[];
      }[];
    } | null;
    badges: BadgeData[] | null;
    titles: TitleData[] | null;
    playerOfWeek: {
      awards: { scope: string; scopeId: string; weekStart: string; xp: number }[];
    } | null;
    vacation: {
      activeVacation?: { id: string; startDate: string; endDate: string };
      upcomingVacation?: { id: string; startDate: string; endDate: string };
    } | null;
    achievements: {
      achievements: AchievementItem[];
      newlyEarned: string[];
      stats: Record<string, number>;
    } | null;
    personalRecords: {
      records: PersonalRecord[];
    } | null;
    _keys: { v2Wallet: string; playerOfWeek: string };
    // Per-branch sub-fetch failures (key presence = failure; value is
    // HTTP status or null for thrown errors). Used by the retry-card
    // guard to distinguish a silent profile-branch failure from a
    // genuinely-onboarding user.
    _errors?: Record<string, number | null>;
  }

  const {
    data: profileGodData,
    isLoading: profileGodIsLoading,
    isError: profileGodIsError,
    refetch: refetchProfileGod,
  } = useQuery<ProfileGodResponse>({
    queryKey: ["/api/player/me/profile-data"],
    enabled: !isGuest,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const url = new URL("/api/player/me/profile-data", getApiUrl());
      const r = await apiRequest("GET", url.toString());
      return r.json();
    },
  });

  // Derived aliases — preserve every variable name the render body
  // already uses so the change set stays minimal.
  const data = profileGodData?.profile ?? undefined;
  const isLoading = profileGodIsLoading;
  // Surface a silent profile-branch failure as retryable error
  // instead of the misleading "Profile not set up" empty state. We
  // check key PRESENCE on `_errors`, not truthiness, because a
  // thrown sub-fetch records `httpStatus: null` (falsy).
  const profileBranchFailed = !!(
    profileGodData?._errors && "profile" in profileGodData._errors
  );
  const error =
    profileGodIsError || profileBranchFailed
      ? new Error("profile-data failed")
      : null;
  const refetch = refetchProfileGod;
  const groupsData = profileGodData?.groups ?? undefined;
  const connectionsData = profileGodData?.connections ?? undefined;
  const dashboardData = profileGodData?.dashboard ?? undefined;
  const v2Wallet = profileGodData?.v2Wallet ?? undefined;
  const v2Enabled = v2Wallet?.v2Enabled === true;
  const v2Total = v2Enabled
    ? (v2Wallet!.balance.group || 0) +
      (v2Wallet!.balance.semi_private || 0) +
      (v2Wallet!.balance.private || 0)
    : 0;
  const v2NextExpiry = v2Enabled
    ? v2Wallet!.activeLots
        .filter((l) => l.expires_at)
        .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime())[0]
    : null;
  const v2RecentLedger: V2LedgerEntry[] = v2Enabled
    ? (v2Wallet?.recentLedger ?? []).slice(0, 5)
    : [];

  // 10s scoreboard polling. Seeded from god-payload via initialData
  // so cold-start fires zero extra network calls; refetchInterval
  // takes over after staleTime.
  const liveMatchSeed = profileGodData?.activeLiveMatch ?? { matches: [] };
  const { data: activeLiveMatch } = useQuery<{ matches?: { id: string; sport: string; status: string; creatorId: string; opponentIds: string[] }[] }>({
    queryKey: ["/api/live-scoring/player/me/active"],
    enabled: !!profileGodData,
    initialData: liveMatchSeed,
    initialDataUpdatedAt: () => Date.now(),
    refetchInterval: 10000,
    staleTime: 8000,
  });

  const badgesData = profileGodData?.badges ?? undefined;
  const titlesData = profileGodData?.titles ?? undefined;
  const powData = profileGodData?.playerOfWeek ?? undefined;
  const latestPowAward = powData?.awards?.[0] ?? null;

  const equippedTitle = titlesData?.find(t => t.isEquipped);
  const earnedBadges = badgesData || [];
  const unlockedTitles = titlesData || [];

  const vacationData = profileGodData?.vacation ?? undefined;
  const achievementsData = profileGodData?.achievements ?? undefined;
  const personalRecordsData = profileGodData?.personalRecords ?? undefined;

  // Trigger celebration modal for newly earned achievements via the shared hook
  // (AsyncStorage-backed so each achievement celebrates at most once across screens)
  useEffect(() => {
    const newlyEarned = achievementsData?.newlyEarned ?? [];
    enqueueNewlyEarned(newlyEarned, achievementsData?.achievements ?? []);
  }, [achievementsData?.newlyEarned]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prime each legacy queryKey so downstream consumers (PlayerOfWeekChip,
  // BadgeStrip, TitleStrip, holiday banners, child Family screens) hit
  // cache instead of issuing their own request. The activeLiveMatch
  // useQuery is also seeded so its first render shows live data.
  useEffect(() => {
    if (!profileGodData) return;
    const setIfPresent = <T,>(key: unknown[], value: T | null | undefined) => {
      if (value !== undefined && value !== null) {
        queryClient.setQueryData(key, value);
      }
    };
    setIfPresent(["/api/player/me/profile"], profileGodData.profile);
    setIfPresent(["/api/player/groups"], profileGodData.groups);
    setIfPresent(["/api/player/connections"], profileGodData.connections);
    setIfPresent(["/api/player/me/dashboard"], profileGodData.dashboard);
    setIfPresent(["/api/player/badges"], profileGodData.badges);
    setIfPresent(["/api/player/titles"], profileGodData.titles);
    setIfPresent(["/api/player/me/vacation"], profileGodData.vacation);
    setIfPresent(
      ["/api/live-scoring/player/me/active"],
      profileGodData.activeLiveMatch,
    );
    if (profileGodData._keys?.v2Wallet) {
      setIfPresent([profileGodData._keys.v2Wallet], profileGodData.v2Wallet);
    }
    if (profileGodData._keys?.playerOfWeek) {
      setIfPresent(
        [profileGodData._keys.playerOfWeek],
        profileGodData.playerOfWeek,
      );
    }
  }, [profileGodData, queryClient]);

  const { data: seasonData } = useQuery<{
    currentSeason: {
      enrollmentId: string;
      startedAt: string;
      seasonId: string;
      seasonName: string;
      seasonStartDate: string;
      seasonIsActive: boolean;
      sessionCount: number;
      creditsUsed: number;
    } | null;
    history: {
      enrollmentId: string;
      startedAt: string;
      endedAt: string | null;
      seasonName: string;
      seasonStartDate: string;
      sessionCount: number;
      creditsUsed: number;
    }[];
  }>({
    queryKey: ["/api/player/me/season"],
    enabled: !isGuest,
    staleTime: 5 * 60 * 1000,
  });

  const holidaysSubtitle = useMemo(() => {
    const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (vacationData?.activeVacation) {
      return t("player.profile.holidays.subtitleActive", { date: fmt(vacationData.activeVacation.endDate) });
    }
    if (vacationData?.upcomingVacation) {
      return t("player.profile.holidays.subtitleUpcoming", {
        start: fmt(vacationData.upcomingVacation.startDate),
        end: fmt(vacationData.upcomingVacation.endDate),
      });
    }
    return t("player.profile.holidays.subtitleNone");
  }, [vacationData, t]);

  // Task #1387 — every Profile mutation must invalidate the god-key
  // alongside the legacy keys. Otherwise an in-screen edit (open-to-play
  // toggle, play-style change, title equip) would leave the screen
  // showing the pre-edit god-payload until the next remount.
  const equipTitle = useMutation({
    mutationFn: async (titleId: string) => {
      return apiRequest("POST", `/api/player/titles/${titleId}/equip`);
    },
    onSuccess: () => {
      track("collection:equip_title");
      queryClient.invalidateQueries({ queryKey: ["/api/player/titles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile-data"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowTitlesModal(false);
    },
  });

  const toggleOpenToPlay = useMutation({
    mutationFn: async (newValue: boolean) => {
      return apiRequest("PATCH", "/api/player/me/profile", { openToPlay: newValue });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile-data"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const updatePlayStyle = useMutation({
    mutationFn: async (playStyle: PlayStyleKey | null) => {
      return apiRequest("PATCH", "/api/player/me/profile", { playStyle });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile-data"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowPlayStyleModal(false);
    },
    onError: () => {
      Alert.alert("Error", "Could not update play style. Please try again.");
    },
  });

  const updateSportProfiles = useMutation({
    mutationFn: async (updatedProfiles: SportProfileRecord) => {
      return apiRequest("PATCH", "/api/player/me/profile", { sportProfiles: updatedProfiles });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile-data"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Could not update sport profile. Please try again.");
    },
  });

  const updateSkillTags = useMutation({
    mutationFn: async (tags: string[]) => {
      return apiRequest("PATCH", "/api/player/me/profile", { skillTags: tags });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile-data"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Could not update strengths. Please try again.");
    },
  });

  // Task #1566 — Claim reward from the badge detail sheet.
  // This ensures rewards earned via the celebration modal's "Claim Later" path
  // (or never celebrated) always have a reachable claim action in the profile.
  const claimAchievementMutation = useMutation({
    mutationFn: async (achievementId: string) => {
      return apiRequest("POST", `/api/player/achievements/${achievementId}/claim`);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/achievements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile-data"] });
      setSelectedBadge(null);
    },
    onError: () => {
      Alert.alert("Claim failed", "Could not claim reward. Please try again.");
    },
  });

  const handleChangePhoto = async () => {
    if (Platform.OS === "web") {
      navigation.navigate("EditProfile" as never);
      return;
    }
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission Required", "Please allow access to your photo library to change your profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      setIsUploadingPhoto(true);
      const asset = result.assets[0];
      
      const formData = new FormData();
      const filename = asset.uri.split("/").pop() || "photo.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : "image/jpeg";

      const { appendImageToFormData } = await import("@/lib/uploads");
      await appendImageToFormData(formData, "photo", asset.uri, type);

      const token = getAuthToken();
      
      const response = await fetch(`${getApiUrl()}/api/player/me/photo`, {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        const { parseUploadErrorResponse } = await import("@/lib/uploads");
        const { message } = await parseUploadErrorResponse(
          response,
          "Failed to upload photo. Please try again.",
        );
        throw new Error(message);
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      // Task #1387 — also bust the god-key so the new avatar shows up
      // immediately in the same render cycle.
      await queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile-data"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Profile photo updated!");
    } catch (error: unknown) {
      console.error("Error uploading photo:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to upload photo. Please try again.";
      Alert.alert("Photo upload failed", message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            logout();
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account?\n\nThis will immediately erase all your data including XP, progress, match history, and profile information. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "This is your last chance. Your account and all data will be permanently deleted right now. Are you absolutely sure?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete My Account",
                  style: "destructive",
                  onPress: async () => {
                    setDeleteLoading(true);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    try {
                      await apiRequest("DELETE", "/api/player/me/account", undefined);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      logout();
                    } catch (error) {
                      const errMsg = error instanceof Error ? error.message : "Failed to delete account";
                      Alert.alert("Error", errMsg);
                      setDeleteLoading(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  if (isGuest) {
    type GuestIconName = React.ComponentProps<typeof Ionicons>["name"];
    const guestFeatures: { icon: GuestIconName; text: string }[] = [
      { icon: "trending-up", text: "Track your XP, levels & skill progress" },
      { icon: "calendar", text: "Book sessions & manage your schedule" },
      { icon: "people", text: "Join groups, make friends & play matches" },
      { icon: "trophy", text: "Earn badges, complete quests & climb the ladder" },
    ];
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, paddingHorizontal: Spacing.xl }]}>
        <View style={styles.guestAvatarRing}>
          <Ionicons name="person" size={52} color={Colors.dark.primary} />
        </View>
        <Text style={styles.guestBrand}>Glow Up Sports</Text>
        <Text style={styles.guestTitle}>Browsing as Guest</Text>
        <Text style={styles.guestSubtitle}>Create a free account to unlock the full experience</Text>
        <View style={styles.guestFeatureList}>
          {guestFeatures.map((f) => (
            <View key={f.text} style={styles.guestFeatureRow}>
              <Ionicons name={f.icon} size={18} color={Colors.dark.primary} />
              <Text style={styles.guestFeatureText}>{f.text}</Text>
            </View>
          ))}
        </View>
        <Pressable
          style={({ pressed }) => [styles.guestCta, { opacity: pressed ? 0.85 : 1 }]}
          onPress={logout}
        >
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.primaryGlow || "#9AE66E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.guestCtaGradient}
          >
            <Ionicons name="person-add-outline" size={20} color={Colors.dark.buttonText} />
            <Text style={styles.guestCtaText}>Create Account / Sign In</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  // Task #1465 — Progressive shell. Replaces the old full-screen skeleton
  // gate so the avatar / level badge / ball-level chip paint on first
  // frame using the cached PlayerContext snapshot. Per-block skeletons
  // stand in for badges / packages / connections cards until the profile
  // god-route lands; the existing main render below takes over once data
  // is ready.
  if (isLoading && !data) {
    const shellBallLevel = playerCtx.ballLevel || "red";
    const shellBallColor = getBallLevelColor(shellBallLevel);
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header card — avatar + level badge from PlayerContext, name
              and title swap in once the god-route resolves. */}
          <View style={styles.headerCard}>
            <View style={styles.header}>
              <View style={styles.avatarSection}>
                <View style={styles.avatarContainer}>
                  <LinearGradient
                    colors={[shellBallColor, Colors.dark.primary]}
                    style={styles.avatarGradient}
                  >
                    <View style={styles.avatarInner}>
                      <Ionicons name="person" size={48} color={Colors.dark.text} />
                    </View>
                  </LinearGradient>
                  <View style={[styles.levelBadgeOverlay, { backgroundColor: shellBallColor }]}>
                    <Text style={styles.levelBadgeText}>{playerCtx.level}</Text>
                  </View>
                </View>
                <View style={{ marginTop: Spacing.md, alignItems: "center" }}>
                  <Skeleton width={160} height={22} />
                  <Skeleton width={100} height={14} style={{ marginTop: Spacing.sm }} />
                </View>
              </View>
              <View style={styles.badges}>
                <View style={[styles.ballBadge, { borderColor: shellBallColor }]}>
                  <View style={[styles.ballDot, { backgroundColor: shellBallColor }]} />
                  <Text style={[styles.ballText, { color: shellBallColor }]}>
                    {shellBallLevel.charAt(0).toUpperCase() + shellBallLevel.slice(1)} Ball
                  </Text>
                </View>
                <GlowRankBadge glowRank={playerCtx.glowRank} size="sm" />
              </View>
            </View>
          </View>

          {/* Per-block skeletons for stats / packages / connections cards. */}
          <View style={styles.profileSkeletonRow}>
            <Skeleton width="30%" height={70} borderRadius={BorderRadius.md} />
            <Skeleton width="30%" height={70} borderRadius={BorderRadius.md} />
            <Skeleton width="30%" height={70} borderRadius={BorderRadius.md} />
          </View>
          <View style={styles.profileSkeletonSection}>
            <SkeletonCard />
            <SkeletonCard style={{ marginTop: Spacing.md }} />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, paddingHorizontal: Spacing.xl }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Unable to load profile</Text>
        <Text style={styles.errorSubtext}>Please check your connection and try again</Text>
        <Pressable
          style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => refetch()}
        >
          <Ionicons name="refresh" size={18} color={Colors.dark.buttonText} />
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.signOutButton, { opacity: pressed ? 0.7 : 1 }]}
          onPress={logout}
        >
          <Ionicons name="log-out-outline" size={16} color={Colors.dark.error} />
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </Pressable>
      </View>
    );
  }

  if (!data || !data.player) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, paddingHorizontal: Spacing.xl }]}>
        <Ionicons name="person-circle-outline" size={64} color={Colors.dark.textMuted} />
        <Text style={styles.errorText}>Profile not set up</Text>
        <Text style={styles.errorSubtext}>Your account exists but has no player profile yet. Contact support or sign in again.</Text>
        <Pressable
          style={({ pressed }) => [styles.signOutButton, { opacity: pressed ? 0.7 : 1 }]}
          onPress={logout}
        >
          <Ionicons name="log-out-outline" size={16} color={Colors.dark.error} />
          <Text style={styles.signOutButtonText}>Sign Out & Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const { player, coach, academy, stats } = data;
  const ballColor = getBallLevelColor(player.ballLevel || "red");
  const memberSince = new Date(player.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const _handleSwitchToCoach = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode("coach");
  };

  const ballLevel = player.ballLevel || "red";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
        <View style={styles.header}>
          <Pressable
            style={styles.editProfileBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("EditProfile");
            }}
          >
            <Ionicons name="create-outline" size={22} color={Colors.dark.primary} />
          </Pressable>
          <View style={styles.avatarSection}>
            <Pressable 
              style={styles.avatarContainer} 
              onPress={handleChangePhoto}
              disabled={isUploadingPhoto}
            >
              {player.profilePhotoUrl ? (
                Platform.OS === 'web' ? (
                  <RNImage
                    source={{ uri: buildPhotoUrl(player.profilePhotoUrl)! }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={{ uri: buildPhotoUrl(player.profilePhotoUrl)! }}
                    style={styles.avatarImage}
                    contentFit="cover"
                  />
                )
              ) : (
                <LinearGradient
                  colors={[ballColor, Colors.dark.primary]}
                  style={styles.avatarGradient}
                >
                  <View style={styles.avatarInner}>
                    <Text style={styles.avatarText}>{player.name.charAt(0)}</Text>
                  </View>
                </LinearGradient>
              )}
              <View style={[styles.levelBadgeOverlay, { backgroundColor: ballColor }]}>
                <Text style={styles.levelBadgeText}>{player.level}</Text>
              </View>
              <View style={styles.cameraIconOverlay}>
                {isUploadingPhoto ? (
                  <TennisBallSpinner size="small" color={Colors.dark.text} />
                ) : (
                  <Ionicons name="camera" size={16} color={Colors.dark.text} />
                )}
              </View>
            </Pressable>
            <Text style={styles.playerName}>{player.name}</Text>
            <Pressable 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowTitlesModal(true);
              }}
            >
              <Text style={styles.levelTitle}>
                {equippedTitle ? equippedTitle.name : getLevelTitle(player.level)}
              </Text>
            </Pressable>
            {data?.countryLadders && data.countryLadders.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 6 }}>
                {data.countryLadders.map((cl) => (
                  <View
                    key={cl.ladderId}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: "rgba(108, 164, 255, 0.18)",
                      borderWidth: 1,
                      borderColor: "rgba(108, 164, 255, 0.35)",
                    }}
                  >
                    <Ionicons name="podium" size={11} color="#6CA4FF" />
                    <Text style={{ color: "#6CA4FF", fontSize: 11, fontWeight: "600" }}>
                      {`${cl.countryCode} · ${cl.sport[0].toUpperCase()}${cl.sport.slice(1)} #${cl.position}`}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {equippedTitle && (
              <View style={[styles.titleBadge, { borderColor: RARITY_COLORS[equippedTitle.rarity] || RARITY_COLORS.common }]}>
                <Ionicons name="ribbon" size={12} color={RARITY_COLORS[equippedTitle.rarity] || RARITY_COLORS.common} />
                <Text style={[styles.titleBadgeText, { color: RARITY_COLORS[equippedTitle.rarity] || RARITY_COLORS.common }]}>
                  {equippedTitle.rarity.charAt(0).toUpperCase() + equippedTitle.rarity.slice(1)}
                </Text>
              </View>
            )}
            {latestPowAward ? (
              <View style={[styles.titleBadge, { borderColor: "#FFD700" }]} testID="badge-player-of-week">
                <Ionicons name="trophy" size={12} color="#FFD700" />
                <Text style={[styles.titleBadgeText, { color: "#FFD700" }]}>
                  {latestPowAward.scope === "country"
                    ? `Country PoW · ${latestPowAward.scopeId}`
                    : "Academy PoW"}
                </Text>
              </View>
            ) : null}

            {player.playStyle && PLAY_STYLE_META[player.playStyle as PlayStyleKey] ? (
              <Pressable
                style={[styles.playStyleBadge, { borderColor: PLAY_STYLE_META[player.playStyle as PlayStyleKey].color + "60" }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowPlayStyleModal(true);
                }}
              >
                <Ionicons
                  name={PLAY_STYLE_META[player.playStyle as PlayStyleKey].icon as IoniconsName}
                  size={13}
                  color={PLAY_STYLE_META[player.playStyle as PlayStyleKey].color}
                />
                <Text style={[styles.playStyleBadgeText, { color: PLAY_STYLE_META[player.playStyle as PlayStyleKey].color }]}>
                  {PLAY_STYLE_META[player.playStyle as PlayStyleKey].name}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.playStyleSetPrompt}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowPlayStyleModal(true);
                }}
              >
                <Ionicons name="add-circle-outline" size={13} color={Colors.dark.textMuted} />
                <Text style={styles.playStyleSetPromptText}>Set your play style</Text>
              </Pressable>
            )}
          </View>

          {earnedBadges.length > 0 && (
            <View style={styles.badgeShowcase}>
              <Text style={styles.badgeShowcaseTitle}>Badges</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.badgeScrollContent}
              >
                {earnedBadges.slice(0, 8).map((badge) => (
                  <Pressable 
                    key={badge.id} 
                    style={[styles.badgeItem, { borderColor: RARITY_COLORS[badge.rarity] || RARITY_COLORS.common }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      Alert.alert(badge.name, badge.description);
                    }}
                  >
                    <View style={[styles.badgeIconCircle, { backgroundColor: (badge.iconColor || RARITY_COLORS[badge.rarity]) + "20" }]}>
                      <Ionicons 
                        name={(badge.iconName || "star") as IoniconsName} 
                        size={20} 
                        color={badge.iconColor || RARITY_COLORS[badge.rarity]} 
                      />
                    </View>
                    <Text style={styles.badgeItemName} numberOfLines={1}>{badge.name}</Text>
                  </Pressable>
                ))}
                {earnedBadges.length > 8 && (
                  <View style={styles.moreBadges}>
                    <Text style={styles.moreBadgesText}>+{earnedBadges.length - 8}</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}

          <View style={styles.badges}>
            <View style={[styles.ballBadge, { borderColor: ballColor }]}>
              <View style={[styles.ballDot, { backgroundColor: ballColor }]} />
              <Text style={[styles.ballText, { color: ballColor }]}>
                {ballLevel.charAt(0).toUpperCase() + ballLevel.slice(1)} Ball
              </Text>
            </View>
            {player.sportProfiles && Object.keys(player.sportProfiles).length > 0 ? (
              Object.keys(player.sportProfiles).map((sport) => (
                <SportBadge key={sport} sport={sport} size="sm" />
              ))
            ) : null}
            <GlowRankBadge glowRank={playerCtx.glowRank} size="sm" />
            {isBirthday ? (
              <View style={styles.birthdayBadge}>
                <Text style={styles.birthdayIcon}>🎂</Text>
                <Text style={styles.birthdayText}>Birthday!</Text>
              </View>
            ) : null}
          </View>

          {/* Open to Play — compact inline pill */}
          <View style={styles.openToPlayPill}>
            <View style={[styles.openToPlayDot, { backgroundColor: player.openToPlay ? "#22C55E" : Colors.dark.textMuted }]} />
            <Text style={[styles.openToPlayPillText, { color: player.openToPlay ? "#22C55E" : Colors.dark.textMuted }]}>
              {player.openToPlay ? t("player.profile.openToPlay") : t("player.profile.offRadar")}
            </Text>
            <Switch
              value={player.openToPlay}
              onValueChange={(value) => toggleOpenToPlay.mutate(value)}
              trackColor={{ 
                false: Colors.dark.chipBackground, 
                true: "#22C55E80" 
              }}
              thumbColor={player.openToPlay ? "#22C55E" : Colors.dark.textMuted}
              disabled={toggleOpenToPlay.isPending}
            />
          </View>
        </View>
        </View>

        {/* Quick Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCol, { borderRightWidth: 1, borderRightColor: Colors.dark.border }]}>
            <Text style={styles.statColValue}>{player.streak}</Text>
            <Text style={styles.statColLabel}>{t("player.profile.streak")}</Text>
          </View>
          <View style={[styles.statCol, { borderRightWidth: 1, borderRightColor: Colors.dark.border }]}>
            <Text style={styles.statColValue}>
              {stats.sessionsCharged ?? stats.sessionsAttended}
            </Text>
            <Text style={styles.statColLabel}>{t("player.profile.sessions")}</Text>
            {stats.sessionsUncharged && stats.sessionsUncharged > 0 ? (
              <Text
                style={{
                  fontSize: 9,
                  color: Colors.dark.textMuted,
                  marginTop: 2,
                  textAlign: "center",
                }}
              >
                +{stats.sessionsUncharged} not charged
              </Text>
            ) : null}
          </View>
          <View style={[styles.statCol, { borderRightWidth: 1, borderRightColor: Colors.dark.border }]}>
            <Text style={styles.statColValue}>{data.social?.matchesPlayed ?? 0}</Text>
            <Text style={styles.statColLabel}>{t("player.profile.matches")}</Text>
          </View>
          <View style={styles.statCol}>
            <Text style={styles.statColValue}>{data.social?.connectionsCount ?? 0}</Text>
            <Text style={styles.statColLabel}>{t("player.profile.friends")}</Text>
          </View>
        </View>

        {/* Quick Actions Row */}
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.75 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("MatchHistory");
            }}
          >
            <Ionicons name="trophy-outline" size={20} color={Colors.dark.accentText} />
            <Text style={styles.actionCardLabel}>{t("player.profile.matchHistory")}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} style={{ alignSelf: "flex-end", marginTop: "auto" }} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.75 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (player?.id) {
                navigation.navigate("ParentCreditStore", { playerId: player.id });
              }
            }}
          >
            <Ionicons name="ticket-outline" size={20} color={Colors.dark.gold} />
            <Text style={styles.actionCardLabel}>{t("player.profile.myCredits")}</Text>
            <Text
              style={[
                styles.actionCardSub,
                v2Enabled && v2Total < 0 ? { color: Colors.dark.error, fontWeight: "800" } : null,
              ]}
              accessibilityLabel={
                v2Enabled && v2Total < 0
                  ? `${Math.abs(v2Total)} credits in debt`
                  : undefined
              }
            >
              {v2Enabled ? v2Total : (dashboardData?.credits?.total ?? 0)} {t("player.profile.creditsAvailable")}
            </Text>
            {v2Enabled && v2Total < 0 ? (
              <View
                style={{
                  marginTop: 4,
                  alignSelf: "flex-start",
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 4,
                  backgroundColor: Colors.dark.error,
                }}
              >
                <Text style={{ fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.4 }}>
                  DEBT
                </Text>
              </View>
            ) : null}
            {v2Enabled && v2NextExpiry?.expires_at ? (
              <Text style={[styles.actionCardSub, { fontSize: 10, color: Colors.dark.textMuted }]}>
                Next expiry {new Date(v2NextExpiry.expires_at).toLocaleDateString()}
              </Text>
            ) : null}

            {/* Explicit "Buy credits" CTA inside the wallet panel — only when
                the academy is on the V2 wallet system (Task #665). */}
            {v2Enabled && player?.id ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigation.navigate("ParentCreditStore", { playerId: player.id });
                }}
                style={({ pressed }) => [{
                  marginTop: 8,
                  alignSelf: "stretch",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  paddingVertical: 6,
                  borderRadius: 6,
                  backgroundColor: Colors.dark.gold,
                  opacity: pressed ? 0.8 : 1,
                }]}
                accessibilityRole="button"
                accessibilityLabel="Buy credits"
              >
                <Ionicons name="add-circle-outline" size={12} color={Colors.dark.background} />
                <Text style={{ color: Colors.dark.background, fontWeight: "800", fontSize: 11 }}>
                  Buy credits
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        </View>

        {v2Enabled && v2RecentLedger.length > 0 ? (
          <View style={profileStyles.recentActivityCard}>
            <Text style={profileStyles.recentActivityTitle}>Recent wallet activity</Text>
            {v2RecentLedger.map((e) => {
              const isBackfill = e.metadata?.backfill === true;
              const deltaNum = Number(e.delta);
              const sign = deltaNum > 0 ? "+" : "";
              return (
                <View key={e.id} style={profileStyles.recentActivityRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={profileStyles.recentActivityReason} numberOfLines={1}>
                      {e.reason || e.type}
                    </Text>
                    <Text style={profileStyles.recentActivityDate}>
                      {new Date(e.occurred_at).toLocaleDateString()}
                      {isBackfill ? (
                        <Text style={profileStyles.backfilledTag}>  · BACKFILLED</Text>
                      ) : null}
                    </Text>
                  </View>
                  <Text
                    style={[
                      profileStyles.recentActivityDelta,
                      { color: deltaNum > 0 ? Colors.dark.primary : Colors.dark.textMuted },
                    ]}
                  >
                    {sign}
                    {deltaNum}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Live Match Banner — shows when the player has an active live match */}
        {activeLiveMatch?.matches && activeLiveMatch.matches.length > 0 ? (
          <Pressable
            style={({ pressed }) => [profileStyles.liveMatchBanner, pressed && { opacity: 0.8 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              navigation.navigate("MatchLive", {
                matchId: activeLiveMatch.matches![0].id,
                opponentName: "Match",
                opponentId: activeLiveMatch.matches![0].opponentIds?.[0] || "",
                sport: activeLiveMatch.matches![0].sport || "tennis",
                matchFormat: "best_of_3",
                scoringMode: "standard",
              });
            }}
          >
            <View style={profileStyles.liveDot} />
            <Text style={profileStyles.liveMatchBannerText}>Live Match in Progress — Tap to Score</Text>
            <Ionicons name="chevron-forward" size={16} color="#FF4444" />
          </Pressable>
        ) : null}

        {/* Profile Tabs: Moments, Friends, Groups */}
        <View style={styles.tabsCard}>
          <View style={styles.profileTabs}>
            {([
              { tab: "moments" as ProfileTab, label: t("player.profile.moments"), icon: "grid-outline" },
              { tab: "friends" as ProfileTab, label: `${t("player.profile.friends")} (${connectionsData?.friends?.length || 0})`, icon: "people-outline" },
              { tab: "groups" as ProfileTab, label: `${t("player.profile.groups")} (${groupsData?.myGroups?.length || 0})`, icon: "people-circle-outline" },
              { tab: "matches" as ProfileTab, label: "Matches", icon: "tennisball-outline" },
            ] as { tab: ProfileTab; label: string; icon: string }[]).map(({ tab, label, icon }) => {
              const isActive = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  style={[
                    styles.profileTab,
                    isActive && {
                      backgroundColor: Colors.dark.primary + "20",
                      borderColor: Colors.dark.primary,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActiveTab(tab);
                  }}
                >
                  <Ionicons name={icon as any} size={16} color={isActive ? Colors.dark.primary : Colors.dark.textMuted} />
                  <Text style={[styles.profileTabText, isActive && styles.profileTabTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Tab Content */}
          {activeTab === "moments" ? (
            <View style={styles.tabContent}>
              <View style={styles.emptyTabContent}>
                <Ionicons name="images" size={40} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTabText}>{t("player.profile.noMomentsYet")}</Text>
                <Text style={styles.emptyTabSubtext}>{t("player.profile.momentsHint")}</Text>
              </View>
            </View>
          ) : null}

          {activeTab === "friends" ? (
            <View style={styles.tabContent}>
              {connectionsData?.friends && connectionsData.friends.length > 0 ? (
                connectionsData.friends.map((conn) => (
                  <Pressable 
                    key={conn.id} 
                    style={styles.friendItem}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (conn.player?.id) {
                        navigation.navigate("PlayerDetail", { playerId: conn.player.id });
                      }
                    }}
                  >
                    <View style={styles.friendAvatar}>
                      <Text style={styles.friendAvatarText}>{conn.player?.name?.charAt(0) || "?"}</Text>
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{conn.player?.name || "Unknown"}</Text>
                      <Text style={styles.friendLevel}>Level {conn.player?.level || 1}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
                  </Pressable>
                ))
              ) : (
                <View style={styles.emptyTabContent}>
                  <EmptyStateCard
                    icon="people"
                    title={t("player.profile.noFriendsYet")}
                    description={t("player.profile.findPlayersConnect")}
                    ctaText={t("player.profile.findPlayers")}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      navigation.navigate("PlayerFinder");
                    }}
                    style={styles.emptyStateCardTab}
                  />
                </View>
              )}
            </View>
          ) : null}

          {activeTab === "matches" ? (
            <View style={styles.tabContent}>
              <Pressable
                style={[styles.emptyTabContent, { gap: Spacing.md }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("MatchHistory");
                }}
              >
                <Ionicons name="tennisball-outline" size={40} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTabText}>View Match History</Text>
                <Text style={styles.emptyTabSubtext}>Log results and track your wins</Text>
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: Colors.dark.primary,
                  borderRadius: BorderRadius.lg,
                  paddingVertical: 10,
                  paddingHorizontal: Spacing.xl,
                  marginTop: Spacing.xs,
                }}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Open Match History</Text>
                </View>
              </Pressable>
              <Pressable
                style={[styles.emptyTabContent, { marginTop: Spacing.sm }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowLogMatchModal(true);
                }}
              >
                <Text style={[styles.emptyTabSubtext, { color: Colors.dark.primary }]}>
                  + Log a match now
                </Text>
              </Pressable>
            </View>
          ) : null}

          {activeTab === "groups" ? (
            <View style={styles.tabContent}>
              {groupsData?.myGroups && groupsData.myGroups.length > 0 ? (
                groupsData.myGroups.map((group) => (
                  <Pressable 
                    key={group.id} 
                    style={styles.groupItem}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      navigation.navigate("GroupDetail", { groupId: group.id });
                    }}
                  >
                    <View style={styles.groupIcon}>
                      <Ionicons 
                        name={group.type === "squad" ? "tennisball" : group.type === "age_group" ? "calendar" : "people"} 
                        size={20} 
                        color={Colors.dark.primary} 
                      />
                    </View>
                    <View style={styles.groupInfo}>
                      <Text style={styles.groupName}>{group.name}</Text>
                      <Text style={styles.groupMemberCount}>{group.memberCount} members</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
                  </Pressable>
                ))
              ) : (
                <View style={styles.emptyTabContent}>
                  <Ionicons name="people-circle" size={40} color={Colors.dark.textMuted} />
                  <Text style={styles.emptyTabText}>{t("player.profile.noGroupsYet")}</Text>
                  <Text style={styles.emptyTabSubtext}>{t("player.profile.groupsHint")}</Text>
                </View>
              )}
            </View>
          ) : null}
        </View>

        {/* Your Tennis World — merged Academy + Coach card */}
        {(academy || coach) ? (
          <>
            <Text style={styles.sectionGroupHeader}>{t("player.profile.academy")}</Text>
            <View style={styles.tennisworldCard}>
              {academy ? (
                <View style={styles.tennisworldAcademyRow}>
                  <View style={styles.tennisworldAcademyIcon}>
                    <Ionicons name="tennisball" size={20} color={Colors.dark.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tennisworldAcademyName}>{academy.name}</Text>
                    <Text style={styles.tennisworldAcademySince}>{t("player.profile.since")} {memberSince}</Text>
                  </View>
                </View>
              ) : null}
              {academy && coach ? (
                <View style={styles.tennisworldDivider} />
              ) : null}
              {coach ? (
                <View style={styles.tennisworldCoachRow}>
                  <View style={styles.tennisworldCoachAvatar}>
                    <Text style={styles.tennisworldCoachAvatarText}>{coach.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tennisworldCoachName}>{coach.name}</Text>
                    {coach.email ? (
                      <Text style={styles.tennisworldCoachEmail}>{coach.email}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    style={styles.tennisworldChatBtn}
                    onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  >
                    <Ionicons name="chatbubble" size={18} color={Colors.dark.primary} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Season History Section */}
        {(seasonData?.currentSeason || (seasonData?.history && seasonData.history.length > 0)) ? (
          <>
            <Text style={styles.sectionGroupHeader}>Season History</Text>
            <View style={seasonStyles.card}>
              {seasonData?.currentSeason ? (
                <View style={seasonStyles.currentBlock}>
                  <View style={seasonStyles.currentRow}>
                    <View style={seasonStyles.currentIconWrap}>
                      <Ionicons name="flash" size={14} color="#CCFF00" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={seasonStyles.currentName}>{seasonData.currentSeason.seasonName}</Text>
                      <Text style={seasonStyles.currentSub}>
                        Since {new Date(seasonData.currentSeason.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </Text>
                    </View>
                    <View style={seasonStyles.activeBadge}>
                      <Text style={seasonStyles.activeBadgeText}>Active</Text>
                    </View>
                  </View>
                  <View style={seasonStyles.statRow}>
                    <View style={seasonStyles.statChip}>
                      <Ionicons name="calendar-outline" size={11} color={Colors.dark.textSecondary} />
                      <Text style={seasonStyles.statText}>{seasonData.currentSeason.sessionCount} sessions</Text>
                    </View>
                    <View style={seasonStyles.statChip}>
                      <Ionicons name="card-outline" size={11} color={Colors.dark.textSecondary} />
                      <Text style={seasonStyles.statText}>{seasonData.currentSeason.creditsUsed} credits used</Text>
                    </View>
                  </View>
                </View>
              ) : null}
              {seasonData?.history && seasonData.history.length > 0 ? (
                <>
                  {seasonData.currentSeason ? <View style={seasonStyles.divider} /> : null}
                  {seasonData.history.map((h, i) => (
                    <View
                      key={h.enrollmentId}
                      style={[
                        seasonStyles.historyRow,
                        i < seasonData.history.length - 1 && seasonStyles.historyRowBorder,
                      ]}
                    >
                      <Ionicons name="calendar-outline" size={14} color={Colors.dark.textSecondary} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={seasonStyles.historyName}>{h.seasonName}</Text>
                        <Text style={seasonStyles.historySub}>
                          {new Date(h.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          {h.endedAt ? ` — ${new Date(h.endedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : ""}
                        </Text>
                        <View style={seasonStyles.statRow}>
                          <View style={seasonStyles.statChip}>
                            <Ionicons name="calendar-outline" size={10} color={Colors.dark.textMuted} />
                            <Text style={seasonStyles.statTextMuted}>{h.sessionCount} sessions</Text>
                          </View>
                          <View style={seasonStyles.statChip}>
                            <Ionicons name="card-outline" size={10} color={Colors.dark.textMuted} />
                            <Text style={seasonStyles.statTextMuted}>{h.creditsUsed} credits used</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Sport Profiles Section */}
        <Text style={styles.sectionGroupHeader}>Sport Profiles</Text>
        <SportProfilesSection
          sportProfiles={player.sportProfiles}
          onUpdateSports={(updatedProfiles) => updateSportProfiles.mutate(updatedProfiles)}
          isSaving={updateSportProfiles.isPending}
        />

        {/* Tennis DNA Section */}
        <Text style={styles.sectionGroupHeader}>Tennis DNA</Text>
        <PlayerDNACard
          data={{
            playStyle: player.playStyle,
            dominantHand: player.dominantHand,
            backhandType: player.backhandType,
            favoriteShot: player.favoriteShot,
            tennisIdol: player.tennisIdol,
            bio: player.bio,
          }}
          isOwnProfile
          onEditPress={() => navigation.navigate("PlayerDNAWizard" as never)}
        />

        {/* My Strengths Section — Task #1617 */}
        <Text style={styles.sectionGroupHeader}>My Strengths</Text>
        <MyStrengthsSection
          selectedTags={player.skillTags ?? []}
          onToggleTag={(tag) => {
            const current = player.skillTags ?? [];
            const next = current.includes(tag)
              ? current.filter((t) => t !== tag)
              : [...current, tag];
            updateSkillTags.mutate(next);
          }}
          isSaving={updateSkillTags.isPending}
        />

        {/* ── Achievements Section ──────────────────────────────────────── */}
        <Text style={styles.sectionGroupHeader}>Achievements</Text>

        {/* Personal Records horizontal scroll — "NEW PB" highlight for non-zero records */}
        {personalRecordsData?.records && personalRecordsData.records.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={achievementStyles.pbScrollContent}
            style={achievementStyles.pbScroll}
          >
            {personalRecordsData.records.map((rec) => {
              const isNewPb = !!rec.isNewPb;
              return (
                <View
                  key={rec.id}
                  style={[
                    achievementStyles.pbCard,
                    isNewPb && { borderColor: rec.color + "60", borderWidth: 1.5 },
                  ]}
                >
                  {isNewPb ? (
                    <View style={[achievementStyles.pbNewBadge, { backgroundColor: rec.color }]}>
                      <Text style={achievementStyles.pbNewBadgeText}>PB</Text>
                    </View>
                  ) : null}
                  <View style={[achievementStyles.pbIconCircle, { backgroundColor: rec.color + "20" }]}>
                    <Ionicons name={rec.icon as IoniconsName} size={18} color={rec.color} />
                  </View>
                  <Text style={[achievementStyles.pbValue, { color: rec.color }]}>
                    {rec.value > 0 ? rec.value.toLocaleString() : "—"}{rec.value > 0 && rec.unit ? ` ${rec.unit}` : ""}
                  </Text>
                  <Text style={achievementStyles.pbLabel} numberOfLines={2}>{rec.label}</Text>
                </View>
              );
            })}
          </ScrollView>
        ) : null}

        {/* Achievement badge grid — FlatList with numColumns=3 for efficient rendering */}
        {achievementsData?.achievements && achievementsData.achievements.length > 0 ? (() => {
          const COLLAPSED_COUNT = 6;
          const allBadges = achievementsData.achievements;
          const visibleBadges = achievementsExpanded ? allBadges : allBadges.slice(0, COLLAPSED_COUNT);
          const hasMore = allBadges.length > COLLAPSED_COUNT;
          return (
            <>
              <FlatList
                data={visibleBadges}
                numColumns={3}
                keyExtractor={(ach) => ach.id}
                scrollEnabled={false}
                columnWrapperStyle={achievementStyles.gridRow}
                contentContainerStyle={achievementStyles.gridContainer}
                renderItem={({ item: ach }) => {
                  const earned = ach.earned;
                  const progress = ach.triggerThreshold > 0
                    ? Math.min(ach.currentProgress / ach.triggerThreshold, 1)
                    : 0;
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        achievementStyles.badgeCard,
                        earned && { borderColor: ach.iconColor + "80" },
                        !earned && achievementStyles.badgeCardUnearned,
                        pressed && { opacity: 0.78 },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedBadge(ach);
                      }}
                    >
                      <View style={[
                        achievementStyles.badgeIconWrap,
                        { backgroundColor: earned ? ach.iconColor + "20" : Colors.dark.chipBackground },
                      ]}>
                        <Ionicons
                          name={ach.iconName as IoniconsName}
                          size={24}
                          color={earned ? ach.iconColor : Colors.dark.textMuted}
                        />
                        {earned && !ach.rewardClaimed ? (
                          <View style={achievementStyles.claimDot} />
                        ) : null}
                      </View>
                      {!earned ? (
                        <View style={achievementStyles.progressBarTrack}>
                          <View style={[achievementStyles.progressBarFill, {
                            width: `${Math.max(progress * 100, 2)}%` as DimensionValue,
                            backgroundColor: ach.iconColor,
                          }]} />
                        </View>
                      ) : null}
                      <Text
                        style={[
                          achievementStyles.badgeCardName,
                          { color: earned ? Colors.dark.text : Colors.dark.textMuted },
                        ]}
                        numberOfLines={2}
                      >
                        {ach.name}
                      </Text>
                      {earned ? (
                        <View style={[achievementStyles.earnedPip, { backgroundColor: ach.iconColor }]} />
                      ) : null}
                    </Pressable>
                  );
                }}
              />
              {hasMore ? (
                <Pressable
                  style={({ pressed }) => [achievementStyles.showMoreBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setAchievementsExpanded((v) => !v);
                  }}
                >
                  <Text style={achievementStyles.showMoreText}>
                    {achievementsExpanded
                      ? "Show less"
                      : `Show all ${allBadges.length} achievements`}
                  </Text>
                  <Ionicons
                    name={achievementsExpanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={Colors.dark.accentText}
                  />
                </Pressable>
              ) : null}
            </>
          );
        })() : (
          <View style={achievementStyles.emptyAchievements}>
            <Ionicons name="trophy-outline" size={32} color={Colors.dark.textMuted} />
            <Text style={achievementStyles.emptyAchText}>Keep playing to unlock achievements</Text>
          </View>
        )}

        {/* AI Coach entry */}
        <Pressable
          style={styles.aiCoachCard}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate("PlayerAICoach" as never);
          }}
        >
          <View style={styles.aiCoachIcon}>
            <Ionicons name="sparkles" size={22} color="#0d0d0d" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiCoachTitle}>My AI Coach</Text>
            <Text style={styles.aiCoachSub}>Ask anything about your game and progress</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
        </Pressable>

        {/* Connected Apps — Health */}
        {healthState?.available ? (
          <>
            <Text style={styles.sectionGroupHeader}>Connected Apps</Text>
            <View style={styles.settingsSection}>
              <View style={[styles.settingsItem, { borderBottomWidth: 0 }]}>
                <View style={[styles.settingsIcon, {
                  backgroundColor: Platform.OS === "ios"
                    ? "rgba(255,59,48,0.12)"
                    : "rgba(52,199,89,0.12)",
                }]}>
                  <Ionicons
                    name={Platform.OS === "ios" ? "heart" : "fitness"}
                    size={20}
                    color={Platform.OS === "ios" ? "#FF3B30" : "#34C759"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingsLabel}>
                    {Platform.OS === "ios" ? "Apple Health" : "Google Health Connect"}
                  </Text>
                  <Text style={{ fontSize: 11, color: Colors.dark.textMuted, marginTop: 2 }}>
                    {healthState.connected
                      ? `Steps, Sleep, Heart Rate, Workouts${healthState.lastSyncedAt ? ` · Synced ${new Date(healthState.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`
                      : "Steps, Sleep, Heart Rate, Workouts"}
                  </Text>
                </View>
                {healthConnecting ? (
                  <TennisBallSpinner size="small" color={Colors.dark.primary} />
                ) : (
                  <Switch
                    value={healthState.connected}
                    onValueChange={handleHealthToggle}
                    trackColor={{ false: Colors.dark.chipBackground, true: (Platform.OS === "ios" ? "#FF3B30" : "#34C759") + "80" }}
                    thumbColor={healthState.connected ? (Platform.OS === "ios" ? "#FF3B30" : "#34C759") : Colors.dark.textMuted}
                  />
                )}
              </View>
            </View>

            {healthState.connected ? (
              <View style={healthStyles.dataTypesCard}>
                <Text style={healthStyles.dataTypesTitle}>Data being read</Text>
                {(["Steps", "Active Energy", "Sleep Analysis", "Resting Heart Rate", "Workouts"] as const).map((item) => (
                  <View key={item} style={healthStyles.dataTypeRow}>
                    <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                    <Text style={healthStyles.dataTypeText}>{item}</Text>
                  </View>
                ))}
                <Text style={healthStyles.privacyNote}>
                  Only computed insights are shared — raw biometric readings never leave your device.
                </Text>
              </View>
            ) : null}
          </>
        ) : null}

        {/* Settings grouped list */}
        <Text style={styles.sectionGroupHeader}>{t("player.profile.settings")}</Text>

        {/* Appearance toggle — prominent, top of settings */}
        <View style={[styles.settingsSection, { marginBottom: Spacing.md }]}>
          <View style={[styles.settingsItem, { flexDirection: "column", alignItems: "flex-start", gap: Spacing.sm, paddingVertical: Spacing.md }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
              <View style={styles.settingsIcon}>
                <Ionicons name="contrast-outline" size={20} color={Colors.dark.text} />
              </View>
              <Text style={styles.settingsLabel}>Appearance</Text>
            </View>
            <View style={{ flexDirection: "row", gap: Spacing.xs, width: "100%" }}>
              {(["light", "dark", "system"] as PlayerAppearancePreference[]).map((opt) => {
                const selected = appearancePref === opt;
                const labels: Record<PlayerAppearancePreference, string> = { light: "Light", dark: "Dark", system: "System" };
                const icons: Record<PlayerAppearancePreference, keyof typeof Ionicons.glyphMap> = {
                  light: "sunny-outline",
                  dark: "moon-outline",
                  system: "phone-portrait-outline",
                };
                return (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setAppearancePref(opt);
                    }}
                    style={[
                      profileAppearanceStyles.segment,
                      selected && profileAppearanceStyles.segmentSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${labels[opt]} appearance`}
                  >
                    <Ionicons name={icons[opt]} size={16} color={selected ? "#000" : Colors.dark.textMuted} />
                    <Text style={[profileAppearanceStyles.segmentLabel, selected && profileAppearanceStyles.segmentLabelSelected]}>
                      {labels[opt]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.settingsSection}>
          <Pressable 
            style={styles.settingsItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (Platform.OS === "web") {
                window.alert("Notification settings are available in the Expo Go app on your device.");
              } else {
                Alert.alert(
                  t("player.profile.notifications"),
                  "Notification preferences can be managed in your device settings.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { 
                      text: "Open Settings", 
                      onPress: async () => {
                        try {
                          await Linking.openSettings();
                        } catch (_e) {
                          // Settings not available
                        }
                      }
                    },
                  ]
                );
              }
            }}
          >
            <View style={styles.settingsIcon}>
              <Ionicons name="notifications-outline" size={20} color={Colors.dark.text} />
            </View>
            <Text style={styles.settingsLabel}>{t("player.profile.notifications")}</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>

          <Pressable 
            style={styles.settingsItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (Platform.OS === "web") {
                window.alert("Need help? Contact us at support@glowupsports.com");
              } else {
                Alert.alert(
                  "Help & Support",
                  "For assistance, please contact us at support@glowupsports.com",
                  [
                    { text: "OK", style: "default" },
                  ]
                );
              }
            }}
          >
            <View style={styles.settingsIcon}>
              <Ionicons name="help-circle-outline" size={20} color={Colors.dark.text} />
            </View>
            <Text style={styles.settingsLabel}>{t("player.profile.helpSupport")}</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>

          <Pressable
            style={styles.settingsItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("PlayerHolidays");
            }}
          >
            <View style={[styles.settingsIcon, { backgroundColor: "rgba(77, 163, 255, 0.15)" }]}>
              <Ionicons name="calendar-outline" size={20} color="#4DA3FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsLabel}>{t("player.profile.holidays.title")}</Text>
              <Text style={{ ...Typography.caption, color: Colors.dark.textMuted, marginTop: 2 }}>
                {holidaysSubtitle}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>

          <Pressable 
            style={[styles.settingsItem, { borderBottomWidth: 0 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowPinModal(true);
            }}
          >
            <View style={[styles.settingsIcon, { backgroundColor: "rgba(138, 43, 226, 0.15)" }]}>
              <Ionicons name="wallet-outline" size={20} color="#8A2BE2" />
            </View>
            <Text style={styles.settingsLabel}>{t("player.profile.parentDashboard")}</Text>
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
            <Ionicons name="lock-closed" size={16} color={Colors.dark.textMuted} style={{ marginRight: Spacing.xs }} />
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        {/* Discover grouped list */}
        <Text style={styles.sectionGroupHeader}>{t("player.profile.discover")}</Text>
        <View style={[styles.settingsSection, { marginBottom: Spacing.lg }]}>
          <Pressable 
            style={styles.settingsItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("CoachDirectory");
            }}
          >
            <View style={[styles.settingsIcon, { backgroundColor: "rgba(0, 212, 255, 0.15)" }]}>
              <Ionicons name="people-outline" size={20} color={Colors.dark.primary} />
            </View>
            <Text style={styles.settingsLabel}>{t("player.profile.findCoaches")}</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>

          <Pressable 
            style={styles.settingsItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("AcademyBrowser");
            }}
          >
            <View style={[styles.settingsIcon, { backgroundColor: "rgba(46, 204, 64, 0.15)" }]}>
              <Ionicons name="school-outline" size={20} color={Colors.dark.primary} />
            </View>
            <Text style={styles.settingsLabel}>{t("player.profile.browseAcademies")}</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>

          <Pressable 
            style={[styles.settingsItem, { borderBottomWidth: 0 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("TransferRequest");
            }}
          >
            <View style={[styles.settingsIcon, { backgroundColor: "rgba(255, 165, 0, 0.15)" }]}>
              <Ionicons name="swap-horizontal-outline" size={20} color={Colors.dark.orange} />
            </View>
            <Text style={styles.settingsLabel}>{t("player.profile.transferAcademy")}</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={Colors.dark.error} />
          <Text style={styles.logoutText}>{t("player.profile.signOut")}</Text>
        </Pressable>

        <Pressable
          style={styles.deleteAccountButton}
          onPress={handleDeleteAccount}
          disabled={deleteLoading}
        >
          {deleteLoading ? (
            <TennisBallSpinner size="small" color={Colors.dark.error} />
          ) : (
            <Text style={styles.deleteAccountText}>Delete My Account</Text>
          )}
        </Pressable>
      </ScrollView>

      {celebrationAchievement ? (
        <AchievementCelebrationModal
          achievement={celebrationAchievement}
          onClose={onCloseCelebration}
        />
      ) : null}

      <LogMatchModal
        visible={showLogMatchModal}
        onClose={() => setShowLogMatchModal(false)}
      />

      {/* Badge detail sheet */}
      <Modal
        visible={!!selectedBadge}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedBadge(null)}
      >
        <View style={achievementStyles.detailOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedBadge(null)} />
          {selectedBadge ? (
            <View style={achievementStyles.detailSheet}>
              <View style={achievementStyles.detailHandle} />
              <View style={[achievementStyles.detailIconCircle, { backgroundColor: selectedBadge.iconColor + "20" }]}>
                <Ionicons name={selectedBadge.iconName as IoniconsName} size={36} color={selectedBadge.earned ? selectedBadge.iconColor : Colors.dark.textMuted} />
              </View>
              <Text style={achievementStyles.detailName}>{selectedBadge.name}</Text>
              <View style={achievementStyles.detailRarityRow}>
                <Text style={[achievementStyles.detailRarity, { color: selectedBadge.iconColor }]}>
                  {selectedBadge.rarity.charAt(0).toUpperCase() + selectedBadge.rarity.slice(1)}
                </Text>
                <Text style={achievementStyles.detailCategory}>
                  {" · "}{selectedBadge.category.charAt(0).toUpperCase() + selectedBadge.category.slice(1)}
                </Text>
              </View>
              <Text style={achievementStyles.detailDesc}>{selectedBadge.description}</Text>
              {selectedBadge.earned ? (
                <View style={achievementStyles.detailEarnedBox}>
                  <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                  <Text style={achievementStyles.detailEarnedText}>
                    Earned {selectedBadge.earnedAt ? new Date(selectedBadge.earnedAt).toLocaleDateString() : ""}
                  </Text>
                </View>
              ) : (
                <View style={achievementStyles.detailProgressBox}>
                  <Text style={achievementStyles.detailProgressLabel}>
                    Progress: {selectedBadge.currentProgress} / {selectedBadge.triggerThreshold}
                    {"  "}({selectedBadge.sessionsAway} more to go)
                  </Text>
                  <View style={achievementStyles.progressBarTrack}>
                    <View style={[achievementStyles.progressBarFill, {
                      width: `${Math.min((selectedBadge.currentProgress / selectedBadge.triggerThreshold) * 100, 100)}%` as DimensionValue,
                      backgroundColor: selectedBadge.iconColor,
                    }]} />
                  </View>
                </View>
              )}
              <View style={achievementStyles.detailRewardBox}>
                <Ionicons name="gift-outline" size={16} color={Colors.dark.textMuted} />
                <Text style={achievementStyles.detailRewardText}>
                  {selectedBadge.rewardClaimed ? "Reward claimed" : `Reward: ${selectedBadge.rewardLabel}`}
                </Text>
              </View>
              {/* "Claim Reward" is always surfaced for earned+unclaimed achievements so
                  rewards are never stranded when the celebration modal is dismissed. */}
              {selectedBadge.earned && !selectedBadge.rewardClaimed ? (
                <Pressable
                  style={({ pressed }) => [
                    achievementStyles.detailClaimBtn,
                    { backgroundColor: selectedBadge.iconColor },
                    pressed && { opacity: 0.8 },
                    claimAchievementMutation.isPending && { opacity: 0.6 },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    claimAchievementMutation.mutate(selectedBadge.id);
                  }}
                  disabled={claimAchievementMutation.isPending}
                >
                  <Ionicons name="gift" size={16} color="#fff" />
                  <Text style={achievementStyles.detailClaimBtnText}>
                    {claimAchievementMutation.isPending ? "Claiming..." : "Claim Reward"}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={achievementStyles.detailCloseBtn}
                onPress={() => setSelectedBadge(null)}
              >
                <Text style={achievementStyles.detailCloseBtnText}>
                  {selectedBadge.earned && selectedBadge.rewardClaimed ? "Close" : "Close"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Health disclaimer modal */}
      <Modal
        visible={showHealthDisclaimer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHealthDisclaimer(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowHealthDisclaimer(false)} />
          <View style={healthStyles.disclaimerSheet}>
            <View style={healthStyles.disclaimerHeader}>
              <View style={healthStyles.disclaimerIconCircle}>
                <Ionicons
                  name={Platform.OS === "ios" ? "heart" : "fitness"}
                  size={28}
                  color={Platform.OS === "ios" ? "#FF3B30" : "#34C759"}
                />
              </View>
              <Text style={healthStyles.disclaimerTitle}>
                {Platform.OS === "ios" ? "Connect Apple Health" : "Connect Google Health"}
              </Text>
              <Text style={healthStyles.disclaimerSub}>
                Glow will read the following data to personalise your coaching experience
              </Text>
            </View>

            {(["Steps", "Active Energy Burned", "Sleep Analysis", "Resting Heart Rate", "Workouts"] as const).map((item) => (
              <View key={item} style={healthStyles.disclaimerRow}>
                <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                <Text style={healthStyles.disclaimerItem}>{item}</Text>
              </View>
            ))}

            <View style={healthStyles.privacyBox}>
              <Ionicons name="shield-checkmark" size={16} color="#6366F1" />
              <Text style={healthStyles.privacyBoxText}>
                Only computed insights (e.g. &quot;Light day recommended&quot;) are shared with the server. Raw biometric readings never leave your device.
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [healthStyles.connectBtn, pressed && { opacity: 0.85 }]}
              onPress={handleHealthConnect}
            >
              <Text style={healthStyles.connectBtnText}>Allow Access</Text>
            </Pressable>
            <Pressable
              style={healthStyles.cancelBtn}
              onPress={() => setShowHealthDisclaimer(false)}
            >
              <Text style={healthStyles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showTitlesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTitlesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowTitlesModal(false)} />
          <View style={styles.titlesModalContent}>
            <View style={styles.titlesModalHeader}>
              <Text style={styles.titlesModalTitle}>{t("player.profile.yourTitles")}</Text>
              <Pressable onPress={() => setShowTitlesModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            
            {unlockedTitles.length === 0 ? (
              <View style={styles.emptyTitles}>
                <Ionicons name="ribbon-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTitlesText}>{t("player.profile.noTitlesYet")}</Text>
                <Text style={styles.emptyTitlesSubtext}>{t("player.profile.keepPlaying")}</Text>
              </View>
            ) : (
              <FlatList
                data={unlockedTitles}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.titlesList}
                renderItem={({ item: title }) => (
                  <Pressable
                    style={[
                      styles.titleItem,
                      title.isEquipped && styles.titleItemEquipped,
                      { borderColor: RARITY_COLORS[title.rarity] || RARITY_COLORS.common }
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      equipTitle.mutate(title.id);
                    }}
                    disabled={title.isEquipped || equipTitle.isPending}
                  >
                    <View style={styles.titleItemLeft}>
                      <View style={[styles.titleRibbonIcon, { backgroundColor: (RARITY_COLORS[title.rarity] || RARITY_COLORS.common) + "20" }]}>
                        <Ionicons 
                          name="ribbon" 
                          size={24} 
                          color={RARITY_COLORS[title.rarity] || RARITY_COLORS.common} 
                        />
                      </View>
                      <View>
                        <Text style={styles.titleItemName}>{title.name}</Text>
                        <Text style={styles.titleItemDesc}>{title.description}</Text>
                        <Text style={[styles.titleItemRarity, { color: RARITY_COLORS[title.rarity] || RARITY_COLORS.common }]}>
                          {title.rarity.charAt(0).toUpperCase() + title.rarity.slice(1)}
                        </Text>
                      </View>
                    </View>
                    {title.isEquipped ? (
                      <View style={styles.equippedBadge}>
                        <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
                        <Text style={styles.equippedText}>{t("player.profile.equipped")}</Text>
                      </View>
                    ) : (
                      <Pressable 
                        style={styles.equipButton}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          equipTitle.mutate(title.id);
                        }}
                        disabled={equipTitle.isPending}
                      >
                        <Text style={styles.equipButtonText}>{t("player.profile.equip")}</Text>
                      </Pressable>
                    )}
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      <PinEntryModal
        visible={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSuccess={() => {
          setShowPinModal(false);
          navigation.navigate("ParentDashboard");
        }}
        title="Parent Dashboard"
      />

      <Modal
        visible={showPlayStyleModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPlayStyleModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPlayStyleModal(false)}>
          <Pressable style={styles.playStyleModalContent} onPress={() => {}}>
            <Text style={styles.playStyleModalTitle}>YOUR PLAY STYLE DNA</Text>
            <Text style={styles.playStyleModalSubtitle}>
              Which archetype defines your game on court?
            </Text>
            <View style={styles.playStyleModalGrid}>
              {ALL_ARCHETYPES.map((key) => {
                const meta = PLAY_STYLE_META[key];
                const isSelected = player.playStyle === key;
                return (
                  <Pressable
                    key={key}
                    style={[
                      styles.playStylePickerCard,
                      { borderColor: isSelected ? meta.color : Colors.dark.chipBackgroundStrong },
                      isSelected ? { backgroundColor: meta.color + "18" } : null,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      updatePlayStyle.mutate(isSelected ? null : key);
                    }}
                    disabled={updatePlayStyle.isPending}
                  >
                    <Ionicons name={meta.icon as IoniconsName} size={22} color={isSelected ? meta.color : Colors.dark.textMuted} />
                    <Text style={[styles.playStylePickerName, isSelected ? { color: meta.color } : null]}>
                      {meta.name}
                    </Text>
                    {isSelected ? (
                      <View style={[styles.playStylePickerCheck, { backgroundColor: meta.color }]}>
                        <Ionicons name="checkmark" size={10} color={Colors.dark.buttonText} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.playStyleModalDismiss} onPress={() => setShowPlayStyleModal(false)}>
              <Text style={styles.playStyleModalDismissText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
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
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.dark.buttonText,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  signOutButtonText: {
    ...Typography.body,
    color: Colors.dark.error,
  },
  guestAvatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "60",
    backgroundColor: Colors.dark.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  guestBrand: {
    ...Typography.caption,
    color: Colors.dark.primary,
    textAlign: "center",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: Spacing.xs,
  },
  guestTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
  },
  guestSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  guestFeatureList: {
    width: "100%",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  guestFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  guestFeatureText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  guestCta: {
    width: "100%",
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  guestCtaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  guestCtaText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.dark.buttonText,
  },
  scrollView: {
    flex: 1,
  },
  profileSkeletonHeader: {
    alignItems: "center",
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  profileSkeletonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
  },
  profileSkeletonSection: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
  },
  headerCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    ...CardStyles.elevated,
    borderRadius: BorderRadius.lg,
  },
  sectionGroupHeader: {
    ...Typography.sectionTitle,
    color: Colors.dark.textSubtle,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  tabsCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    ...CardStyles.elevated,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    padding: Spacing.xl,
    paddingTop: Spacing["3xl"],
  },
  editProfileBtn: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.accentTextSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: Spacing.md,
  },
  rainbowBorder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    padding: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    padding: 3,
  },
  avatarGradientInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    padding: 3,
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Backgrounds.card,
  },
  avatarImageWithBorder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Backgrounds.card,
  },
  cameraIconOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  avatarInner: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 57,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    ...Typography.h1,
    color: Colors.dark.text,
    fontSize: 36,
  },
  levelBadgeOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: Colors.dark.backgroundRoot,
  },
  levelBadgeText: {
    ...Typography.caption,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  playerName: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  levelTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  titleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  titleBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  badgeShowcase: {
    width: "100%",
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  badgeShowcaseTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  badgeScrollContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  badgeItem: {
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    backgroundColor: Backgrounds.card,
    width: 72,
  },
  badgeIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  badgeItemName: {
    ...Typography.small,
    color: Colors.dark.text,
    textAlign: "center",
    fontSize: 10,
  },
  moreBadges: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(50, 50, 50, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  moreBadgesText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  badges: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  ballBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.lg,
  },
  ballDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ballText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  glowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.lg,
  },
  glowText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  birthdayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 105, 180, 0.2)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "#FF69B4",
  },
  birthdayIcon: {
    fontSize: 14,
  },
  birthdayText: {
    ...Typography.caption,
    color: "#FF69B4",
    fontWeight: "700",
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    ...CardStyles.elevated,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  statCol: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  statColValue: {
    ...Typography.h3,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statColLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: "row",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  actionCard: {
    flex: 1,
    ...CardStyles.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: 4,
    minHeight: 80,
  },
  actionCardLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginTop: 4,
  },
  actionCardSub: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  tennisworldCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    ...CardStyles.elevated,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  tennisworldAcademyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  tennisworldAcademyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.accentTextSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  tennisworldAcademyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  tennisworldAcademySince: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  tennisworldDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginHorizontal: Spacing.md,
  },
  tennisworldCoachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  tennisworldCoachAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  tennisworldCoachAvatarText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  tennisworldCoachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  tennisworldCoachEmail: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  tennisworldChatBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.accentTextSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  academyCard: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  academyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 4,
  },
  academyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  memberSince: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginLeft: 28,
  },
  settingsSection: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
  },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  settingsLabel: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
  },
  aiCoachCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.accentTextSoft,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.3)",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  aiCoachIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  aiCoachTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  aiCoachSub: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  newBadge: {
    backgroundColor: "#8A2BE2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: Spacing.sm,
  },
  newBadgeText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "700",
    fontSize: 10,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  logoutText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.error,
  },
  deleteAccountButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xs,
  },
  deleteAccountText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.error,
    opacity: 0.7,
  },
  openToPlayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  openToPlayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  openToPlayPillText: {
    ...Typography.caption,
    fontWeight: "600",
    flex: 1,
  },
  profileTabs: {
    flexDirection: "row",
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  profileTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "transparent",
  },
  profileTabText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  profileTabTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  tabContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  emptyTabContent: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
    gap: Spacing.sm,
  },
  emptyTabText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  emptyTabSubtext: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
    maxWidth: "80%",
  },
  emptyStateCardTab: {
    marginHorizontal: Spacing.lg,
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  friendAvatarText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  friendInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  friendName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  friendLevel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  groupItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.dark.accentTextSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  groupInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  groupName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  groupMemberCount: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  titlesModalContent: {
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "70%",
    paddingBottom: 40,
  },
  titlesModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  titlesModalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  titlesList: {
    padding: Spacing.lg,
  },
  titleItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
  },
  titleItemEquipped: {
    backgroundColor: "rgba(200, 255, 61, 0.1)",
  },
  titleItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  titleRibbonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  titleItemName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  titleItemDesc: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  titleItemRarity: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  equippedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  equippedText: {
    ...Typography.small,
    color: Colors.dark.accentText,
    fontWeight: "600",
  },
  equipButton: {
    backgroundColor: Colors.dark.primary + "30",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  equipButtonText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  emptyTitles: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["3xl"],
    gap: Spacing.sm,
  },
  emptyTitlesText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  emptyTitlesSubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  playStyleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    backgroundColor: Colors.dark.chipBackground,
    marginTop: 4,
  },
  playStyleBadgeText: {
    ...Typography.small,
    fontWeight: "700",
    letterSpacing: 0.3,
    fontSize: 12,
  },
  playStyleSetPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginTop: 4,
  },
  playStyleSetPromptText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  playStyleModalContent: {
    backgroundColor: "#141920",
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing["2xl"],
    marginTop: "auto",
  },
  playStyleModalTitle: {
    ...Typography.h3,
    letterSpacing: 2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  playStyleModalSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  playStyleModalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  playStylePickerCard: {
    width: "47%",
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 6,
    alignItems: "flex-start",
    backgroundColor: Colors.dark.chipBackground,
    position: "relative",
    minHeight: 80,
  },
  playStylePickerName: {
    ...Typography.small,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  playStylePickerCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  playStyleModalDismiss: {
    alignSelf: "center",
    paddingVertical: Spacing.md,
  },
  playStyleModalDismissText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
}));

const profileStyles = makeReactiveStyles(() => StyleSheet.create({
  liveMatchBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255,68,68,0.08)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,68,68,0.25)",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF4444",
  },
  liveMatchBannerText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FF4444",
    flex: 1,
  },
  recentActivityCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  recentActivityTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  recentActivityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
  },
  recentActivityReason: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  recentActivityDate: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  backfilledTag: {
    color: "#F59E0B",
    fontWeight: "700",
    fontSize: 10,
  },
  recentActivityDelta: {
    fontSize: 14,
    fontWeight: "800",
    marginLeft: Spacing.sm,
  },
}));

const achievementStyles = makeReactiveStyles(() => StyleSheet.create({
  pbScroll: {
    marginHorizontal: -Spacing.xl,
    marginBottom: Spacing.lg,
  },
  pbScrollContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  pbCard: {
    width: 90,
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    position: "relative",
  },
  pbNewBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    zIndex: 1,
  },
  pbNewBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  pbIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pbValue: {
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  pbLabel: {
    fontSize: 9,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 12,
  },
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  gridContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  gridRow: {
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  badgeCard: {
    flex: 1,
    maxWidth: "31%",
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.dark.borderSubtle,
    marginHorizontal: Spacing.xs,
  },
  badgeCardUnearned: {
    opacity: 0.55,
  },
  badgeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  claimDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF9500",
    borderWidth: 1.5,
    borderColor: Colors.dark.card,
  },
  progressBarTrack: {
    width: "100%",
    height: 3,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 3,
    borderRadius: 2,
  },
  badgeCardName: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 13,
  },
  earnedPip: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyAchievements: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  emptyAchText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.accentText,
  },
  detailOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  detailSheet: {
    backgroundColor: Colors.dark.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.xl,
    paddingBottom: 40,
    alignItems: "center",
    gap: Spacing.sm,
  },
  detailHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.borderSubtle,
    marginBottom: Spacing.sm,
  },
  detailIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  detailName: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  detailRarityRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  detailRarity: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  detailCategory: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  detailDesc: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  detailEarnedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  detailEarnedText: {
    fontSize: 13,
    color: "#22C55E",
    fontWeight: "600",
  },
  detailProgressBox: {
    width: "100%",
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  detailProgressLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  detailRewardBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    backgroundColor: Colors.dark.chipBackground,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  detailRewardText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  detailClaimBtn: {
    marginTop: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
  },
  detailClaimBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  detailCloseBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.xl,
  },
  detailCloseBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
}));

const healthStyles = makeReactiveStyles(() => StyleSheet.create({
  dataTypesCard: {
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  dataTypesTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  dataTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 3,
  },
  dataTypeText: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  privacyNote: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
    marginTop: Spacing.xs,
    lineHeight: 16,
  },
  disclaimerSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#141920",
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing["2xl"],
    gap: Spacing.sm,
  },
  disclaimerHeader: {
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  disclaimerIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  disclaimerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
  },
  disclaimerSub: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  disclaimerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  disclaimerItem: {
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  privacyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(99,102,241,0.08)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.xs,
  },
  privacyBoxText: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 17,
  },
  connectBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  connectBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0d0d0d",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  cancelBtnText: {
    fontSize: 15,
    color: Colors.dark.textMuted,
  },
}));

const profileAppearanceStyles = makeReactiveStyles(() => StyleSheet.create({
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.chipBackgroundStrong,
  },
  segmentSelected: {
    backgroundColor: GlowColors.primary,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  segmentLabelSelected: {
    color: "#000",
  },
}));

const seasonStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.backgroundCard,
    borderRadius: 12,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  currentBlock: {
    backgroundColor: "#CCFF0010",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#CCFF0025",
  },
  currentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currentIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#CCFF0020",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  currentName: {
    color: "#CCFF00",
    fontSize: 13,
    fontWeight: "700",
  },
  currentSub: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  activeBadge: {
    backgroundColor: "#CCFF0020",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeBadgeText: {
    color: "#CCFF00",
    fontSize: 11,
    fontWeight: "700",
  },
  statRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
  },
  statTextMuted: {
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border + "30",
    marginHorizontal: 14,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  historyRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border + "30",
  },
  historyName: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "600",
  },
  historySub: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
});
