import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing } from "@/constants/theme";
import ChampionCard from "@/player/components/arena/ChampionCard";
import { apiRequest } from "@/lib/query-client";

interface HubData {
  card: {
    rarityTier: string;
    rarityLabel: string;
    rarityMarker: string;
    statPower: number;
    statTechnique: number;
    statMental: number;
    statTactics: number;
    arenaMmr: number;
    arenaWins: number;
    arenaLosses: number;
    streakSnapshot: number;
  } | null;
  player: {
    name: string;
    profilePhotoUrl?: string | null;
    level?: number;
    streak?: number;
  } | null;
  arenaRecord: { wins: number; losses: number; mmr: number };
  activeSeason: { name: string; endDate: string } | null;
  features: { battleUnlocked: boolean; collectionUnlocked: boolean; packShopUnlocked: boolean };
}

export default function ArenaHubScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery<HubData>({
    queryKey: ["/api/arena/hub"],
  });

  const handleCardPress = useCallback(() => {
    navigation.navigate("ArenaMyCard");
  }, [navigation]);

  const handleSyncCard = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/arena/sync-card");
      queryClient.invalidateQueries({ queryKey: ["/api/arena/hub"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/my-card"] });
    } catch {}
  }, [queryClient]);

  const daysRemaining = data?.activeSeason
    ? Math.max(0, Math.ceil((new Date(data.activeSeason.endDate).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={Colors.dark.primary}
        />
      }
    >
      {/* Hero title */}
      <View style={styles.header}>
        <Text style={styles.title}>Glow Arena</Text>
        <Text style={styles.subtitle}>Collect. Battle. Conquer.</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.primary} size="large" />
        </View>
      ) : (
        <>
          {/* Season badge */}
          {data?.activeSeason && (
            <View style={styles.seasonBadge}>
              <Feather name="award" size={14} color={Colors.dark.primary} />
              <Text style={styles.seasonText}>
                {data.activeSeason.name}
                {daysRemaining !== null ? `  ·  ${daysRemaining}d left` : ""}
              </Text>
            </View>
          )}

          {/* Champion Card */}
          <Pressable
            style={styles.cardContainer}
            onPress={handleCardPress}
          >
            {data?.card && data?.player ? (
              <ChampionCard
                card={data.card}
                player={data.player}
                size="standard"
                onPress={handleCardPress}
              />
            ) : (
              <View style={styles.noCardPlaceholder}>
                <Feather name="credit-card" size={40} color={Colors.dark.disabled} />
                <Text style={styles.noCardText}>Generating your card…</Text>
              </View>
            )}
          </Pressable>

          {/* Sync button */}
          <Pressable style={styles.syncButton} onPress={handleSyncCard}>
            <Feather name="refresh-cw" size={13} color={Colors.dark.text} />
            <Text style={styles.syncButtonText}>Sync Card</Text>
          </Pressable>

          {/* Arena record */}
          <View style={styles.recordRow}>
            <RecordStat label="Wins" value={data?.arenaRecord.wins ?? 0} color={Colors.dark.success} />
            <View style={styles.recordDivider} />
            <RecordStat label="Losses" value={data?.arenaRecord.losses ?? 0} color={Colors.dark.error} />
            <View style={styles.recordDivider} />
            <RecordStat label="Arena MMR" value={data?.arenaRecord.mmr ?? 1000} color={Colors.dark.primary} />
          </View>

          {/* Locked feature previews */}
          <Text style={styles.sectionTitle}>Coming Soon</Text>
          <View style={styles.lockedGrid}>
            <LockedFeature icon="swords" label="Battle" description="Challenge players to card battles" />
            <LockedFeature icon="layers" label="Collection" description="Collect player & coach cards" />
            <LockedFeature icon="package" label="Pack Shop" description="Open card packs" />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function RecordStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.recordStat}>
      <Text style={[styles.recordValue, { color }]}>{value}</Text>
      <Text style={styles.recordLabel}>{label}</Text>
    </View>
  );
}

function LockedFeature({ icon, label, description }: { icon: any; label: string; description: string }) {
  return (
    <View style={styles.lockedCard}>
      <View style={styles.lockedIconWrap}>
        <Feather name={icon} size={22} color={Colors.dark.disabled} />
        <Feather name="lock" size={11} color={Colors.dark.disabled} style={styles.lockOverlay} />
      </View>
      <Text style={styles.lockedLabel}>{label}</Text>
      <Text style={styles.lockedDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  loadingContainer: {
    alignItems: "center",
    paddingTop: 60,
  },
  seasonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    backgroundColor: "rgba(200,255,61,0.10)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.20)",
  },
  seasonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  cardContainer: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  noCardPlaceholder: {
    width: 220,
    height: 308,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    gap: 12,
  },
  noCardText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
  },
  syncButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  recordRow: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  recordStat: {
    flex: 1,
    alignItems: "center",
  },
  recordValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  recordLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  recordDivider: {
    width: 1,
    backgroundColor: Colors.dark.divider,
    marginVertical: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  lockedGrid: {
    gap: Spacing.md,
  },
  lockedCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 12,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  lockedIconWrap: {
    position: "relative",
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  lockOverlay: {
    position: "absolute",
    bottom: -2,
    right: -2,
  },
  lockedLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    flex: 0,
    width: 80,
  },
  lockedDescription: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.disabled,
    lineHeight: 16,
  },
});
