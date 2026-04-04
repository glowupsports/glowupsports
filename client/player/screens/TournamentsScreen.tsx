import React, { useState, useEffect } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import {
  Spacing,
  GlowColors,
  TextColors,
  Backgrounds,
} from "@/constants/theme";

import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { apiRequest, apiFetch } from "@/lib/query-client";

type IoniconsName = keyof typeof Ionicons.glyphMap;

type NavigationProp = NativeStackNavigationProp<PlayerStackParamList>;
type TournamentType = "singles" | "doubles" | "mixed";
type TournamentFormat = "knockout" | "round_robin" | "box_league" | "americano";
type TournamentGender = "open" | "male" | "female";
type TabType = "upcoming" | "my_tournaments" | "ladders";

interface Tournament {
  id: string;
  name: string;
  sport: string;
  type: TournamentType;
  format: TournamentFormat;
  gender?: TournamentGender | null;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  location: string;
  address?: string | null;
  entryFee?: number | string | null;
  registrationFee?: number | string | null;
  doublesRegistrationFee?: number | string | null;
  spotsTotal: number;
  spotsTaken: number;
  isRegistered: boolean;
  status: "upcoming" | "registration_open" | "in_progress" | "completed";
  categories?: string[] | null;
  levelMin?: number | string | null;
  levelMax?: number | string | null;
  academyName?: string | null;
  distanceKm?: number | null;
  xpReward?: number | null;
}

interface TournamentData {
  upcoming: Tournament[];
  myTournaments: Tournament[];
  completed: Tournament[];
}

interface Ladder {
  id: string;
  name: string;
  type: TournamentType;
  playerCount: number;
  myPosition: number | null;
  isJoined: boolean;
  challengeWindow: string;
  lastActivity: string;
}

function getSportColor(sport: string): string {
  switch (sport?.toLowerCase()) {
    case "padel": return "#1A6FC4";
    case "pickleball": return "#E07B20";
    case "tennis":
    default: return "#1A8C4C";
  }
}

function getSportLabel(sport: string): string {
  switch (sport?.toLowerCase()) {
    case "padel": return "PADEL";
    case "pickleball": return "PICKLEBALL";
    case "tennis":
    default: return "TENNIS";
  }
}

function getSportIcon(sport: string): IoniconsName {
  switch (sport?.toLowerCase()) {
    case "padel": return "grid-outline";
    case "pickleball": return "ellipse-outline";
    case "tennis":
    default: return "tennisball-outline";
  }
}

function getFormatLabel(format: TournamentFormat, t: (key: string) => string): string {
  switch (format) {
    case "knockout": return t("player.tournaments.knockout");
    case "round_robin": return t("player.tournaments.roundRobin");
    case "box_league": return t("player.tournaments.league");
    case "americano": return "Americano";
    default: return t("player.tournaments.knockout");
  }
}

function getTypeIcon(type: TournamentType): IoniconsName {
  switch (type) {
    case "singles": return "person";
    case "doubles": return "people";
    case "mixed": return "people-circle";
  }
}

function getTypeLabel(type: TournamentType): string {
  switch (type) {
    case "singles": return "Singles";
    case "doubles": return "Doubles";
    case "mixed": return "Mixed";
  }
}

function getGenderIcon(gender: TournamentGender | null | undefined): IoniconsName {
  switch (gender) {
    case "male": return "male";
    case "female": return "female";
    default: return "people-outline";
  }
}

