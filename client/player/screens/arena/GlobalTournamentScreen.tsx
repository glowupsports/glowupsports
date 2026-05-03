import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface ArenaTournament {
  id: string;
  name: string;
  tournamentType: "global" | "academy" | "invitational";
  status: "upcoming" | "registration" | "active" | "completed";
  maxParticipants: number;
  currentParticipants: number;
  entryFeeCoins: number;
  prizePoolCoins: number;
  startsAt: string;
  endsAt: string;
  registrationDeadline: string;
  winnerId: string | null;
  winnerName: string | null;
  isRegistered?: boolean;
  myRank?: number | null;
  myWins?: number;
  myLosses?: number;
}

interface TournamentData {
  active: ArenaTournament[];
  upcoming: ArenaTournament[];
  past: ArenaTournament[];
}

function statusColor(status: ArenaTournament["status"]): string {
  switch (status) {
    case "upcoming":     return "#B0BEC5";
    case "registration": return "#FFB300";
    case "active":       return GlowColors.primary;
    case "completed":    return Colors.dark.textSecondary;
  }
}

function statusLabel(status: ArenaTournament["status"]): string {
  switch (status) {
    case "upcoming":     return "Upcoming";
    case "registration": return "Registration Open";
    case "active":       return "Live";
    case "completed":    return "Completed";
  }
}

function typeLabel(type: ArenaTournament["tournamentType"]): string {
  switch (type) {
    case "global":       return "Global";
    case "academy":      return "Academy";
    case "invitational": return "Invitational";
  }
}

