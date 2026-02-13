import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {
  Spacing,
  Typography,
  BorderRadius,
  Backgrounds,
  GlowColors,
  TextColors,
} from "@/constants/theme";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { useCoachMarks, CoachMarkTarget } from "@/components/CoachMarks";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
    case "singles": return GlowColors.primary;
    case "doubles": return "#00D4FF";
    case "mixed": return "#E040FB";
  }
}

function getTypeBadge(type: TournamentType): string {
  switch (type) {
    case "singles": return "SINGLES";
    case "doubles": return "DOUBLES";
    case "mixed": return "MIXED";
  }
}

function getFormatIcon(format: TournamentFormat): string {
  switch (format) {
    case "knockout": return "git-network-outline";
    case "round_robin": return "sync-outline";
    case "box_league": return "grid-outline";
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
  const fillPercent = (tournament.spotsTaken / tournament.spotsTotal) * 100;

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      {tournament.status === "in_progress" && (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}
      
      <View style={styles.cardTop}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{tournament.name}</Text>
          <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
            <Text style={styles.typeBadgeText}>{getTypeBadge(tournament.type)}</Text>
          </View>
        </View>
        
        <View style={styles.formatRow}>
          <Ionicons name={getFormatIcon(tournament.format) as any} size={12} color={TextColors.muted} />
          <Text style={styles.formatText}>
            {tournament.format === "knockout" ? "Knockout" : tournament.format === "round_robin" ? "Round Robin" : "Box League"}
          </Text>
        </View>
      </View>

      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar" size={13} color={TextColors.muted} />
          <Text style={styles.metaText}>{formatDateRange(tournament.startDate, tournament.endDate)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="location" size={13} color={TextColors.muted} />
          <Text style={styles.metaText} numberOfLines={1}>{tournament.location}</Text>
        </View>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${fillPercent}%`, backgroundColor: isFull ? "#FF4D4D" : GlowColors.primary }]} />
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.footerLeft}>
          <View style={styles.priceBadge}>
            {tournament.entryFee ? (
              <>
                <Ionicons name="cash" size={12} color={GlowColors.primary} />
                <Text style={styles.priceText}>${tournament.entryFee}</Text>
              </>
            ) : (
              <>
                <Ionicons name="gift" size={12} color="#00E676" />
                <Text style={[styles.priceText, { color: "#00E676" }]}>Free</Text>
              </>
            )}
          </View>
          <View style={styles.spotsBadge}>
            <Ionicons name="people" size={12} color={isFull ? "#FF4D4D" : TextColors.secondary} />
            <Text style={[styles.spotsText, isFull && { color: "#FF4D4D" }]}>
              {isFull ? "Full" : `${spotsRemaining} spots`}
            </Text>
          </View>
        </View>

        {tournament.isRegistered ? (
          <View style={styles.registeredBadge}>
            <Ionicons name="checkmark-circle" size={14} color={GlowColors.primary} />
            <Text style={styles.registeredText}>Entered</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.registerBtn, isFull && styles.registerBtnDisabled]}
            disabled={isFull}
            onPress={(e) => { e.stopPropagation(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          >
            <Text style={[styles.registerBtnText, isFull && styles.registerBtnTextDisabled]}>
              {isFull ? "Full" : "Register"}
            </Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function LadderCard({ ladder, onPress }: { ladder: Ladder; onPress: () => void }) {
  const typeColor = getTypeColor(ladder.type);

  return (
    <Pressable style={({ pressed }) => [styles.ladderCard, pressed && styles.cardPressed]} onPress={onPress}>
      <LinearGradient
        colors={[Backgrounds.card, Backgrounds.elevated]}
        style={styles.ladderGradient}
      >
        <View style={styles.ladderTop}>
          <View style={styles.ladderIcon}>
            <Ionicons name="podium" size={20} color={GlowColors.primary} />
          </View>
          <View style={styles.ladderInfo}>
            <Text style={styles.ladderName} numberOfLines={1}>{ladder.name}</Text>
            <View style={[styles.typeBadgeMini, { backgroundColor: typeColor + "25" }]}>
              <Text style={[styles.typeBadgeMiniText, { color: typeColor }]}>{getTypeBadge(ladder.type)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.ladderStats}>
          <View style={styles.ladderStat}>
            <Text style={styles.ladderStatValue}>{ladder.playerCount}</Text>
            <Text style={styles.ladderStatLabel}>Players</Text>
          </View>
          {ladder.myPosition && (
            <View style={styles.ladderStat}>
              <Text style={[styles.ladderStatValue, { color: GlowColors.primary }]}>#{ladder.myPosition}</Text>
              <Text style={styles.ladderStatLabel}>Rank</Text>
            </View>
          )}
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
              <Ionicons name="checkmark-circle" size={14} color={GlowColors.primary} />
              <Text style={styles.joinedText}>Joined</Text>
            </View>
          ) : (
            <Pressable style={styles.joinBtn} onPress={(e) => { e.stopPropagation(); }}>
              <Text style={styles.joinBtnText}>Join</Text>
            </Pressable>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

export default function TournamentsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>("upcoming");
  const { startTour, isActive } = useCoachMarks();

  const tournamentsTourSteps = useMemo(() => [
    { id: "tournaments_tabs", title: "Browse Events", description: "Switch between upcoming tournaments, your registered events, and challenge ladders.", position: "bottom" as const },
    { id: "tournaments_list", title: "Tournament Cards", description: "See event details, spots remaining, and entry fees at a glance.", position: "top" as const },
    { id: "tournaments_register", title: "Register & Join", description: "Tap Register to sign up for tournaments or Join to enter a ladder.", position: "top" as const },
  ], []);

  useEffect(() => {
    if (!isActive) {
      const timer = setTimeout(() => {
        startTour("player_tournaments_tour", tournamentsTourSteps);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleTabPress = (tab: TabType) => {
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

  const tabs = [
    { key: "upcoming" as TabType, label: "Upcoming", count: MOCK_TOURNAMENTS.length },
    { key: "my_tournaments" as TabType, label: "My Events", count: MOCK_MY_TOURNAMENTS.length },
    { key: "ladders" as TabType, label: "Ladders", count: MOCK_LADDERS.filter(l => l.isJoined).length },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "upcoming":
        return (
          <FlatList
            data={MOCK_TOURNAMENTS}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TournamentCard tournament={item} onPress={() => handleTournamentPress(item.id)} />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<EmptyState icon="trophy-outline" title="No Upcoming Tournaments" />}
          />
        );
      case "my_tournaments":
        return (
          <FlatList
            data={MOCK_MY_TOURNAMENTS}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TournamentCard tournament={item} onPress={() => handleTournamentPress(item.id)} />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<EmptyState icon="calendar-outline" title="No Registered Events" />}
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
            ListEmptyComponent={<EmptyState icon="podium-outline" title="No Ladders Available" />}
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
        <Text style={styles.headerTitle}>Tournaments</Text>
        <View style={styles.headerRight} />
      </View>

      <CoachMarkTarget id="tournaments_tabs">
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => handleTabPress(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[styles.tabCount, activeTab === tab.key && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, activeTab === tab.key && styles.tabCountTextActive]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
      </CoachMarkTarget>

      <CoachMarkTarget id="tournaments_list">
      <View style={styles.content}>{renderContent()}</View>
      </CoachMarkTarget>
    </View>
  );
}

function EmptyState({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon as any} size={48} color={TextColors.muted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>Check back later for new events</Text>
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Backgrounds.card,
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
    backgroundColor: Backgrounds.card,
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
  },
  card: {
    backgroundColor: Backgrounds.card,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  liveBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 77, 77, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF4D4D",
  },
  liveText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FF4D4D",
  },
  cardTop: {
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TextColors.primary,
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Backgrounds.root,
  },
  formatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  formatText: {
    fontSize: 11,
    color: TextColors.muted,
  },
  cardMeta: {
    gap: 6,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: TextColors.secondary,
    flex: 1,
  },
  progressBar: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    marginBottom: 10,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerLeft: {
    flexDirection: "row",
    gap: 12,
  },
  priceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  priceText: {
    fontSize: 12,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  spotsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  spotsText: {
    fontSize: 11,
    color: TextColors.secondary,
  },
  registeredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  registeredText: {
    fontSize: 11,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  registerBtn: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  registerBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  registerBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Backgrounds.root,
  },
  registerBtnTextDisabled: {
    color: TextColors.muted,
  },
  ladderCard: {
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
  typeBadgeMini: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeMiniText: {
    fontSize: 8,
    fontWeight: "800",
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
  },
  joinedText: {
    fontSize: 11,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  joinBtn: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  joinBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Backgrounds.root,
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
  emptyText: {
    fontSize: 13,
    color: TextColors.muted,
    marginTop: 4,
  },
});
