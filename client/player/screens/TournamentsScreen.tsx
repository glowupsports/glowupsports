import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {
  Colors,
  Spacing,
  Typography,
  BorderRadius,
  Backgrounds,
  GlowColors,
  TextColors,
} from "@/constants/theme";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

type NavigationProp = NativeStackNavigationProp<PlayerStackParamList>;

type TournamentType = "singles" | "doubles" | "mixed";
type TournamentFormat = "knockout" | "round_robin" | "box_league";
type TabType = "upcoming" | "my_tournaments" | "ladders";

interface Tournament {
  id: string;
  name: string;
  type: TournamentType;
  format: TournamentFormat;
  startDate: string;
  endDate: string;
  location: string;
  entryFee: number | null;
  spotsTotal: number;
  spotsTaken: number;
  isRegistered: boolean;
  status: "upcoming" | "in_progress" | "completed";
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

const MOCK_TOURNAMENTS: Tournament[] = [
  {
    id: "1",
    name: "Summer Singles Championship",
    type: "singles",
    format: "knockout",
    startDate: "2026-02-15",
    endDate: "2026-02-22",
    location: "Central Tennis Club",
    entryFee: 25,
    spotsTotal: 32,
    spotsTaken: 24,
    isRegistered: false,
    status: "upcoming",
  },
  {
    id: "2",
    name: "Mixed Doubles Classic",
    type: "mixed",
    format: "round_robin",
    startDate: "2026-02-28",
    endDate: "2026-03-07",
    location: "Riverside Courts",
    entryFee: 40,
    spotsTotal: 16,
    spotsTaken: 12,
    isRegistered: false,
    status: "upcoming",
  },
  {
    id: "3",
    name: "Winter Box League",
    type: "singles",
    format: "box_league",
    startDate: "2026-03-01",
    endDate: "2026-04-30",
    location: "Various Venues",
    entryFee: null,
    spotsTotal: 48,
    spotsTaken: 36,
    isRegistered: false,
    status: "upcoming",
  },
  {
    id: "4",
    name: "Doubles Team Challenge",
    type: "doubles",
    format: "knockout",
    startDate: "2026-03-15",
    endDate: "2026-03-16",
    location: "Elite Tennis Academy",
    entryFee: 30,
    spotsTotal: 16,
    spotsTaken: 8,
    isRegistered: false,
    status: "upcoming",
  },
];

const MOCK_MY_TOURNAMENTS: Tournament[] = [
  {
    id: "5",
    name: "Club Championship 2026",
    type: "singles",
    format: "knockout",
    startDate: "2026-02-01",
    endDate: "2026-02-08",
    location: "Home Club",
    entryFee: 15,
    spotsTotal: 32,
    spotsTaken: 32,
    isRegistered: true,
    status: "in_progress",
  },
  {
    id: "6",
    name: "Junior Doubles Festival",
    type: "doubles",
    format: "round_robin",
    startDate: "2026-01-20",
    endDate: "2026-01-25",
    location: "Academy Courts",
    entryFee: null,
    spotsTotal: 24,
    spotsTaken: 24,
    isRegistered: true,
    status: "completed",
  },
];

const MOCK_LADDERS: Ladder[] = [
  {
    id: "l1",
    name: "Academy Singles Ladder",
    type: "singles",
    playerCount: 45,
    myPosition: 12,
    isJoined: true,
    challengeWindow: "Mon-Sun",
    lastActivity: "2 days ago",
  },
  {
    id: "l2",
    name: "Open Doubles Ladder",
    type: "doubles",
    playerCount: 28,
    myPosition: null,
    isJoined: false,
    challengeWindow: "Weekends only",
    lastActivity: "1 day ago",
  },
  {
    id: "l3",
    name: "Junior Challenge Ladder",
    type: "singles",
    playerCount: 32,
    myPosition: 5,
    isJoined: true,
    challengeWindow: "Daily",
    lastActivity: "Today",
  },
];

function getTypeColor(type: TournamentType): string {
  switch (type) {
    case "singles":
      return GlowColors.primary;
    case "doubles":
      return "#00D4FF";
    case "mixed":
      return "#E040FB";
  }
}

function getTypeBadge(type: TournamentType): string {
  switch (type) {
    case "singles":
      return "Singles";
    case "doubles":
      return "Doubles";
    case "mixed":
      return "Mixed";
  }
}

function getFormatDisplay(format: TournamentFormat): string {
  switch (format) {
    case "knockout":
      return "Knock-out";
    case "round_robin":
      return "Round Robin";
    case "box_league":
      return "Box League";
  }
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${startDate.toLocaleDateString("en-US", options)} - ${endDate.toLocaleDateString("en-US", options)}`;
}

function TournamentCard({ tournament, onPress }: { tournament: Tournament; onPress: () => void }) {
  const typeColor = getTypeColor(tournament.type);
  const spotsRemaining = tournament.spotsTotal - tournament.spotsTaken;
  const isFull = spotsRemaining <= 0;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tournamentCard,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.tournamentName} numberOfLines={1}>
            {tournament.name}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + "20" }]}>
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>
              {getTypeBadge(tournament.type)}
            </Text>
          </View>
        </View>
        <View style={styles.formatRow}>
          <Ionicons name="trophy-outline" size={14} color={TextColors.muted} />
          <Text style={styles.formatText}>{getFormatDisplay(tournament.format)}</Text>
        </View>
      </View>

      <View style={styles.cardDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={16} color={TextColors.secondary} />
          <Text style={styles.detailText}>
            {formatDateRange(tournament.startDate, tournament.endDate)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={16} color={TextColors.secondary} />
          <Text style={styles.detailText} numberOfLines={1}>
            {tournament.location}
          </Text>
        </View>
        <View style={styles.cardFooter}>
          <View style={styles.statsRow}>
            {tournament.entryFee ? (
              <View style={styles.stat}>
                <Ionicons name="ticket-outline" size={14} color={GlowColors.primary} />
                <Text style={styles.statValue}>${tournament.entryFee}</Text>
              </View>
            ) : (
              <View style={styles.stat}>
                <Ionicons name="gift-outline" size={14} color="#00E676" />
                <Text style={[styles.statValue, { color: "#00E676" }]}>Free</Text>
              </View>
            )}
            <View style={styles.stat}>
              <Ionicons 
                name="people-outline" 
                size={14} 
                color={isFull ? "#FF4D4D" : TextColors.secondary} 
              />
              <Text style={[styles.statValue, isFull && { color: "#FF4D4D" }]}>
                {spotsRemaining} spots left
              </Text>
            </View>
          </View>
          {!tournament.isRegistered ? (
            <Pressable
              style={[styles.registerButton, isFull && styles.registerButtonDisabled]}
              disabled={isFull}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
            >
              <Text style={[styles.registerButtonText, isFull && styles.registerButtonTextDisabled]}>
                {isFull ? "Full" : "Register"}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.registeredBadge}>
              <Ionicons name="checkmark-circle" size={16} color={GlowColors.primary} />
              <Text style={styles.registeredText}>Registered</Text>
            </View>
          )}
        </View>
      </View>

      {tournament.status === "in_progress" && (
        <View style={styles.statusBadge}>
          <View style={styles.liveIndicator} />
          <Text style={styles.statusText}>In Progress</Text>
        </View>
      )}
      {tournament.status === "completed" && (
        <View style={[styles.statusBadge, { backgroundColor: "rgba(255, 255, 255, 0.1)" }]}>
          <Ionicons name="checkmark" size={12} color={TextColors.muted} />
          <Text style={[styles.statusText, { color: TextColors.muted }]}>Completed</Text>
        </View>
      )}
    </Pressable>
  );
}

function LadderCard({ ladder, onPress }: { ladder: Ladder; onPress: () => void }) {
  const typeColor = getTypeColor(ladder.type);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.ladderCard,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.ladderHeader}>
        <View style={styles.ladderTitleRow}>
          <Ionicons name="podium-outline" size={24} color={GlowColors.primary} />
          <View style={styles.ladderTitleContent}>
            <Text style={styles.ladderName}>{ladder.name}</Text>
            <View style={[styles.typeBadge, { backgroundColor: typeColor + "20" }]}>
              <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                {getTypeBadge(ladder.type)}
              </Text>
            </View>
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
            <Text style={[styles.ladderStatValue, { color: GlowColors.primary }]}>
              #{ladder.myPosition}
            </Text>
            <Text style={styles.ladderStatLabel}>My Position</Text>
          </View>
        ) : null}
        <View style={styles.ladderStat}>
          <Text style={styles.ladderStatValue}>{ladder.challengeWindow}</Text>
          <Text style={styles.ladderStatLabel}>Challenge Window</Text>
        </View>
      </View>

      <View style={styles.ladderFooter}>
        <View style={styles.activityRow}>
          <Ionicons name="time-outline" size={14} color={TextColors.muted} />
          <Text style={styles.activityText}>Last activity: {ladder.lastActivity}</Text>
        </View>
        {ladder.isJoined ? (
          <View style={styles.joinedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={GlowColors.primary} />
            <Text style={styles.joinedText}>Joined</Text>
          </View>
        ) : (
          <Pressable
            style={styles.joinButton}
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
          >
            <Text style={styles.joinButtonText}>Join Ladder</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function TabButton({
  label,
  isActive,
  onPress,
  count,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
  count?: number;
}) {
  return (
    <Pressable
      style={[styles.tabButton, isActive && styles.tabButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
        {label}
      </Text>
      {count !== undefined && count > 0 && (
        <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
          <Text style={[styles.countText, isActive && styles.countTextActive]}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function TournamentsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>("upcoming");

  const handleTournamentPress = (tournamentId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("TournamentDetail", { tournamentId });
  };

  const handleLadderPress = (ladderId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("LadderDetail", { ladderId });
  };

  const renderContent = () => {
    switch (activeTab) {
      case "upcoming":
        return (
          <FlatList
            data={MOCK_TOURNAMENTS}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TournamentCard
                tournament={item}
                onPress={() => handleTournamentPress(item.id)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="trophy-outline" size={48} color={TextColors.muted} />
                <Text style={styles.emptyTitle}>No Upcoming Tournaments</Text>
                <Text style={styles.emptyText}>
                  Check back later for new tournaments to join
                </Text>
              </View>
            }
          />
        );

      case "my_tournaments":
        return (
          <FlatList
            data={MOCK_MY_TOURNAMENTS}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TournamentCard
                tournament={item}
                onPress={() => handleTournamentPress(item.id)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color={TextColors.muted} />
                <Text style={styles.emptyTitle}>No Registered Tournaments</Text>
                <Text style={styles.emptyText}>
                  Register for upcoming tournaments to see them here
                </Text>
              </View>
            }
          />
        );

      case "ladders":
        return (
          <FlatList
            data={MOCK_LADDERS}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <LadderCard ladder={item} onPress={() => handleLadderPress(item.id)} />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="podium-outline" size={48} color={TextColors.muted} />
                <Text style={styles.emptyTitle}>No Active Ladders</Text>
                <Text style={styles.emptyText}>
                  Join a ladder to compete against other players
                </Text>
              </View>
            }
          />
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={GlowColors.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Tournaments</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
          <TabButton
            label="Upcoming"
            isActive={activeTab === "upcoming"}
            onPress={() => setActiveTab("upcoming")}
            count={MOCK_TOURNAMENTS.length}
          />
          <TabButton
            label="My Tournaments"
            isActive={activeTab === "my_tournaments"}
            onPress={() => setActiveTab("my_tournaments")}
            count={MOCK_MY_TOURNAMENTS.length}
          />
          <TabButton
            label="Ladders"
            isActive={activeTab === "ladders"}
            onPress={() => setActiveTab("ladders")}
            count={MOCK_LADDERS.filter((l) => l.isJoined).length}
          />
        </ScrollView>
      </View>

      <View style={styles.content}>{renderContent()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.h2,
    color: TextColors.primary,
  },
  headerRight: {
    width: 40,
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  tabsScroll: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  tabButtonActive: {
    backgroundColor: GlowColors.primary + "20",
    borderColor: GlowColors.primary + "40",
  },
  tabButtonText: {
    ...Typography.small,
    color: TextColors.muted,
    fontWeight: "500",
  },
  tabButtonTextActive: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  countBadge: {
    marginLeft: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  countBadgeActive: {
    backgroundColor: GlowColors.primary + "30",
  },
  countText: {
    fontSize: 11,
    fontWeight: "600",
    color: TextColors.muted,
  },
  countTextActive: {
    color: GlowColors.primary,
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  tournamentCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  cardHeader: {
    marginBottom: Spacing.md,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  tournamentName: {
    ...Typography.h3,
    color: TextColors.primary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  formatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  formatText: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  cardDetails: {
    gap: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  detailText: {
    ...Typography.small,
    color: TextColors.secondary,
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statValue: {
    ...Typography.caption,
    color: TextColors.secondary,
    fontWeight: "500",
  },
  registerButton: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  registerButtonDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  registerButtonText: {
    ...Typography.caption,
    color: Backgrounds.root,
    fontWeight: "700",
  },
  registerButtonTextDisabled: {
    color: TextColors.muted,
  },
  registeredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  registeredText: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  statusBadge: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 77, 77, 0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF4D4D",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#FF4D4D",
    textTransform: "uppercase",
  },
  ladderCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  ladderHeader: {
    marginBottom: Spacing.md,
  },
  ladderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  ladderTitleContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ladderName: {
    ...Typography.h3,
    color: TextColors.primary,
    flex: 1,
  },
  ladderStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  ladderStat: {
    alignItems: "center",
  },
  ladderStatValue: {
    ...Typography.h3,
    color: TextColors.primary,
  },
  ladderStatLabel: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  ladderFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.md,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  activityText: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  joinButton: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  joinButtonText: {
    ...Typography.caption,
    color: Backgrounds.root,
    fontWeight: "700",
  },
  joinedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  joinedText: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["4xl"],
  },
  emptyTitle: {
    ...Typography.h3,
    color: TextColors.primary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.small,
    color: TextColors.muted,
    textAlign: "center",
  },
});