function getGenderLabel(gender: TournamentGender | null | undefined, t: (key: string) => string): string {
  switch (gender) {
    case "male": return t("player.tournaments.genderMale");
    case "female": return t("player.tournaments.genderFemale");
    default: return t("player.tournaments.genderOpen");
  }
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  if (startDate.toDateString() === endDate.toDateString()) {
    return startDate.toLocaleDateString("en-US", opts);
  }
  const shortOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${startDate.toLocaleDateString("en-US", shortOpts)} – ${endDate.toLocaleDateString("en-US", shortOpts)}`;
}

function formatPrice(fee: number | string | null | undefined): string | null {
  if (fee === null || fee === undefined || fee === "" || Number(fee) === 0) return null;
  return `AED ${Number(fee)}`;
}

function getDisplayFee(tournament: Tournament): string | null {
  if (tournament.type === "doubles" && tournament.doublesRegistrationFee) {
    return formatPrice(tournament.doublesRegistrationFee);
  }
  if (tournament.registrationFee) {
    return formatPrice(tournament.registrationFee);
  }
  return formatPrice(tournament.entryFee);
}

function TournamentCard({
  tournament,
  onPress,
  onRegister,
  isRegistering,
}: {
  tournament: Tournament;
  onPress: () => void;
  onRegister: (t: Tournament) => void;
  isRegistering: boolean;
}) {
  const { t } = useTranslation();
  const sportColor = getSportColor(tournament.sport);
  const spotsRemaining = tournament.spotsTotal - tournament.spotsTaken;
  const isFull = spotsRemaining <= 0;
  const isLive = tournament.status === "in_progress";
  const displayFee = getDisplayFee(tournament);
  const avatarColors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"];

  const registerLabel = displayFee
    ? t("player.tournaments.registerWithFee", { fee: displayFee })
    : t("player.tournaments.register");

  const hasLevelRange = tournament.levelMin != null && tournament.levelMax != null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <LinearGradient
        colors={[sportColor, sportColor + "99"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardSportBanner}
      >
        <View style={styles.sportBannerContent}>
          <View style={styles.sportBannerLeft}>
            <Ionicons
              name={getSportIcon(tournament.sport)}
              size={18}
              color="rgba(255,255,255,0.9)"
            />
            <Text style={styles.sportBannerLabel}>{getSportLabel(tournament.sport)}</Text>
          </View>
          <View style={styles.sportBannerRight}>
            {isLive ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            ) : null}
            <View style={styles.genderRow}>
              <Ionicons name={getGenderIcon(tournament.gender)} size={12} color="rgba(255,255,255,0.8)" />
              <Text style={styles.genderBannerText}>{getGenderLabel(tournament.gender, t)}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <View style={styles.badgeRow}>
            <View style={[styles.formatBadge, tournament.format === "americano" ? styles.americanoBadge : null]}>
              <Text style={[styles.formatBadgeText, tournament.format === "americano" ? styles.americanoBadgeText : null]}>
                {getFormatLabel(tournament.format, t)}
              </Text>
            </View>
            {tournament.xpReward ? (
              <View style={styles.xpBadge}>
                <Ionicons name="flash" size={10} color="#FFD700" />
                <Text style={styles.xpBadgeText}>Win {tournament.xpReward} XP</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{tournament.name}</Text>

        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={12} color={TextColors.muted} />
          <Text style={styles.metaText}>
            {formatDateRange(tournament.startDate, tournament.endDate)}
            {tournament.startTime ? `  |  ${tournament.startTime}` : ""}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name={getTypeIcon(tournament.type)} size={12} color={TextColors.muted} />
          <Text style={styles.metaText}>{getTypeLabel(tournament.type)}</Text>
          {hasLevelRange ? (
            <>
              <Text style={styles.metaSeparator}>·</Text>
              <Text style={styles.metaText}>
                {t("player.tournaments.levelRange", {
                  min: Number(tournament.levelMin),
                  max: Number(tournament.levelMax),
                })}
              </Text>
            </>
          ) : tournament.categories && tournament.categories.length > 0 ? (
            <>
              <Text style={styles.metaSeparator}>·</Text>
              <Text style={styles.metaText} numberOfLines={1}>{tournament.categories.join(", ")}</Text>
            </>
          ) : null}
        </View>

        {tournament.academyName ? (
          <View style={styles.metaRow}>
            <Ionicons name="business-outline" size={12} color={TextColors.muted} />
            <Text style={styles.metaText} numberOfLines={1}>{tournament.academyName}</Text>
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={12} color={TextColors.muted} />
          <Text style={styles.metaText} numberOfLines={1}>{tournament.location}</Text>
          {tournament.distanceKm != null ? (
            <Text style={styles.distanceText}>{tournament.distanceKm} km</Text>
          ) : null}
        </View>

        <View style={styles.divider} />

        <View style={styles.cardFooter}>
          <View style={styles.spotsContainer}>
            <View style={styles.avatarStack}>
              {Array.from({ length: Math.min(3, tournament.spotsTaken) }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.avatarCircle,
                    { backgroundColor: avatarColors[i % avatarColors.length], marginLeft: i === 0 ? 0 : -8 },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.spotsText, isFull ? { color: "#FF4D4D" } : undefined]}>
              {isFull
                ? t("player.tournaments.spotsFull")
                : `${tournament.spotsTaken}/${tournament.spotsTotal}`}
            </Text>
          </View>

          <View style={styles.priceCtaRow}>
            <View style={styles.priceBlock}>
              <Text style={styles.priceLabel}>
                {tournament.type === "doubles"
                  ? t("player.tournaments.doublesEntry")
                  : t("player.tournaments.singlesEntry")}
              </Text>
              <Text style={styles.priceValue}>
                {displayFee || t("player.tournaments.freeEntry")}
              </Text>
            </View>

            {tournament.isRegistered ? (
              <View style={styles.registeredBadge}>
                <Ionicons name="checkmark-circle" size={14} color={TextColors.secondary} />
                <Text style={styles.registeredText}>{t("player.tournaments.registered")}</Text>
              </View>
            ) : (
              <Pressable
                style={[styles.registerBtn, isFull ? styles.registerBtnDisabled : undefined]}
                disabled={isFull || isRegistering}
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onRegister(tournament);
                }}
              >
                {isRegistering ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.registerBtnText, isFull ? styles.registerBtnTextDisabled : undefined]}>
                    {isFull ? t("player.tournaments.spotsFull") : registerLabel}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function LadderCard({
  ladder,
  onPress,
  onJoin,
  isJoining,
}: {
  ladder: Ladder;
  onPress: () => void;
  onJoin: (id: string) => void;
  isJoining: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Pressable
      style={({ pressed }) => [styles.ladderCard, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <LinearGradient
        colors={["rgba(255, 255, 255, 0.06)", "rgba(255, 255, 255, 0.08)"]}
        style={styles.ladderGradient}
      >
        <View style={styles.ladderTop}>
          <View style={styles.ladderIcon}>
            <Ionicons name="podium" size={20} color={GlowColors.primary} />
          </View>
          <View style={styles.ladderInfo}>
            <Text style={styles.ladderName} numberOfLines={1}>{ladder.name}</Text>
            <View style={styles.ladderTypeBadge}>
              <Text style={styles.ladderTypeBadgeText}>{getTypeLabel(ladder.type)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.ladderStats}>
          <View style={styles.ladderStat}>
            <Text style={styles.ladderStatValue}>{ladder.playerCount}</Text>
            <Text style={styles.ladderStatLabel}>Players</Text>
          </View>
          {ladder.myPosition ? (
            <View style={styles.ladderStat}>
              <Text style={[styles.ladderStatValue, { color: GlowColors.primary }]}>#{ladder.myPosition}</Text>
              <Text style={styles.ladderStatLabel}>Rank</Text>
            </View>
          ) : null}
          <View style={styles.ladderStat}>
            <Text style={styles.ladderStatValue}>{ladder.challengeWindow}</Text>
            <Text style={styles.ladderStatLabel}>Challenge</Text>
          </View>
        </View>

        <View style={styles.ladderFooter}>
          <View style={styles.activityBadge}>
            <Ionicons name="time" size={11} color={TextColors.muted} />
            <Text style={styles.activityText}>{ladder.lastActivity}</Text>
          </View>
          {ladder.isJoined ? (
            <View style={styles.joinedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#00C853" />
              <Text style={styles.joinedText}>{t("player.tournaments.registered")}</Text>
            </View>
          ) : (
            <Pressable
              style={styles.joinBtn}
              disabled={isJoining}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onJoin(ladder.id);
              }}
            >
              {isJoining ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.joinBtnText}>{t("player.tournaments.joinLadder")}</Text>
              )}
            </Pressable>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function EmptyState({ icon, title }: { icon: IoniconsName; title: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color={TextColors.muted} />
      <Text style={styles.emptyTitle}>{title}</Text>
    </View>
  );
}

export default function TournamentsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const track = useTrackFeature();
  const [activeTab, setActiveTab] = useState<TabType>("upcoming");
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [playerCoords, setPlayerCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPlayerCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    })();
  }, []);

  const tournamentsQueryKey = ["/api/player/tournaments", playerCoords ?? {}] as const;

  const {
    data: tournamentData,
    isLoading: tournamentsLoading,
    refetch: refetchTournaments,
    isRefetching: tournamentsRefetching,
    isError: tournamentsError,
  } = useQuery<TournamentData>({
    queryKey: tournamentsQueryKey,
    queryFn: async () => {
      const path = playerCoords
        ? `/api/player/tournaments?lat=${playerCoords.lat}&lng=${playerCoords.lng}`
        : "/api/player/tournaments";
      const res = await apiFetch(path);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const {
    data: laddersData,
    isLoading: laddersLoading,
    refetch: refetchLadders,
    isRefetching: laddersRefetching,
    isError: laddersError,
  } = useQuery<Ladder[]>({
    queryKey: ["/api/player/ladders"],
  });

  const registerMutation = useMutation({
    mutationFn: ({ tournamentId, category }: { tournamentId: string; category?: string }) =>
      apiRequest("POST", `/api/player/tournaments/${tournamentId}/register`, category ? { category } : {}),
    onMutate: ({ tournamentId }) => {
      setRegisteringId(tournamentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/tournaments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), error.message || "Could not register for this tournament.");
    },
    onSettled: () => {
      setRegisteringId(null);
    },
  });

  const joinLadderMutation = useMutation({
    mutationFn: (ladderId: string) => apiRequest("POST", `/api/player/ladders/${ladderId}/join`),
    onMutate: (ladderId) => {
      setJoiningId(ladderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/ladders"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), error.message || "Could not join this ladder.");
    },
    onSettled: () => {
      setJoiningId(null);
    },
  });

  const upcomingTournaments = tournamentData?.upcoming || [];
  const myTournaments = tournamentData?.myTournaments || [];
  const ladders = laddersData || [];

  const handleTabPress = (tab: TabType) => {
    track(`tournaments:${tab}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const handleTournamentPress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("TournamentDetail", { tournamentId: id });
  };

  const handleLadderPress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("LadderDetail", { ladderId: id });
  };

  const handleRegister = (tournament: Tournament) => {
    track("tournaments:register");
    if (tournament.categories && tournament.categories.length > 0) {
      Alert.alert(
        "Select Category",
        "Choose your registration category:",
        [
          ...tournament.categories.map((cat) => ({
            text: cat,
            onPress: () => registerMutation.mutate({ tournamentId: tournament.id, category: cat }),
          })),
          { text: t("common.cancel"), style: "cancel" as const },
        ]
      );
    } else {
      registerMutation.mutate({ tournamentId: tournament.id });
    }
  };

  const handleJoinLadder = (ladderId: string) => {
    joinLadderMutation.mutate(ladderId);
  };

  const handleRefresh = () => {
    refetchTournaments();
    refetchLadders();
  };

  const isLoading = tournamentsLoading || laddersLoading;
  const isRefetching = tournamentsRefetching || laddersRefetching;

  const tabs = [
    { key: "upcoming" as TabType, label: t("player.tournaments.upcoming"), count: upcomingTournaments.length },
    { key: "my_tournaments" as TabType, label: t("player.tournaments.myTournaments"), count: myTournaments.length },
    { key: "ladders" as TabType, label: t("player.tournaments.ladders"), count: ladders.filter((l) => l.isJoined).length },
  ];

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={GlowColors.primary} />
        </View>
      );
    }

    if (tournamentsError && activeTab !== "ladders") {
      return (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#FF4D4D" />
          <Text style={styles.errorTitle}>{t("common.error")}</Text>
          <Pressable onPress={() => refetchTournaments()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      );
    }

    if (laddersError && activeTab === "ladders") {
      return (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#FF4D4D" />
          <Text style={styles.errorTitle}>{t("common.error")}</Text>
          <Pressable onPress={() => refetchLadders()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      );
    }

    switch (activeTab) {
      case "upcoming":
        return (
          <FlatList
            data={upcomingTournaments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TournamentCard
                tournament={item}
                onPress={() => handleTournamentPress(item.id)}
                onRegister={handleRegister}
                isRegistering={registeringId === item.id}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={handleRefresh}
                tintColor={GlowColors.primary}
              />
            }
            ListEmptyComponent={
              <EmptyState icon="trophy-outline" title={t("player.tournaments.noTournaments")} />
            }
          />
        );
      case "my_tournaments":
        return (
          <FlatList
            data={myTournaments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TournamentCard
                tournament={item}
                onPress={() => handleTournamentPress(item.id)}
                onRegister={handleRegister}
                isRegistering={registeringId === item.id}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={handleRefresh}
                tintColor={GlowColors.primary}
              />
            }
            ListEmptyComponent={
              <EmptyState icon="calendar-outline" title={t("player.tournaments.noTournaments")} />
            }
          />
        );
      case "ladders":
        return (
          <FlatList
            data={ladders}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <LadderCard
                ladder={item}
                onPress={() => handleLadderPress(item.id)}
                onJoin={handleJoinLadder}
                isJoining={joiningId === item.id}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={handleRefresh}
                tintColor={GlowColors.primary}
              />
            }
            ListEmptyComponent={
              <EmptyState icon="podium-outline" title={t("player.tournaments.noTournaments")} />
            }
          />
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={GlowColors.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("player.tournaments.title")}</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key ? styles.tabActive : undefined]}
            onPress={() => handleTabPress(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : undefined]}>
              {tab.label}
            </Text>
            {tab.count > 0 ? (
              <View style={[styles.tabCount, activeTab === tab.key ? styles.tabCountActive : undefined]}>
                <Text style={[styles.tabCountText, activeTab === tab.key ? styles.tabCountTextActive : undefined]}>
                  {tab.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      <View style={styles.content}>{renderContent()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TextColors.primary,
  },
  headerRight: {
    width: 36,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    gap: 6,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabActive: {
    backgroundColor: GlowColors.primary + "20",
    borderColor: GlowColors.primary + "40",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: TextColors.muted,
  },
  tabTextActive: {
    color: GlowColors.primary,
  },
  tabCount: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tabCountActive: {
    backgroundColor: GlowColors.primary + "30",
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: TextColors.muted,
  },
  tabCountTextActive: {
    color: GlowColors.primary,
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.md,
    paddingBottom: 100,
    gap: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TextColors.primary,
    marginTop: 12,
  },
  retryBtn: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  cardSportBanner: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  sportBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sportBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  sportBannerLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(255,255,255,0.95)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sportBannerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  genderBannerText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
  },
  cardBody: {
    padding: Spacing.md,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    flex: 1,
  },
  formatBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  formatBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: TextColors.secondary,
    letterSpacing: 0.3,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  xpBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFD700",
  },
  americanoBadge: {
    backgroundColor: "rgba(138,43,226,0.2)",
    borderWidth: 1,
    borderColor: "rgba(138,43,226,0.5)",
  },
  americanoBadgeText: {
    color: "#BF7FFF",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 77, 77, 0.15)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#FF4D4D",
  },
  liveText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FF4D4D",
  },
  genderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 6,
  },
  genderText: {
    fontSize: 11,
    color: TextColors.muted,
    fontWeight: "500",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TextColors.primary,
    marginBottom: 8,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  metaText: {
    fontSize: 12,
    color: TextColors.secondary,
    flex: 1,
  },
  metaSeparator: {
    fontSize: 12,
    color: TextColors.muted,
  },
  distanceText: {
    fontSize: 11,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 10,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  spotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  spotsText: {
    fontSize: 11,
    color: TextColors.secondary,
    fontWeight: "600",
  },
  priceCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  priceBlock: {
    alignItems: "flex-end",
  },
  priceLabel: {
    fontSize: 9,
    color: TextColors.muted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  priceValue: {
    fontSize: 13,
    fontWeight: "800",
    color: TextColors.primary,
  },
  registeredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  registeredText: {
    fontSize: 11,
    fontWeight: "700",
    color: TextColors.secondary,
  },
  registerBtn: {
    backgroundColor: "#00C853",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    maxWidth: 180,
    alignItems: "center",
  },
  registerBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  registerBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  registerBtnTextDisabled: {
    color: TextColors.muted,
  },
  ladderCard: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  ladderGradient: {
    padding: Spacing.md,
  },
  ladderTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  ladderIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: GlowColors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  ladderInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ladderName: {
    fontSize: 14,
    fontWeight: "700",
    color: TextColors.primary,
    flex: 1,
  },
  ladderTypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  ladderTypeBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: TextColors.secondary,
  },
  ladderStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 10,
  },
  ladderStat: {
    alignItems: "center",
  },
  ladderStatValue: {
    fontSize: 14,
    fontWeight: "700",
    color: TextColors.primary,
  },
  ladderStatLabel: {
    fontSize: 10,
    color: TextColors.muted,
    marginTop: 2,
  },
  ladderFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  activityText: {
    fontSize: 10,
    color: TextColors.muted,
  },
  joinedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 200, 83, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  joinedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#00C853",
  },
  joinBtn: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  joinBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TextColors.primary,
    marginTop: 12,
  },
});
