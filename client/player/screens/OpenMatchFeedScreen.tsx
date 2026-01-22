import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeIn, FadeInRight, SlideInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes, BorderRadius, Typography, Backgrounds, GlowColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { LockedScreen } from "../components/LockedScreen";

interface OpenMatch {
  id: string;
  bookingId: string;
  hostPlayerId: string;
  academyId: string | null;
  matchType: string;
  title: string | null;
  description: string | null;
  requiredLevelMin: number;
  requiredLevelMax: number;
  requiredBallLevel: string | null;
  maxPlayers: number;
  currentPlayers: number;
  status: string;
  visibility: string;
  costPerPlayer: string | null;
  currency: string;
  xpBonus: number;
  createdAt: string;
}

type FilterType = "all" | "singles" | "doubles";

function MatchCard({ 
  match, 
  onJoin, 
  isJoining 
}: { 
  match: OpenMatch; 
  onJoin: () => void; 
  isJoining: boolean;
}) {
  const slotsLeft = match.maxPlayers - match.currentPlayers;
  const isFull = slotsLeft === 0;

  return (
    <Animated.View entering={FadeInRight.delay(100)}>
      <Card style={styles.matchCard}>
        <View style={styles.matchHeader}>
          <View style={[styles.matchTypeBadge, match.matchType === "doubles" && styles.matchTypeDoubles]}>
            <Ionicons 
              name={match.matchType === "doubles" ? "people" : "person"} 
              size={12} 
              color={Colors.dark.text} 
            />
            <Text style={styles.matchTypeText}>
              {match.matchType.charAt(0).toUpperCase() + match.matchType.slice(1)}
            </Text>
          </View>
          <View style={styles.slotsBadge}>
            <Text style={styles.slotsText}>
              {match.currentPlayers}/{match.maxPlayers}
            </Text>
          </View>
        </View>

        <Text style={styles.matchTitle}>
          {match.title || `Looking for ${match.matchType} partner`}
        </Text>

        {match.description ? (
          <Text style={styles.matchDescription} numberOfLines={2}>
            {match.description}
          </Text>
        ) : null}

        <View style={styles.matchMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="fitness" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.metaText}>
              Level {match.requiredLevelMin}-{match.requiredLevelMax}
            </Text>
          </View>
          {match.requiredBallLevel ? (
            <View style={styles.metaItem}>
              <Ionicons name="tennisball" size={14} color={Colors.dark.gold} />
              <Text style={styles.metaText}>{match.requiredBallLevel}</Text>
            </View>
          ) : null}
          {match.costPerPlayer && parseFloat(match.costPerPlayer) > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="card" size={14} color={Colors.dark.primary} />
              <Text style={styles.metaText}>
                {match.currency} {match.costPerPlayer}
              </Text>
            </View>
          ) : (
            <View style={styles.freeBadge}>
              <Text style={styles.freeText}>FREE</Text>
            </View>
          )}
        </View>

        <View style={styles.matchFooter}>
          <View style={styles.xpBadge}>
            <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
            <Text style={styles.xpText}>+{match.xpBonus} XP</Text>
          </View>

          <Pressable 
            style={[styles.joinButton, isFull && styles.joinButtonDisabled]}
            onPress={onJoin}
            disabled={isFull || isJoining}
          >
            {isJoining ? (
              <ActivityIndicator size="small" color={Colors.dark.text} />
            ) : (
              <>
                <Ionicons 
                  name={isFull ? "close-circle" : "add-circle"} 
                  size={18} 
                  color={Colors.dark.text} 
                />
                <Text style={styles.joinButtonText}>
                  {isFull ? "Full" : "Join"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </Card>
    </Animated.View>
  );
}

export default function OpenMatchFeedScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [joiningMatchId, setJoiningMatchId] = useState<string | null>(null);

  const { data: matches, isLoading, refetch, isRefetching } = useQuery<OpenMatch[]>({
    queryKey: ["/api/open-matches"],
  });

  const joinMutation = useMutation({
    mutationFn: async (matchId: string) => {
      setJoiningMatchId(matchId);
      const response = await apiRequest(`${getApiUrl()}/api/open-matches/${matchId}/join`, {
        method: "POST",
      });
      return response;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches"] });
      Alert.alert("Joined!", "You've joined the match. Good luck!");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Could not join match");
    },
    onSettled: () => {
      setJoiningMatchId(null);
    },
  });

  const filteredMatches = useMemo(() => {
    if (!matches) return [];
    if (activeFilter === "all") return matches;
    return matches.filter((m) => m.matchType === activeFilter);
  }, [matches, activeFilter]);

  const renderMatch = ({ item }: { item: OpenMatch }) => (
    <MatchCard
      match={item}
      onJoin={() => joinMutation.mutate(item.id)}
      isJoining={joiningMatchId === item.id}
    />
  );

  return (
    <LockedScreen featureKey="match_preparation">
      <View style={styles.container}>
        <View style={styles.filters}>
          {(["all", "singles", "doubles"] as FilterType[]).map((filter) => (
            <Pressable
              key={filter}
              style={[styles.filterButton, activeFilter === filter && styles.filterButtonActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveFilter(filter);
              }}
            >
              <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={Colors.dark.primary} size="large" />
            <Text style={styles.loadingText}>Finding matches...</Text>
          </View>
        ) : filteredMatches.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="tennisball-outline" size={64} color={Colors.dark.textMuted} />
            <Text style={styles.emptyTitle}>No open matches</Text>
            <Text style={styles.emptyText}>
              Be the first to create an open match after booking a court
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredMatches}
            renderItem={renderMatch}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={Colors.dark.primary}
              />
            }
          />
        )}
      </View>
    </LockedScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  headerPlaceholder: {
    width: 44,
  },
  filters: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
  },
  filterButtonActive: {
    backgroundColor: Colors.dark.primary,
  },
  filterText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  filterTextActive: {
    color: Colors.dark.text,
  },
  list: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  matchCard: {
    padding: Spacing.md,
  },
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  matchTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  matchTypeDoubles: {
    backgroundColor: Colors.dark.xpCyan,
  },
  matchTypeText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  slotsBadge: {
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  slotsText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  matchTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  matchDescription: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  matchMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.text,
  },
  freeBadge: {
    backgroundColor: Colors.dark.primary + "30",
    paddingVertical: 2,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  freeText: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  matchFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  xpText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  joinButtonDisabled: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  joinButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.text,
  },
});
