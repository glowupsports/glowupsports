import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing } from "@/constants/theme";
import { getApiUrl, apiRequest } from "@/lib/query-client";

interface BountyEntry {
  id: string;
  targetPlayerId: string;
  targetPlayerName: string;
  placedByPlayerName: string;
  bountyCoins: number;
  desiredCardPlayerId: string | null;
  expiresAt: string | null;
  isOnMe: boolean;
}

export default function ArenaBountyScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const [targetInput, setTargetInput] = useState("");
  const [coinsInput, setCoinsInput] = useState("100");
  const [showPlaceForm, setShowPlaceForm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ bounties: BountyEntry[] }>({
    queryKey: ["/api/arena/bounties/active"],
  });

  const bounties = data?.bounties ?? [];
  const bountiesOnMe = bounties.filter((b) => b.isOnMe);
  const othersWithBounties = bounties.filter((b) => !b.isOnMe);

  const placeMutation = useMutation({
    mutationFn: (body: { targetPlayerId: string; bountyCoins: number }) =>
      apiRequest("POST", new URL("/api/arena/bounties", getApiUrl()).href, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/arena/bounties/active"] });
      setShowPlaceForm(false);
      setTargetInput("");
      setCoinsInput("100");
      Alert.alert("Bounty Placed", "Your bounty has been placed on the target player.");
    },
    onError: (err: Error) => {
      Alert.alert("Failed", err.message || "Could not place bounty");
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handlePlaceBounty = () => {
    const coins = parseInt(coinsInput, 10);
    if (!targetInput.trim()) {
      Alert.alert("Missing Info", "Enter the target player's ID");
      return;
    }
    if (isNaN(coins) || coins < 50) {
      Alert.alert("Invalid Amount", "Minimum bounty is 50 coins");
      return;
    }
    Alert.alert(
      "Place Bounty",
      `Place a ${coins}-coin bounty on player "${targetInput.trim()}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => placeMutation.mutate({ targetPlayerId: targetInput.trim(), bountyCoins: coins }) },
      ],
    );
  };

  const timeUntil = (dateStr: string | null): string => {
    if (!dateStr) return "";
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: headerHeight + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.dark.primary} />}
    >
      {/* Header banner */}
      <View style={styles.heroBanner}>
        <Feather name="alert-octagon" size={32} color="#C040FB" />
        <Text style={styles.heroTitle}>Bounty Board</Text>
        <Text style={styles.heroSub}>Beat a target in a real match to claim their bounty</Text>
      </View>

      {/* Bounties on me */}
      {bountiesOnMe.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bounties on You</Text>
          <Text style={styles.sectionHint}>Win your next match to avoid elimination</Text>
          {bountiesOnMe.map((b) => (
            <View key={b.id} style={[styles.bountyCard, styles.bountyOnMe]}>
              <View style={styles.bountyLeft}>
                <Feather name="crosshair" size={18} color="#FF4D4D" />
                <View style={styles.bountyInfo}>
                  <Text style={styles.bountyByLabel}>Placed by {b.placedByPlayerName}</Text>
                  {b.expiresAt ? <Text style={styles.bountyExpiry}>{timeUntil(b.expiresAt)}</Text> : null}
                </View>
              </View>
              <View style={styles.bountyCoins}>
                <Feather name="zap" size={14} color="#FFD700" />
                <Text style={styles.bountyCoinsText}>{b.bountyCoins}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Active bounty targets */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Active Bounties</Text>
          <Pressable style={styles.placeBtn} onPress={() => setShowPlaceForm((v) => !v)}>
            <Feather name="plus" size={14} color={Colors.dark.primary} />
            <Text style={styles.placeBtnText}>Place Bounty</Text>
          </Pressable>
        </View>

        {showPlaceForm && (
          <View style={styles.placeForm}>
            <Text style={styles.formLabel}>Target Player ID</Text>
            <TextInput
              style={styles.input}
              value={targetInput}
              onChangeText={setTargetInput}
              placeholder="Player ID..."
              placeholderTextColor={Colors.dark.textSecondary}
              autoCapitalize="none"
            />
            <Text style={styles.formLabel}>Bounty Coins (min 50)</Text>
            <TextInput
              style={styles.input}
              value={coinsInput}
              onChangeText={setCoinsInput}
              keyboardType="numeric"
              placeholderTextColor={Colors.dark.textSecondary}
            />
            <Pressable
              style={[styles.confirmBtn, placeMutation.isPending && styles.confirmBtnDisabled]}
              onPress={handlePlaceBounty}
              disabled={placeMutation.isPending}
            >
              {placeMutation.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.confirmBtnText}>Confirm Bounty</Text>
              }
            </Pressable>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: Spacing.xl }} />
        ) : othersWithBounties.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="alert-octagon" size={40} color={Colors.dark.textSecondary} />
            <Text style={styles.emptyText}>No active bounties yet</Text>
            <Text style={styles.emptyHint}>Be the first to place one</Text>
          </View>
        ) : (
          othersWithBounties.map((b) => (
            <View key={b.id} style={styles.bountyCard}>
              <View style={styles.bountyLeft}>
                <View style={styles.targetBadge}>
                  <Feather name="user" size={14} color="#C040FB" />
                </View>
                <View style={styles.bountyInfo}>
                  <Text style={styles.targetName}>{b.targetPlayerName}</Text>
                  <Text style={styles.bountyByLabel}>Wanted by {b.placedByPlayerName}</Text>
                  {b.expiresAt ? <Text style={styles.bountyExpiry}>{timeUntil(b.expiresAt)}</Text> : null}
                </View>
              </View>
              <View style={styles.bountyCoins}>
                <Feather name="zap" size={14} color="#FFD700" />
                <Text style={styles.bountyCoinsText}>{b.bountyCoins}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.infoBox}>
        <Feather name="info" size={14} color={Colors.dark.textSecondary} />
        <Text style={styles.infoText}>
          Beat the target player in a real match to automatically claim the bounty coins.
          Bounties expire in 7 days if unclaimed.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  content: { paddingHorizontal: Spacing.lg },
  heroBanner: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.lg,
    backgroundColor: "rgba(192,64,251,0.08)",
    borderRadius: 16,
    gap: Spacing.sm,
  },
  heroTitle: { fontSize: 24, fontWeight: "800", color: "#C040FB" },
  heroSub: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },
  section: { marginBottom: Spacing.xl },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.xs },
  sectionHint: { fontSize: 12, color: Colors.dark.textSecondary, marginBottom: Spacing.sm },
  placeBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  placeBtnText: { fontSize: 13, color: Colors.dark.primary, fontWeight: "600" },
  placeForm: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: Spacing.md, marginBottom: Spacing.md, gap: Spacing.sm },
  formLabel: { fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "600" },
  input: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: Colors.dark.text, fontSize: 15 },
  confirmBtn: { backgroundColor: Colors.dark.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: Spacing.sm },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  bountyCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, padding: Spacing.md, marginBottom: Spacing.sm },
  bountyOnMe: { borderWidth: 1, borderColor: "rgba(255,77,77,0.3)", backgroundColor: "rgba(255,77,77,0.06)" },
  bountyLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, flex: 1 },
  targetBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(192,64,251,0.15)", alignItems: "center", justifyContent: "center" },
  bountyInfo: { flex: 1 },
  targetName: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
  bountyByLabel: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 2 },
  bountyExpiry: { fontSize: 11, color: "#FF9500", marginTop: 2 },
  bountyCoins: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,215,0,0.1)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  bountyCoinsText: { fontSize: 15, fontWeight: "800", color: "#FFD700" },
  emptyState: { alignItems: "center", paddingVertical: Spacing.xl * 2, gap: Spacing.sm },
  emptyText: { fontSize: 16, fontWeight: "600", color: Colors.dark.textSecondary },
  emptyHint: { fontSize: 13, color: Colors.dark.textSecondary },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, padding: Spacing.md },
  infoText: { fontSize: 12, color: Colors.dark.textSecondary, flex: 1, lineHeight: 18 },
});
