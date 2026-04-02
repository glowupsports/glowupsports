import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform, Linking, Switch, Image as RNImage, Modal, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, CardStyles, GlowColors } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useAppMode } from "@/context/AppModeContext";
import { useAuth } from "@/coach/context/AuthContext";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import PinEntryModal from "@/components/PinEntryModal";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { apiRequest, getApiUrl, getStaticAssetsUrl } from "@/lib/query-client";
import { formatCredits } from "@/lib/dateUtils";
import { getAuthToken } from "@/lib/auth";
import { useWalkthrough } from "@/player/context/WalkthroughContext";
import { usePlayer } from "@/player/context/PlayerContext";
import { SportBadge } from "@/components/SportBadge";
import { SPORTS, getSportConfig, getSportSkillLevelColor } from "@shared/sportConfig";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { MapLocationPickerModal } from "@/components/MapLocationPickerModal";

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
    attendanceRate: number;
  };
  social: {
    matchesPlayed: number;
    recentPartners: Array<{ id: string; name: string; lastPlayedAt: string }>;
    connectionsCount: number;
  };
}

function StatItem({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <View style={styles.statItem}>
      <View style={styles.statIcon}>
        <Ionicons name={icon as any} size={18} color={Colors.dark.primary} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
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
  rare: Colors.dark.xpCyan,
  epic: "#9B59B6",
  legendary: Colors.dark.orange,
};

type PlayStyleKey = "baseline_warrior" | "net_ninja" | "serve_machine" | "all_court_ace" | "counter_puncher" | "tactical_mastermind";

const PLAY_STYLE_META: Record<PlayStyleKey, { name: string; color: string; icon: string }> = {
  baseline_warrior: { name: "Baseline Warrior", color: "#C8FF3D", icon: "tennisball" },
  net_ninja: { name: "Net Ninja", color: "#00E5FF", icon: "flash" },
  serve_machine: { name: "Serve Machine", color: "#FF8C00", icon: "rocket" },
  all_court_ace: { name: "All-Court Ace", color: "#FFFFFF", icon: "star" },
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
      <Text style={sportSectionStyles.sectionTitle}>Sport Profiles</Text>

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

const sportSectionStyles = StyleSheet.create({
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
});

export default function PlayerProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { setMode } = useAppMode();
  const { logout } = useAuth();
  const { hasSeenScreen, startWalkthrough } = useWalkthrough();
  const { isBirthday } = usePlayer();
  const [showPinModal, setShowPinModal] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("moments");
  const [showTitlesModal, setShowTitlesModal] = useState(false);
  const [showPlayStyleModal, setShowPlayStyleModal] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<ProfileData>({
    queryKey: ["/api/player/me/profile"],
  });

  const { data: groupsData } = useQuery<{ myGroups: GroupData[]; discover: GroupData[] }>({
    queryKey: ["/api/player/groups"],
    enabled: !!data?.player,
  });

  const { data: connectionsData } = useQuery<ConnectionsResponse>({
    queryKey: ["/api/player/connections"],
    enabled: !!data?.player,
  });

  interface DashboardCredits {
    total: number;
    group: number;
    private: number;
    semi_private: number;
  }
  const { data: dashboardData } = useQuery<{ credits?: DashboardCredits }>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!data?.player,
  });

  const { data: activeLiveMatch } = useQuery<{ matches?: Array<{ id: string; sport: string; status: string; creatorId: string; opponentIds: string[] }> }>({
    queryKey: ["/api/live-scoring/player/me/active"],
    enabled: !!data?.player,
    refetchInterval: 10000,
    staleTime: 8000,
  });

  const { data: badgesData } = useQuery<BadgeData[]>({
    queryKey: ["/api/player/badges"],
    enabled: !!data?.player,
  });

  const { data: titlesData } = useQuery<TitleData[]>({
    queryKey: ["/api/player/titles"],
    enabled: !!data?.player,
  });

  const equippedTitle = titlesData?.find(t => t.isEquipped);
  const earnedBadges = badgesData || [];
  const unlockedTitles = titlesData || [];

  useEffect(() => {
    if (!hasSeenScreen("Profile")) {
      const timer = setTimeout(() => {
        startWalkthrough("Profile");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasSeenScreen, startWalkthrough]);


  const equipTitle = useMutation({
    mutationFn: async (titleId: string) => {
      return apiRequest("POST", `/api/player/titles/${titleId}/equip`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/titles"] });
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const updatePlayStyle = useMutation({
    mutationFn: async (playStyle: PlayStyleKey | null) => {
      return apiRequest("PATCH", "/api/player/me/profile", { playStyle });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Could not update sport profile. Please try again.");
    },
  });

  const updateHomeAddress = useMutation({
    mutationFn: async ({ address, lat, lng }: { address: string; lat: number; lng: number }) => {
      return apiRequest("PATCH", "/api/player/me/profile", { homeAddress: address, homeLat: lat, homeLng: lng });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Could not save home address. Please try again.");
    },
  });

  const handleChangePhoto = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Change Photo", "Open the app on your phone to change your profile photo.");
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
        if ((asset as any).file) {
          formData.append("photo", (asset as any).file);
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
        formData.append("photo", {
          uri: asset.uri,
          name: filename,
          type,
        } as any);
      }

      const token = getAuthToken();
      
      const response = await fetch(`${getApiUrl()}/api/player/me/photo`, {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        throw new Error("Failed to upload photo");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Profile photo updated!");
    } catch (error) {
      console.error("Error uploading photo:", error);
      Alert.alert("Error", "Failed to upload photo. Please try again.");
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

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        <Text style={styles.loadingText}>{t("player.profile.loadingProfile")}</Text>
      </View>
    );
  }

  if (error || !data || !data.player) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Unable to load profile</Text>
        <Text style={styles.errorSubtext}>Please try again later</Text>
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
                    source={{ uri: (player.profilePhotoUrl.startsWith('http') || player.profilePhotoUrl.startsWith('data:')) ? player.profilePhotoUrl : `${getStaticAssetsUrl()}${player.profilePhotoUrl}` }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={{ uri: (player.profilePhotoUrl.startsWith('http') || player.profilePhotoUrl.startsWith('data:')) ? player.profilePhotoUrl : `${getStaticAssetsUrl()}${player.profilePhotoUrl}` }}
                    style={styles.avatarImage}
                    contentFit="cover"
                  />
                )
              ) : (
                <LinearGradient
                  colors={[ballColor, Colors.dark.xpCyan]}
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
            {equippedTitle && (
              <View style={[styles.titleBadge, { borderColor: RARITY_COLORS[equippedTitle.rarity] || RARITY_COLORS.common }]}>
                <Ionicons name="ribbon" size={12} color={RARITY_COLORS[equippedTitle.rarity] || RARITY_COLORS.common} />
                <Text style={[styles.titleBadgeText, { color: RARITY_COLORS[equippedTitle.rarity] || RARITY_COLORS.common }]}>
                  {equippedTitle.rarity.charAt(0).toUpperCase() + equippedTitle.rarity.slice(1)}
                </Text>
              </View>
            )}

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
              <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
              <Text style={styles.glowText}>{player.glowScore} Glow</Text>
            </View>
            {isBirthday ? (
              <View style={styles.birthdayBadge}>
                <Text style={styles.birthdayIcon}>🎂</Text>
                <Text style={styles.birthdayText}>Birthday!</Text>
              </View>
            ) : null}
          </View>

          {/* Open to Play Toggle */}
          <View style={styles.openToPlayCard}>
            <LinearGradient
              colors={player.openToPlay 
                ? [Colors.dark.primary + "30", Colors.dark.primary + "10"]
                : ["rgba(50, 50, 50, 0.6)", "rgba(40, 40, 40, 0.4)"]
              }
              style={styles.openToPlayGradient}
            >
              <View style={styles.openToPlayContent}>
                <View style={styles.openToPlayLeft}>
                  <View style={[styles.openToPlayIcon, player.openToPlay && styles.openToPlayIconActive]}>
                    <Ionicons 
                      name="tennisball" 
                      size={20} 
                      color={player.openToPlay ? Colors.dark.primary : Colors.dark.textMuted} 
                    />
                  </View>
                  <View>
                    <Text style={[styles.openToPlayTitle, player.openToPlay && styles.openToPlayTitleActive]}>
                      Open to Play
                    </Text>
                    <Text style={styles.openToPlaySubtitle}>
                      {player.openToPlay ? "Others can find you for matches" : "Hidden from match search"}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={player.openToPlay}
                  onValueChange={(value) => toggleOpenToPlay.mutate(value)}
                  trackColor={{ 
                    false: "rgba(255, 255, 255, 0.06)", 
                    true: GlowColors.primary + "80" 
                  }}
                  thumbColor={player.openToPlay ? GlowColors.primary : Colors.dark.textMuted}
                  disabled={toggleOpenToPlay.isPending}
                />
              </View>
            </LinearGradient>
          </View>

          {/* Home Address Section */}
          <View style={styles.openToPlayCard}>
            <LinearGradient
              colors={player.homeAddress 
                ? [Colors.dark.xpCyan + "25", Colors.dark.xpCyan + "10"]
                : ["rgba(50, 50, 50, 0.6)", "rgba(40, 40, 40, 0.4)"]
              }
              style={styles.openToPlayGradient}
            >
              <View style={{ paddingBottom: player.homeAddress ? Spacing.sm : 0 }}>
                <View style={styles.openToPlayContent}>
                  <View style={styles.openToPlayLeft}>
                    <View style={[styles.openToPlayIcon, player.homeAddress ? styles.openToPlayIconActive : {}]}>
                      <Ionicons 
                        name="home" 
                        size={20} 
                        color={player.homeAddress ? Colors.dark.xpCyan : Colors.dark.textMuted} 
                      />
                    </View>
                    <View>
                      <Text style={[styles.openToPlayTitle, player.homeAddress ? { color: Colors.dark.xpCyan } : {}]}>
                        Home Address
                      </Text>
                      <Text style={styles.openToPlaySubtitle}>
                        {player.homeAddress ? "Used for distance & travel time" : "Set for travel time features"}
                      </Text>
                    </View>
                  </View>
                  {updateHomeAddress.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
                  ) : null}
                </View>
                {player.homeAddress ? (
                  <View style={{ paddingHorizontal: Spacing.md, marginTop: -Spacing.xs }}>
                    <Text style={{ fontSize: Typography.small.fontSize, color: Colors.dark.textMuted }} numberOfLines={2}>
                      {player.homeAddress}
                    </Text>
                  </View>
                ) : null}
                <View style={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.sm }}>
                  <AddressAutocomplete
                    placeholder={player.homeAddress ? "Update home address..." : "Search for your home address..."}
                    initialValue=""
                    onSelect={({ address, lat, lng }) => {
                      updateHomeAddress.mutate({ address, lat, lng });
                    }}
                  />
                  {/* Pick on map button */}
                  <Pressable
                    style={styles.pickOnMapBtn}
                    onPress={() => setShowMapPicker(true)}
                  >
                    <Ionicons name="map-outline" size={14} color={Colors.dark.xpCyan} />
                    <Text style={styles.pickOnMapText}>Pick on map</Text>
                  </Pressable>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Map location picker modal */}
          <MapLocationPickerModal
            visible={showMapPicker}
            onClose={() => setShowMapPicker(false)}
            onConfirm={({ address, lat, lng }) => {
              updateHomeAddress.mutate({ address, lat, lng });
            }}
            initialLat={player.homeLat}
            initialLng={player.homeLng}
          />

          {/* Player Identity */}
          <View style={styles.identityRow}>
            {player.dominantHand ? (
              <View style={styles.identityChip}>
                <Ionicons name="hand-left" size={14} color={Colors.dark.xpCyan} />
                <Text style={styles.identityText}>
                  {player.dominantHand === "left" ? "Left" : "Right"} Hand
                </Text>
              </View>
            ) : null}
            {player.preferredPlayType ? (
              <View style={styles.identityChip}>
                <Ionicons 
                  name={player.preferredPlayType === "doubles" ? "people" : "person"} 
                  size={14} 
                  color={Colors.dark.xpCyan} 
                />
                <Text style={styles.identityText}>
                  {player.preferredPlayType === "singles" ? "Singles" : 
                   player.preferredPlayType === "doubles" ? "Doubles" : "Both"}
                </Text>
              </View>
            ) : null}
            {player.matchPreference ? (
              <View style={styles.identityChip}>
                <Ionicons name="trophy" size={14} color={Colors.dark.gold} />
                <Text style={styles.identityText}>
                  {player.matchPreference.charAt(0).toUpperCase() + player.matchPreference.slice(1)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Social Signals Card */}
        {data?.social ? (
          <View style={styles.socialCard}>
            <LinearGradient
              colors={["rgba(0, 212, 255, 0.08)", "rgba(46, 204, 64, 0.05)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.socialGradient}
            >
              <Text style={styles.socialTitle}>Social</Text>
              <View style={styles.socialStats}>
                <View style={styles.socialStat}>
                  <Text style={styles.socialStatValue}>{data.social.matchesPlayed}</Text>
                  <Text style={styles.socialStatLabel}>Matches</Text>
                </View>
                <View style={styles.socialDivider} />
                <View style={styles.socialStat}>
                  <Text style={styles.socialStatValue}>{data.social.connectionsCount}</Text>
                  <Text style={styles.socialStatLabel}>Connections</Text>
                </View>
              </View>
              {data.social.recentPartners.length > 0 ? (
                <View style={styles.recentPartnersSection}>
                  <Text style={styles.recentPartnersLabel}>Recently Played With</Text>
                  <View style={styles.recentPartnersAvatars}>
                    {data.social.recentPartners.slice(0, 5).map((partner, index) => (
                      <View 
                        key={partner.id} 
                        style={[styles.partnerAvatar, { marginLeft: index > 0 ? -12 : 0, zIndex: 5 - index }]}
                      >
                        <Text style={styles.partnerAvatarText}>{partner.name.charAt(0)}</Text>
                      </View>
                    ))}
                    {data.social.recentPartners.length > 5 ? (
                      <View style={[styles.partnerAvatar, styles.partnerAvatarMore, { marginLeft: -12 }]}>
                        <Text style={styles.partnerAvatarMoreText}>+{data.social.recentPartners.length - 5}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </LinearGradient>
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

        {/* Match History Button */}
        <Pressable
          style={({ pressed }) => [profileStyles.matchHistoryBtn, pressed && { opacity: 0.75 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate("MatchHistory");
          }}
        >
          <Ionicons name="trophy-outline" size={18} color="#CCFF00" />
          <Text style={profileStyles.matchHistoryBtnText}>Match History</Text>
          <View style={profileStyles.matchHistoryBtnSpacer} />
          <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
        </Pressable>

        {/* My Credits Section - matches Home screen design */}
        {dashboardData?.credits ? (
          <View style={styles.creditsCard}>
            <View style={styles.creditsHeader}>
              <Ionicons name="ticket-outline" size={14} color={Colors.dark.gold} />
              <Text style={styles.creditsTitle}>{t("player.profile.myCredits")}</Text>
            </View>
            <View style={styles.creditsTotalRow}>
              <Text style={styles.creditsTotalValue}>{formatCredits(dashboardData.credits.total)}</Text>
              <Text style={styles.creditsTotalLabel}>{t("player.profile.totalAvailable")}</Text>
            </View>
            {dashboardData.credits.total > 0 ? (
              <View style={styles.creditsTypeRow}>
                <View style={styles.creditsTypeItem}>
                  <Text style={styles.creditsTypeValue}>{formatCredits(dashboardData.credits.group)}</Text>
                  <Text style={styles.creditsTypeLabel}>{t("player.profile.group")}</Text>
                </View>
                <View style={styles.creditsTypeItem}>
                  <Text style={styles.creditsTypeValue}>{formatCredits(dashboardData.credits.private)}</Text>
                  <Text style={styles.creditsTypeLabel}>{t("player.profile.private")}</Text>
                </View>
                <View style={styles.creditsTypeItem}>
                  <Text style={styles.creditsTypeValue}>{formatCredits(dashboardData.credits.semi_private)}</Text>
                  <Text style={styles.creditsTypeLabel}>{t("player.profile.semiPrivate")}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.creditsEmptyText}>{t("player.profile.noCreditsAvailable")}</Text>
            )}
            <Pressable 
              style={styles.buyCreditsButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (player?.id) {
                  navigation.navigate("ParentCreditStore", { playerId: player.id });
                }
              }}
            >
              <LinearGradient
                colors={[Colors.dark.gold, "#D4A100"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buyCreditsGradient}
              >
                <Ionicons name="cart-outline" size={14} color={Colors.dark.backgroundRoot} />
                <Text style={styles.buyCreditsText}>{t("player.profile.buyCredits")}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}

        {/* Profile Tabs: Moments, Friends, Groups */}
        <View style={styles.profileTabs}>
          <Pressable
            style={[styles.profileTab, activeTab === "moments" && styles.profileTabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab("moments");
            }}
          >
            <Ionicons 
              name="grid" 
              size={20} 
              color={activeTab === "moments" ? Colors.dark.xpCyan : Colors.dark.textMuted} 
            />
            <Text style={[styles.profileTabText, activeTab === "moments" && styles.profileTabTextActive]}>
              {t("player.profile.moments")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.profileTab, activeTab === "friends" && styles.profileTabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab("friends");
            }}
          >
            <Ionicons 
              name="people" 
              size={20} 
              color={activeTab === "friends" ? Colors.dark.xpCyan : Colors.dark.textMuted} 
            />
            <Text style={[styles.profileTabText, activeTab === "friends" && styles.profileTabTextActive]}>
              {t("player.profile.friends")} ({connectionsData?.friends?.length || 0})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.profileTab, activeTab === "groups" && styles.profileTabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab("groups");
            }}
          >
            <Ionicons 
              name="people-circle" 
              size={20} 
              color={activeTab === "groups" ? Colors.dark.xpCyan : Colors.dark.textMuted} 
            />
            <Text style={[styles.profileTabText, activeTab === "groups" && styles.profileTabTextActive]}>
              {t("player.profile.groups")} ({groupsData?.myGroups?.length || 0})
            </Text>
          </Pressable>
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

        <View style={styles.statsCard}>
          <View style={styles.statsGridCompact}>
            <StatItem 
              label={t("player.profile.streak")} 
              value={`${player.streak} ${t("player.profile.days")}`} 
              icon="flame" 
            />
            <StatItem 
              label={t("player.profile.sessions")} 
              value={stats.sessionsAttended} 
              icon="tennisball" 
            />
          </View>
        </View>

        {coach ? (
          <View style={styles.coachCard}>
            <Text style={styles.sectionTitle}>{t("player.profile.yourCoach")}</Text>
            <View style={styles.coachInfo}>
              <View style={styles.coachAvatar}>
                <Text style={styles.coachAvatarText}>{coach.name.charAt(0)}</Text>
              </View>
              <View style={styles.coachDetails}>
                <Text style={styles.coachName}>{coach.name}</Text>
                {coach.email ? (
                  <Text style={styles.coachEmail}>{coach.email}</Text>
                ) : null}
              </View>
              <Pressable 
                style={styles.chatButton}
                onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              >
                <Ionicons name="chatbubble" size={18} color={Colors.dark.primary} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {academy ? (
          <View style={styles.academyCardPrimary}>
            <LinearGradient
              colors={["rgba(46, 204, 64, 0.1)", "rgba(0, 212, 255, 0.05)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.academyGradient}
            >
              <View style={styles.academyIcon}>
                <Ionicons name="tennisball" size={28} color={Colors.dark.primary} />
              </View>
              <Text style={styles.memberOfLabel}>{t("player.profile.memberOf")}</Text>
              <Text style={styles.academyNameLarge}>{academy.name}</Text>
              <Text style={styles.memberSinceSmall}>{t("player.profile.since")} {memberSince}</Text>
            </LinearGradient>
          </View>
        ) : null}

        {/* Sport Profiles Section */}
        <SportProfilesSection
          sportProfiles={player.sportProfiles}
          onUpdateSports={(updatedProfiles) => updateSportProfiles.mutate(updatedProfiles)}
          isSaving={updateSportProfiles.isPending}
        />

        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>{t("player.profile.settings")}</Text>
          
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

        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>{t("player.profile.discover")}</Text>
          
          <Pressable 
            style={styles.settingsItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("CoachDirectory");
            }}
          >
            <View style={[styles.settingsIcon, { backgroundColor: "rgba(0, 212, 255, 0.15)" }]}>
              <Ionicons name="people-outline" size={20} color={Colors.dark.xpCyan} />
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
            style={styles.settingsItem}
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
            <>
              <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
              <Text style={styles.deleteAccountText}>Delete My Account</Text>
            </>
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
                      { borderColor: isSelected ? meta.color : "rgba(255,255,255,0.08)" },
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
                        <Ionicons name="checkmark" size={10} color="#000" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
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
    backgroundColor: "rgba(200, 255, 61, 0.12)",
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
    width: 100,
    height: 100,
    borderRadius: 50,
    padding: 3,
  },
  avatarGradientInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    padding: 3,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Backgrounds.card,
  },
  avatarImageWithBorder: {
    width: 100,
    height: 100,
    borderRadius: 50,
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
    borderRadius: 47,
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
    color: Colors.dark.backgroundRoot,
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
    color: Colors.dark.xpCyan,
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
  statsCard: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sportLevelChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  sportLevelChipActive: {
    backgroundColor: `${Colors.dark.gold}20`,
    borderColor: Colors.dark.gold,
  },
  sportLevelChipText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  sportLevelChipTextActive: {
    color: Colors.dark.gold,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  statItem: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Backgrounds.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  coachCard: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  coachInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  coachAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  coachAvatarText: {
    ...Typography.h4,
    color: Colors.dark.backgroundRoot,
  },
  coachDetails: {
    flex: 1,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachEmail: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  chatButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
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
  statsGridCompact: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
  },
  academyCardPrimary: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(46, 204, 64, 0.2)",
  },
  academyGradient: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  academyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  memberOfLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  academyNameLarge: {
    ...Typography.h3,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: 4,
  },
  memberSinceSmall: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
  settingsSection: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xs,
  },
  deleteAccountText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.error,
    opacity: 0.7,
  },
  openToPlayCard: {
    width: "100%",
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  pickOnMapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  pickOnMapText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.xpCyan,
    fontWeight: "500",
  },
  openToPlayGradient: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  openToPlayContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  openToPlayLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  openToPlayIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(100, 100, 100, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  openToPlayIconActive: {
    backgroundColor: Colors.dark.primary + "30",
  },
  openToPlayTitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  openToPlayTitleActive: {
    color: Colors.dark.primary,
  },
  openToPlaySubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  identityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  identityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.lg,
  },
  identityText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "500",
  },
  socialCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  socialGradient: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.15)",
  },
  socialTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.md,
  },
  socialStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xl,
  },
  socialStat: {
    alignItems: "center",
  },
  socialStatValue: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  socialStatLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  socialDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  recentPartnersSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  recentPartnersLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  recentPartnersAvatars: {
    flexDirection: "row",
  },
  partnerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.xpCyan,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  partnerAvatarText: {
    ...Typography.small,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  partnerAvatarMore: {
    backgroundColor: Backgrounds.card,
  },
  partnerAvatarMoreText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
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
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  profileTabs: {
    flexDirection: "row",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  profileTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  profileTabActive: {
    backgroundColor: Colors.dark.backgroundDefault,
  },
  profileTabText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  profileTabTextActive: {
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  tabContent: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
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
    color: Colors.dark.backgroundRoot,
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
    backgroundColor: "rgba(200, 255, 61, 0.15)",
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
    color: GlowColors.primary,
    fontWeight: "600",
  },
  equipButton: {
    backgroundColor: Colors.dark.xpCyan + "30",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  equipButtonText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
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
    backgroundColor: "rgba(255,255,255,0.04)",
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
    backgroundColor: "rgba(255,255,255,0.03)",
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
});

const profileStyles = StyleSheet.create({
  matchHistoryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(204,255,0,0.06)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(204,255,0,0.15)",
    marginHorizontal: Spacing.xs,
  },
  matchHistoryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
    flex: 1,
  },
  matchHistoryBtnSpacer: {
    flex: 1,
  },
  liveMatchBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255,68,68,0.08)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,68,68,0.25)",
    marginHorizontal: Spacing.xs,
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
});
