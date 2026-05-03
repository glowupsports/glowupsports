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

interface AcademyClash {
  id: string;
  challengerAcademyId: string;
  challengerAcademyName: string;
  defenderAcademyId: string;
  defenderAcademyName: string;
  status: "pending" | "active" | "completed";
  challengerWins: number;
  defenderWins: number;
  totalBattles: number;
  winnerId: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

interface AcademyClashData {
  myAcademyId: string | null;
  active: AcademyClash[];
  history: AcademyClash[];
  myRecord: { wins: number; losses: number; battlesContributed: number } | null;
}

function statusColor(status: AcademyClash["status"]): string {
  switch (status) {
    case "pending":   return "#FFB300";
    case "active":    return GlowColors.primary;
    case "completed": return Colors.dark.textSecondary;
  }
}

function statusLabel(status: AcademyClash["status"]): string {
  switch (status) {
    case "pending":   return "Pending";
    case "active":    return "Live";
    case "completed": return "Ended";
  }
}

export default function AcademyClashScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"Active" | "History">("Active");

  const { data, isLoading, refetch } = useQuery<AcademyClashData>({
    queryKey: ["/api/arena/academy-clash"],
  });

  const contributeMutation = useMutation({
    mutationFn: (clashId: string) =>
      apiRequest("POST", `/api/arena/academy-clash/${clashId}/contribute`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/arena/academy-clash"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Contributed!", "Your battle has been counted towards the Academy Clash.");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to contribute to clash";
      Alert.alert("Error", message);
    },
  });

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: headerHeight }]}>
        <ActivityIndicator size="large" color={GlowColors.primary} />
      </View>
    );
  }

  const active = data?.active ?? [];
  const history = data?.history ?? [];
  const record = data?.myRecord;
  const myAcademyId = data?.myAcademyId;

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      {/* My contribution record */}
      {record && (
        <View style={styles.recordBar}>
          <View style={styles.recordItem}>
            <Text style={[styles.recordVal, { color: GlowColors.primary }]}>{record.wins}</Text>
            <Text style={styles.recordLbl}>Wins</Text>
          </View>
          <View style={styles.recordDivider} />
          <View style={styles.recordItem}>
            <Text style={[styles.recordVal, { color: "#F44336" }]}>{record.losses}</Text>
            <Text style={styles.recordLbl}>Losses</Text>
          </View>
          <View style={styles.recordDivider} />
          <View style={styles.recordItem}>
            <Text style={[styles.recordVal, { color: "#FFB300" }]}>{record.battlesContributed}</Text>
            <Text style={styles.recordLbl}>Contributed</Text>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(["Active", "History"] as const).map((t) => (
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
        {tab === "Active" && (
          <>
            {active.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="users" size={40} color={Colors.dark.textSecondary} />
                <Text style={styles.emptyText}>No active clashes</Text>
                <Text style={styles.emptySub}>Academy clashes are initiated by academy administrators</Text>
              </View>
            ) : (
              active.map((clash) => (
                <ClashCard
                  key={clash.id}
                  clash={clash}
                  myAcademyId={myAcademyId ?? null}
                  onContribute={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    contributeMutation.mutate(clash.id);
                  }}
                  isContributing={contributeMutation.isPending && contributeMutation.variables === clash.id}
                />
              ))
            )}
          </>
        )}

        {tab === "History" && (
          <>
            {history.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="clock" size={40} color={Colors.dark.textSecondary} />
                <Text style={styles.emptyText}>No clash history yet</Text>
              </View>
            ) : (
              history.map((clash) => (
                <ClashCard
                  key={clash.id}
                  clash={clash}
                  myAcademyId={myAcademyId ?? null}
                  onContribute={null}
                  isContributing={false}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ClashCard({ clash, myAcademyId, onContribute, isContributing }: {
  clash: AcademyClash;
  myAcademyId: string | null;
  onContribute: (() => void) | null;
  isContributing: boolean;
}) {
  const color = statusColor(clash.status);
  const total = clash.challengerWins + clash.defenderWins;
  const challengerPct = total > 0 ? clash.challengerWins / total : 0.5;

  const myAcademyIsChallenger = myAcademyId === clash.challengerAcademyId;
  const myAcademyIsDefender   = myAcademyId === clash.defenderAcademyId;

  return (
    <View style={[styles.clashCard, { borderTopColor: color, borderTopWidth: 2 }]}>
      <View style={styles.clashHeader}>
        <Text style={[styles.statusPill, { color }]}>{statusLabel(clash.status)}</Text>
        <Text style={styles.clashDate}>
          {new Date(clash.startsAt).toLocaleDateString()} — {new Date(clash.endsAt).toLocaleDateString()}
        </Text>
      </View>

      <View style={styles.clashVs}>
        <View style={[styles.academyBlock, myAcademyIsChallenger && styles.myAcademy]}>
          <Text style={styles.academyName} numberOfLines={1}>{clash.challengerAcademyName}</Text>
          <Text style={[styles.academyScore, { color: GlowColors.primary }]}>{clash.challengerWins}</Text>
        </View>
        <Text style={styles.vsText}>VS</Text>
        <View style={[styles.academyBlock, myAcademyIsDefender && styles.myAcademy, { alignItems: "flex-end" }]}>
          <Text style={styles.academyName} numberOfLines={1}>{clash.defenderAcademyName}</Text>
          <Text style={[styles.academyScore, { color: "#F44336" }]}>{clash.defenderWins}</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { flex: challengerPct, backgroundColor: GlowColors.primary }]} />
        <View style={[styles.progressFill, { flex: 1 - challengerPct, backgroundColor: "#F44336" }]} />
      </View>

      <Text style={styles.battleCount}>{clash.totalBattles} battles fought</Text>

      {clash.status === "active" && onContribute && (
        <Pressable onPress={onContribute} disabled={isContributing} style={styles.contributeBtn}>
          {isContributing ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.contributeBtnText}>Contribute a Battle</Text>
          )}
        </Pressable>
      )}

      {clash.status === "completed" && clash.winnerId && (
        <View style={styles.winnerBadge}>
          <Feather name="award" size={14} color="#FFB300" />
          <Text style={styles.winnerText}>
            {clash.winnerId === clash.challengerAcademyId ? clash.challengerAcademyName : clash.defenderAcademyName} won
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  centered:         { justifyContent: "center", alignItems: "center" },
  recordBar: {
    flexDirection: "row", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  recordItem:       { flex: 1, alignItems: "center" },
  recordVal:        { fontSize: 20, fontWeight: "800" },
  recordLbl:        { color: Colors.dark.textSecondary, fontSize: 11 },
  recordDivider:    { width: 1, backgroundColor: Colors.dark.border },
  tabRow:           { flexDirection: "row", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  tab:              { flex: 1, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.dark.chipBackground, alignItems: "center" },
  tabActive:        { backgroundColor: GlowColors.primary },
  tabText:          { color: Colors.dark.textSecondary, fontWeight: "600", fontSize: 13 },
  tabTextActive:    { color: "#000" },
  content:          { padding: Spacing.md, gap: Spacing.sm },
  emptyState:       { alignItems: "center", paddingVertical: 48, gap: Spacing.sm },
  emptyText:        { color: Colors.dark.text, fontSize: 16, fontWeight: "600" },
  emptySub:         { color: Colors.dark.textSecondary, fontSize: 13, textAlign: "center" },
  clashCard: {
    backgroundColor: Colors.dark.backgroundCard, borderRadius: 14, padding: Spacing.md,
    marginBottom: 10, gap: Spacing.sm,
  },
  clashHeader:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusPill:       { fontWeight: "700", fontSize: 12 },
  clashDate:        { color: Colors.dark.textSecondary, fontSize: 11 },
  clashVs:          { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  academyBlock:     { flex: 1, gap: 2 },
  myAcademy:        {},
  academyName:      { color: Colors.dark.text, fontWeight: "700", fontSize: 13 },
  academyScore:     { fontSize: 24, fontWeight: "900" },
  vsText:           { color: Colors.dark.textSecondary, fontWeight: "800", fontSize: 13 },
  progressBar:      { flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: Colors.dark.chipBackground },
  progressFill:     { height: 6 },
  battleCount:      { color: Colors.dark.textSecondary, fontSize: 12, textAlign: "center" },
  contributeBtn: {
    backgroundColor: GlowColors.primary, borderRadius: 10, paddingVertical: 10,
    alignItems: "center", marginTop: 4,
  },
  contributeBtnText: { color: "#000", fontWeight: "700", fontSize: 14 },
  winnerBadge:      { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" },
  winnerText:       { color: "#FFB300", fontWeight: "700", fontSize: 13 },
});
