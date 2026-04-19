import logger from "@/lib/logger";
import React, { useState, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Share } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "@/coach/context/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Spacing, Backgrounds, GlowColors, Colors, BorderRadius, TextColors, FunctionColors } from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { getStaticAssetsUrl } from "@/lib/query-client";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
function PlayerAvatar({ photoUrl, size = 48, borderColor = "#FFD700" }: { photoUrl?: string | null; size?: number; borderColor?: string }) {
  const baseUrl = getStaticAssetsUrl();
  const fullUrl = photoUrl ? (photoUrl.startsWith("http") ? photoUrl : `${baseUrl}${photoUrl}`) : null;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2.5, borderColor, overflow: "hidden", backgroundColor: Backgrounds.surface }}>
      {fullUrl ? (
        <Image source={{ uri: fullUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      ) : (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="person" size={size * 0.45} color={TextColors.muted} />
        </View>
      )}
    </View>
  );
}

function PodiumSection({ nominees }: { nominees: any[] }) {
  if (!nominees || nominees.length === 0) return null;

  const top3 = nominees.slice(0, 3);
  const first = top3[0];
  const second = top3[1];
  const third = top3[2];

  const podiumOrder = [second, first, third].filter(Boolean);

  return (
    <Animated.View entering={FadeInUp.delay(200).duration(600)} style={podiumStyles.container}>
      <Text style={podiumStyles.title}>THIS WEEK'S TOP NOMINEES</Text>
      <View style={podiumStyles.podium}>
        {second ? (
          <View style={podiumStyles.podiumSlot}>
            <PlayerAvatar photoUrl={second.profilePhotoUrl} size={48} borderColor="#C0C0C0" />
            <Text style={podiumStyles.podiumName} numberOfLines={1}>{second.playerName?.split(" ")[0]}</Text>
            <View style={[podiumStyles.podiumBar, podiumStyles.podiumSecond]}>
              <Text style={podiumStyles.podiumRank}>2</Text>
            </View>
            <View style={podiumStyles.voteBadge}>
              <Ionicons name="star" size={10} color="#C0C0C0" />
              <Text style={[podiumStyles.voteText, { color: "#C0C0C0" }]}>{second.totalVotes}</Text>
            </View>
          </View>
        ) : <View style={podiumStyles.podiumSlot} />}

        {first ? (
          <View style={podiumStyles.podiumSlot}>
            <View style={podiumStyles.crownWrap}>
              <Ionicons name="ribbon" size={22} color="#FFD700" />
            </View>
            <PlayerAvatar photoUrl={first.profilePhotoUrl} size={64} borderColor="#FFD700" />
            <Text style={[podiumStyles.podiumName, { color: "#FFD700", fontWeight: "800" }]} numberOfLines={1}>{first.playerName?.split(" ")[0]}</Text>
            <View style={[podiumStyles.podiumBar, podiumStyles.podiumFirst]}>
              <Text style={[podiumStyles.podiumRank, { fontSize: 22 }]}>1</Text>
            </View>
            <View style={[podiumStyles.voteBadge, { backgroundColor: "rgba(255,215,0,0.15)" }]}>
              <Ionicons name="star" size={10} color="#FFD700" />
              <Text style={[podiumStyles.voteText, { color: "#FFD700" }]}>{first.totalVotes}</Text>
            </View>
          </View>
        ) : <View style={podiumStyles.podiumSlot} />}

        {third ? (
          <View style={podiumStyles.podiumSlot}>
            <PlayerAvatar photoUrl={third.profilePhotoUrl} size={44} borderColor="#CD7F32" />
            <Text style={podiumStyles.podiumName} numberOfLines={1}>{third.playerName?.split(" ")[0]}</Text>
            <View style={[podiumStyles.podiumBar, podiumStyles.podiumThird]}>
              <Text style={podiumStyles.podiumRank}>3</Text>
            </View>
            <View style={podiumStyles.voteBadge}>
              <Ionicons name="star" size={10} color="#CD7F32" />
              <Text style={[podiumStyles.voteText, { color: "#CD7F32" }]}>{third.totalVotes}</Text>
            </View>
          </View>
        ) : <View style={podiumStyles.podiumSlot} />}
      </View>
    </Animated.View>
  );
}

