import React, { useState, useEffect, useMemo } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { useTranslation } from "react-i18next";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform, Linking, Switch, Image as RNImage, Modal, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, CardStyles, GlowColors, TextColors } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useAppMode } from "@/context/AppModeContext";
import { useAuth } from "@/coach/context/AuthContext";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import PinEntryModal from "@/components/PinEntryModal";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { apiRequest, getApiUrl, getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth";
import { usePlayer } from "@/player/context/PlayerContext";
import { SportBadge } from "@/components/SportBadge";
import { SPORTS, getSportConfig, getSportSkillLevelColor } from "@shared/sportConfig";

import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";
type SportProfileRecord = Record<string, { ballLevel?: string | null; skillLevel?: string | null; category?: string | null; rating?: string | null }>;

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

type ProfileTab = "moments" | "friends" | "groups";

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
                <Ionicons name={cfg.icon as any} size={28} color={cfg.color} />
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
              <Ionicons name={cfg.icon as any} size={14} color={isActive ? cfg.color : Colors.dark.textMuted} />
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
                <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
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
    ...Typography.subheading,
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

export default function PlayerProfileScreen() {
  useThemeReactivity();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const track = useTrackFeature();
  const { setMode } = useAppMode();
  const { logout, isGuest } = useAuth();
  const { isBirthday } = usePlayer();
  const [showPinModal, setShowPinModal] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("moments");
  const [showTitlesModal, setShowTitlesModal] = useState(false);
  const [showPlayStyleModal, setShowPlayStyleModal] = useState(false);
  const queryClient = useQueryClient();

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
    _keys: { v2Wallet: string; playerOfWeek: string };
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
  const error = profileGodIsError ? new Error("profile-data failed") : null;
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

  // Live-match polling lives outside the god-query because it needs a
  // 10s cadence (the in-progress match scoreboard chip). We seed it
  // from the god-payload via the priming useEffect below so cold-start
  // shows a value immediately, then this useQuery takes over the
  // periodic refresh.
  const { data: activeLiveMatch } = useQuery<{ matches?: { id: string; sport: string; status: string; creatorId: string; opponentIds: string[] }[] }>({
    queryKey: ["/api/live-scoring/player/me/active"],
    enabled: !!data?.player,
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

      if (Platform.OS === "web") {
        const webAssetFile = (asset as { file?: File }).file;
        if (webAssetFile) {
          formData.append("photo", webAssetFile);
        } else if (asset.uri.startsWith("data:")) {
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          formData.append("photo", blob, filename);
        } else {
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          formData.append("photo", blob, filename);
        }
      } else {
        const { appendImageToFormData } = await import("@/lib/uploads");
        await appendImageToFormData(formData, "photo", asset.uri, type);
      }

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

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>{t("player.profile.loadingProfile")}</Text>
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

  const handleSwitchToCoach = () => {
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
                  <ActivityIndicator size="small" color={Colors.dark.text} />
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
                  name={PLAY_STYLE_META[player.playStyle as PlayStyleKey].icon as any}
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
                        name={badge.iconName as any || "star"} 
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
            <View style={styles.glowBadge}>
              <Ionicons name="flash" size={14} color={Colors.dark.primary} />
              <Text style={styles.glowText}>{player.glowScore} Glow</Text>
            </View>
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
            ] as { tab: ProfileTab; label: string; icon: "grid-outline" | "people-outline" | "people-circle-outline" }[]).map(({ tab, label, icon }) => {
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
                  <Ionicons name={icon} size={16} color={isActive ? Colors.dark.primary : Colors.dark.textMuted} />
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

        {/* Sport Profiles Section */}
        <Text style={styles.sectionGroupHeader}>Sport Profiles</Text>
        <SportProfilesSection
          sportProfiles={player.sportProfiles}
          onUpdateSports={(updatedProfiles) => updateSportProfiles.mutate(updatedProfiles)}
          isSaving={updateSportProfiles.isPending}
        />

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

        {/* Settings grouped list */}
        <Text style={styles.sectionGroupHeader}>{t("player.profile.settings")}</Text>
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
                        } catch (e) {
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
            <ActivityIndicator size="small" color={Colors.dark.error} />
          ) : (
            <Text style={styles.deleteAccountText}>Delete My Account</Text>
          )}
        </Pressable>
      </ScrollView>

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
                    <Ionicons name={meta.icon as any} size={22} color={isSelected ? meta.color : Colors.dark.textMuted} />
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