export default function GlobalTournamentScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"Active" | "Upcoming" | "Past">("Active");

  const { data, isLoading } = useQuery<TournamentData>({
    queryKey: ["/api/arena/tournaments"],
  });

  const registerMutation = useMutation({
    mutationFn: (tournamentId: string) =>
      apiRequest("POST", `/api/arena/tournaments/${tournamentId}/register`, {}),
    onSuccess: (_data, tournamentId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/arena/tournaments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Registered!", "You have successfully entered the tournament.");
    },
    onError: (err: any) => {
      Alert.alert("Registration Failed", err?.message ?? "Could not register for this tournament.");
    },
  });

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: headerHeight }]}>
        <ActivityIndicator size="large" color={GlowColors.primary} />
      </View>
    );
  }

  const lists: Record<"Active" | "Upcoming" | "Past", ArenaTournament[]> = {
    Active:   data?.active ?? [],
    Upcoming: data?.upcoming ?? [],
    Past:     data?.past ?? [],
  };

  const currentList = lists[tab];

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      {/* Tabs */}
      <View style={styles.tabRow}>
        {(["Active", "Upcoming", "Past"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => { setTab(t); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {currentList.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="target" size={40} color={Colors.dark.textSecondary} />
            <Text style={styles.emptyText}>No {tab.toLowerCase()} tournaments</Text>
            <Text style={styles.emptySub}>Check back soon for upcoming global events</Text>
          </View>
        ) : (
          currentList.map((t) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              onRegister={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                Alert.alert(
                  "Enter Tournament",
                  `Entry fee: ${t.entryFeeCoins > 0 ? `${t.entryFeeCoins} coins` : "Free"}\nPrize pool: ${t.prizePoolCoins} coins\n\nConfirm registration?`,
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Enter", onPress: () => registerMutation.mutate(t.id) },
                  ],
                );
              }}
              isRegistering={registerMutation.isPending && (registerMutation.variables as string) === t.id}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function TournamentCard({ tournament: t, onRegister, isRegistering }: {
  tournament: ArenaTournament;
  onRegister: () => void;
  isRegistering: boolean;
}) {
  const color = statusColor(t.status);
  const regDeadline = new Date(t.registrationDeadline);
  const regOpen = t.status === "registration";
  const fillPct = t.currentParticipants / Math.max(t.maxParticipants, 1);

  return (
    <View style={[styles.card, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{t.name}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: color + "22" }]}>
              <Text style={[styles.badgeText, { color }]}>{statusLabel(t.status)}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{typeLabel(t.tournamentType)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.prizeBox}>
          <Feather name="award" size={14} color="#FFB300" />
          <Text style={styles.prizeText}>{t.prizePoolCoins.toLocaleString()}</Text>
          <Text style={styles.prizeLbl}>Coins</Text>
        </View>
      </View>

      {/* Participants */}
      <View style={styles.participantsRow}>
        <Feather name="users" size={13} color={Colors.dark.textSecondary} />
        <Text style={styles.participantsText}>
          {t.currentParticipants} / {t.maxParticipants} players
        </Text>
        <View style={styles.fillBarBg}>
          <View style={[styles.fillBarFg, { flex: fillPct, backgroundColor: color }]} />
        </View>
      </View>

      {/* Dates */}
      <View style={styles.datesRow}>
        <Feather name="calendar" size={12} color={Colors.dark.textSecondary} />
        <Text style={styles.dateText}>
          {new Date(t.startsAt).toLocaleDateString()} — {new Date(t.endsAt).toLocaleDateString()}
        </Text>
        {regOpen && (
          <Text style={[styles.deadlineText, { color: "#FFB300" }]}>
            Deadline: {regDeadline.toLocaleDateString()}
          </Text>
        )}
      </View>

      {/* Entry fee */}
      {t.entryFeeCoins > 0 && (
        <View style={styles.feeRow}>
          <Feather name="circle" size={12} color={GlowColors.primary} />
          <Text style={styles.feeText}>Entry: {t.entryFeeCoins.toLocaleString()} coins</Text>
        </View>
      )}

      {/* My rank if active/participating */}
      {t.myRank != null && (
        <View style={styles.myRankRow}>
          <Feather name="trending-up" size={13} color={GlowColors.primary} />
          <Text style={styles.myRankText}>Rank #{t.myRank} · {t.myWins}W {t.myLosses}L</Text>
        </View>
      )}

      {/* Action */}
      {t.status === "completed" && t.winnerName ? (
        <View style={styles.winnerRow}>
          <Feather name="award" size={14} color="#FFB300" />
          <Text style={styles.winnerText}>Winner: {t.winnerName}</Text>
        </View>
      ) : regOpen && !t.isRegistered ? (
        <Pressable onPress={onRegister} disabled={isRegistering} style={styles.registerBtn}>
          {isRegistering ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.registerBtnText}>
              {t.entryFeeCoins > 0 ? `Enter for ${t.entryFeeCoins} coins` : "Enter Free"}
            </Text>
          )}
        </Pressable>
      ) : t.isRegistered ? (
        <View style={styles.registeredBadge}>
          <Feather name="check-circle" size={14} color={GlowColors.primary} />
          <Text style={[styles.registeredText, { color: GlowColors.primary }]}>Registered</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  centered:          { justifyContent: "center", alignItems: "center" },
  tabRow:            { flexDirection: "row", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  tab:               { flex: 1, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.dark.chipBackground, alignItems: "center" },
  tabActive:         { backgroundColor: GlowColors.primary },
  tabText:           { color: Colors.dark.textSecondary, fontWeight: "600", fontSize: 13 },
  tabTextActive:     { color: "#000" },
  content:           { padding: Spacing.md, gap: Spacing.sm },
  emptyState:        { alignItems: "center", paddingVertical: 48, gap: Spacing.sm },
  emptyText:         { color: Colors.dark.text, fontSize: 16, fontWeight: "600" },
  emptySub:          { color: Colors.dark.textSecondary, fontSize: 13, textAlign: "center" },
  card: {
    backgroundColor: Colors.dark.backgroundCard, borderRadius: 14, padding: Spacing.md,
    marginBottom: 10, gap: 8,
  },
  cardHeader:        { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
  cardTitle:         { color: Colors.dark.text, fontWeight: "700", fontSize: 15, marginBottom: 4 },
  badgeRow:          { flexDirection: "row", gap: 6 },
  badge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: Colors.dark.chipBackground,
  },
  badgeText:         { color: Colors.dark.textSecondary, fontSize: 11, fontWeight: "600" },
  prizeBox:          { alignItems: "center", minWidth: 60 },
  prizeText:         { color: "#FFB300", fontWeight: "800", fontSize: 16 },
  prizeLbl:          { color: Colors.dark.textSecondary, fontSize: 10 },
  participantsRow:   { flexDirection: "row", alignItems: "center", gap: 6 },
  participantsText:  { color: Colors.dark.textSecondary, fontSize: 12 },
  fillBarBg:         { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.dark.chipBackground, flexDirection: "row", overflow: "hidden" },
  fillBarFg:         { height: 4 },
  datesRow:          { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  dateText:          { color: Colors.dark.textSecondary, fontSize: 12 },
  deadlineText:      { fontSize: 12, fontWeight: "600" },
  feeRow:            { flexDirection: "row", alignItems: "center", gap: 5 },
  feeText:           { color: Colors.dark.textSecondary, fontSize: 12 },
  myRankRow:         { flexDirection: "row", alignItems: "center", gap: 6 },
  myRankText:        { color: GlowColors.primary, fontWeight: "600", fontSize: 13 },
  winnerRow:         { flexDirection: "row", alignItems: "center", gap: 6 },
  winnerText:        { color: "#FFB300", fontWeight: "700", fontSize: 13 },
  registerBtn: {
    backgroundColor: GlowColors.primary, borderRadius: 10, paddingVertical: 10,
    alignItems: "center", marginTop: 4,
  },
  registerBtnText:   { color: "#000", fontWeight: "700", fontSize: 14 },
  registeredBadge:   { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" },
  registeredText:    { fontWeight: "700", fontSize: 13 },
});