const podiumStyles = makeReactiveStyles(() => StyleSheet.create({
  container: { gap: Spacing.lg, paddingHorizontal: Spacing.lg },
  title: { fontSize: 11, fontWeight: "800", color: "#FFD700", letterSpacing: 2, textAlign: "center" },
  podium: { flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: Spacing.sm },
  podiumSlot: { alignItems: "center", flex: 1, gap: 6 },
  crownWrap: { marginBottom: -4 },
  podiumName: { fontSize: 12, fontWeight: "700", color: TextColors.primary, textAlign: "center" },
  podiumBar: { width: "100%", justifyContent: "center", alignItems: "center", borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  podiumFirst: { height: 80, backgroundColor: "rgba(255, 215, 0, 0.15)", borderWidth: 1, borderColor: "rgba(255, 215, 0, 0.3)" },
  podiumSecond: { height: 60, backgroundColor: "rgba(192, 192, 192, 0.1)", borderWidth: 1, borderColor: "rgba(192, 192, 192, 0.2)" },
  podiumThird: { height: 45, backgroundColor: "rgba(205, 127, 50, 0.1)", borderWidth: 1, borderColor: "rgba(205, 127, 50, 0.2)" },
  podiumRank: { fontSize: 18, fontWeight: "800", color: TextColors.primary },
  voteBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" },
  voteText: { fontSize: 11, fontWeight: "700" },
}));

function NomineeList({ nominees }: { nominees: any[] }) {
  if (!nominees || nominees.length <= 3) return null;

  return (
    <View style={listStyles.container}>
      <Text style={listStyles.title}>ALL NOMINEES</Text>
      {nominees.slice(3).map((n: any, i: number) => (
        <Animated.View key={n.playerId} entering={FadeInDown.delay(i * 60).duration(300)}>
          <View style={listStyles.row}>
            <Text style={listStyles.rank}>{i + 4}</Text>
            <PlayerAvatar photoUrl={n.profilePhotoUrl} size={40} borderColor="rgba(255,255,255,0.15)" />
            <View style={listStyles.info}>
              <Text style={listStyles.name} numberOfLines={1}>{n.playerName}</Text>
              {n.reasons?.[0] ? <Text style={listStyles.reason} numberOfLines={1}>"{n.reasons[0]}"</Text> : null}
            </View>
            <View style={listStyles.voteBadge}>
              <Ionicons name="star" size={12} color="#FFD700" />
              <Text style={listStyles.voteText}>{n.totalVotes}</Text>
            </View>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const listStyles = makeReactiveStyles(() => StyleSheet.create({
  container: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  title: { fontSize: 11, fontWeight: "800", color: TextColors.muted, letterSpacing: 2, marginBottom: Spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, backgroundColor: Backgrounds.card, borderRadius: BorderRadius.lg },
  rank: { fontSize: 14, fontWeight: "800", color: TextColors.muted, width: 24, textAlign: "center" },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: "700", color: TextColors.primary },
  reason: { fontSize: 11, fontStyle: "italic", color: TextColors.muted },
  voteBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  voteText: { fontSize: 13, fontWeight: "700", color: "#FFD700" },
}));

function HistorySection({ weeklyWinners, monthlyWinners }: { weeklyWinners: any[]; monthlyWinners: any[] }) {
  if ((!weeklyWinners || weeklyWinners.length === 0) && (!monthlyWinners || monthlyWinners.length === 0)) return null;

  const formatWeek = (weekStart: string) => {
    const d = new Date(weekStart);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  const getMonthName = (month: number, year: number) => {
    const d = new Date(year, month - 1, 1);
    return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  };

  return (
    <View style={histStyles.container}>
      {monthlyWinners && monthlyWinners.length > 0 ? (
        <>
          <Text style={histStyles.sectionTitle}>MONTHLY CHAMPIONS</Text>
          {monthlyWinners.map((w: any, i: number) => (
            <Animated.View key={w.id || i} entering={FadeInDown.delay(i * 80).duration(300)}>
              <LinearGradient
                colors={["rgba(200, 255, 61, 0.08)", "rgba(200, 255, 61, 0.02)"]}
                style={histStyles.monthRow}
              >
                <Ionicons name="medal" size={22} color={GlowColors.primary} />
                <PlayerAvatar photoUrl={w.profilePhotoUrl} size={42} borderColor={GlowColors.primary} />
                <View style={histStyles.info}>
                  <Text style={histStyles.winnerName} numberOfLines={1}>{w.playerName}</Text>
                  <Text style={histStyles.winnerMeta}>{getMonthName(w.month, w.year)}</Text>
                </View>
                <View style={histStyles.monthStats}>
                  <Text style={histStyles.monthStatValue}>{w.totalWeeklyWins}x</Text>
                  <Text style={histStyles.monthStatLabel}>won</Text>
                </View>
              </LinearGradient>
            </Animated.View>
          ))}
        </>
      ) : null}

      {weeklyWinners && weeklyWinners.length > 0 ? (
        <>
          <Text style={[histStyles.sectionTitle, { marginTop: Spacing.lg }]}>PAST WEEKLY WINNERS</Text>
          {weeklyWinners.map((w: any, i: number) => (
            <Animated.View key={w.id || i} entering={FadeInDown.delay(i * 60).duration(300)}>
              <View style={histStyles.weekRow}>
                <PlayerAvatar photoUrl={w.profilePhotoUrl} size={38} borderColor="rgba(255, 215, 0, 0.4)" />
                <View style={histStyles.info}>
                  <Text style={histStyles.weekName} numberOfLines={1}>{w.playerName}</Text>
                  <Text style={histStyles.weekDate}>Week of {formatWeek(w.weekStart)}</Text>
                </View>
                <View style={histStyles.weekVotes}>
                  <Ionicons name="star" size={12} color="#FFD700" />
                  <Text style={histStyles.weekVoteText}>{w.totalVotes}</Text>
                </View>
              </View>
            </Animated.View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const histStyles = makeReactiveStyles(() => StyleSheet.create({
  container: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  sectionTitle: { fontSize: 11, fontWeight: "800", color: TextColors.muted, letterSpacing: 2, marginBottom: Spacing.xs },
  monthRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: "rgba(200, 255, 61, 0.1)" },
  info: { flex: 1, gap: 2 },
  winnerName: { fontSize: 15, fontWeight: "700", color: TextColors.primary },
  winnerMeta: { fontSize: 12, color: TextColors.muted },
  monthStats: { alignItems: "center" },
  monthStatValue: { fontSize: 18, fontWeight: "800", color: GlowColors.primary },
  monthStatLabel: { fontSize: 9, fontWeight: "600", color: TextColors.muted },
  weekRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, backgroundColor: Backgrounds.card, borderRadius: BorderRadius.lg },
  weekName: { fontSize: 14, fontWeight: "700", color: TextColors.primary },
  weekDate: { fontSize: 11, color: TextColors.muted },
  weekVotes: { flexDirection: "row", alignItems: "center", gap: 4 },
  weekVoteText: { fontSize: 13, fontWeight: "700", color: "#FFD700" },
}));

export default function SpotlightDetailScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const shareRef = useRef<any>(null);
  const [activeTab, setActiveTab] = useState<"leaderboard" | "history">("leaderboard");

  const { data: leaderboard } = useQuery<any[]>({
    queryKey: ["/api/player/spotlight/leaderboard"],
    enabled: !!user?.playerId,
  });

  const { data: weeklyWinner } = useQuery<{ winner: any }>({
    queryKey: ["/api/player/spotlight/weekly-winner"],
    enabled: !!user?.playerId,
  });

  const { data: history } = useQuery<{ weeklyWinners: any[]; monthlyWinners: any[] }>({
    queryKey: ["/api/player/spotlight/history"],
    enabled: !!user?.playerId,
  });

  const { data: currentWeek } = useQuery<any>({
    queryKey: ["/api/player/spotlight/current-week"],
    enabled: !!user?.playerId,
  });

  const handleShare = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (shareRef.current) {
        const uri = await captureRef(shareRef, { format: "png", quality: 1 });
        const available = await Sharing.isAvailableAsync();
        if (available) {
          await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share Player of the Week" });
        } else {
          await Share.share({ message: `Check out the Player of the Week on Glow Up Sports!` });
        }
      } else {
        await Share.share({ message: `Check out the Player of the Week on Glow Up Sports!` });
      }
    } catch (e) {
      logger.log("Share error:", e);
    }
  };

  const winner = weeklyWinner?.winner;
  const nominees = currentWeek?.nominations || leaderboard || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={TextColors.primary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Ionicons name="trophy" size={22} color="#FFD700" />
          <Text style={styles.headerTitle}>Spotlight</Text>
        </View>
        <Pressable onPress={handleShare} style={styles.shareBtn}>
          <Ionicons name="share-social-outline" size={22} color="#FFD700" />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {winner ? (
          <ViewShot ref={shareRef} options={{ format: "png", quality: 1 }} style={styles.shareableCard}>
            <LinearGradient
              colors={["rgba(255, 215, 0, 0.12)", Backgrounds.elevated, Backgrounds.card]}
              style={styles.winnerCard}
            >
              <Text style={styles.winnerBadgeText}>PLAYER OF THE WEEK</Text>
              <PlayerAvatar photoUrl={winner.profilePhotoUrl} size={80} borderColor="#FFD700" />
              <Text style={styles.winnerName}>{winner.playerName}</Text>
              {winner.topReason ? (
                <View style={styles.winnerReasonBox}>
                  <Ionicons name="chatbubble" size={14} color="#FFD700" />
                  <Text style={styles.winnerReason}>"{winner.topReason}"</Text>
                </View>
              ) : null}
              <View style={styles.winnerStatsRow}>
                <View style={styles.winnerStat}>
                  <Text style={styles.winnerStatValue}>{winner.totalVotes}</Text>
                  <Text style={styles.winnerStatLabel}>Votes</Text>
                </View>
                <View style={styles.winnerStatDivider} />
                <View style={styles.winnerStat}>
                  <Text style={styles.winnerStatValue}>Lvl {winner.level || 1}</Text>
                  <Text style={styles.winnerStatLabel}>Level</Text>
                </View>
              </View>
              <Text style={styles.brandText}>GLOW UP SPORTS</Text>
            </LinearGradient>
          </ViewShot>
        ) : null}

        <View style={styles.tabs}>
          <Pressable
            onPress={() => setActiveTab("leaderboard")}
            style={[styles.tab, activeTab === "leaderboard" && styles.tabActive]}
          >
            <Ionicons name="podium-outline" size={16} color={activeTab === "leaderboard" ? "#FFD700" : TextColors.muted} />
            <Text style={[styles.tabText, activeTab === "leaderboard" && styles.tabTextActive]}>This Week</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("history")}
            style={[styles.tab, activeTab === "history" && styles.tabActive]}
          >
            <Ionicons name="time-outline" size={16} color={activeTab === "history" ? "#FFD700" : TextColors.muted} />
            <Text style={[styles.tabText, activeTab === "history" && styles.tabTextActive]}>History</Text>
          </Pressable>
        </View>

        {activeTab === "leaderboard" ? (
          <>
            <PodiumSection nominees={nominees} />
            <NomineeList nominees={nominees} />
            {nominees.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="star-outline" size={56} color={TextColors.disabled} />
                <Text style={styles.emptyTitle}>No nominations yet</Text>
                <Text style={styles.emptySubtitle}>Be the first to nominate a player this week!</Text>
              </View>
            ) : null}
          </>
        ) : (
          <HistorySection
            weeklyWinners={history?.weeklyWinners || []}
            monthlyWinners={history?.monthlyWinners || []}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: TextColors.primary,
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: Spacing.xl,
    paddingBottom: 40,
  },
  shareableCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  winnerCard: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  winnerBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFD700",
    letterSpacing: 3,
  },
  winnerName: {
    fontSize: 22,
    fontWeight: "800",
    color: TextColors.primary,
  },
  winnerReasonBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  winnerReason: {
    fontSize: 14,
    fontStyle: "italic",
    color: "#FFD700",
  },
  winnerStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xl,
    marginTop: Spacing.sm,
  },
  winnerStat: {
    alignItems: "center",
    gap: 2,
  },
  winnerStatValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFD700",
  },
  winnerStatLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: TextColors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  winnerStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  brandText: {
    fontSize: 9,
    fontWeight: "800",
    color: TextColors.disabled,
    letterSpacing: 3,
    marginTop: Spacing.md,
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: 3,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  tabActive: {
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: TextColors.muted,
  },
  tabTextActive: {
    color: "#FFD700",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TextColors.primary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TextColors.muted,
    textAlign: "center",
  },
}));
