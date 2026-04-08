import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";
import { Colors, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { getStaticAssetsUrl, buildPhotoUrl, apiFetch } from "@/lib/query-client";
import * as Haptics from "expo-haptics";
import { LockedScreen } from "../components/LockedScreen";

interface PlayerResult {
  id: string;
  name: string;
  photoUrl: string | null;
  level: number;
  glowScore: number;
  ballLevel: string | null;
  openToPlay: boolean;
  hasHomeAddress?: boolean;
}

interface SearchResults {
  query: string;
  results: PlayerResult[];
}

interface OpenToPlayData {
  players: PlayerResult[];
  listings: any[];
}

const SKILL_FILTERS = [
  { id: "all", label: "All Levels" },
  { id: "green", label: "Green" },
  { id: "yellow", label: "Yellow" },
  { id: "orange", label: "Orange" },
  { id: "red", label: "Red" },
];

function PlayerCard({ player, index }: { player: PlayerResult; index: number }) {
  const navigation = useNavigation<any>();
  
  return (
    <Animated.View entering={FadeInRight.delay(index * 50)}>
      <Pressable
        style={styles.playerCard}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("PlayerPublicProfile", { playerId: player.id });
        }}
      >
        <View style={styles.playerAvatarContainer}>
          {player.photoUrl ? (
            <Image
              source={{ uri: buildPhotoUrl(player.photoUrl)! }}
              style={styles.playerAvatar}
            />
          ) : (
            <View style={styles.playerAvatarPlaceholder}>
              <Ionicons name="person" size={24} color={Colors.dark.textMuted} />
            </View>
          )}
          {player.openToPlay ? (
            <View style={styles.openToPlayBadge}>
              <Ionicons name="tennisball" size={10} color={Colors.dark.text} />
            </View>
          ) : null}
        </View>
        
        <View style={styles.playerInfo}>
          <ThemedText style={styles.playerName}>{player.name}</ThemedText>
          <View style={styles.playerMeta}>
            <View style={styles.levelBadge}>
              <ThemedText style={styles.levelText}>Lvl {player.level}</ThemedText>
            </View>
            {player.ballLevel ? (
              <View style={[styles.ballBadge, { backgroundColor: getBallColor(player.ballLevel) + "20" }]}>
                <Ionicons name="tennisball" size={12} color={getBallColor(player.ballLevel)} />
                <ThemedText style={[styles.ballText, { color: getBallColor(player.ballLevel) }]}>
                  {player.ballLevel}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>
        
        <View style={styles.playerScore}>
          {player.hasHomeAddress ? (
            <Ionicons name="home" size={14} color={Colors.dark.xpCyan} style={{ marginRight: 4 }} />
          ) : null}
          <Ionicons name="flame" size={16} color={Colors.dark.gold} />
          <ThemedText style={styles.scoreText}>{player.glowScore}</ThemedText>
        </View>
        
        <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

function getBallColor(ball: string): string {
  switch (ball?.toLowerCase()) {
    case "green": return "#2ECC40";
    case "yellow": return "#FFDC00";
    case "orange": return "#FF851B";
    case "red": return "#FF4136";
    default: return Colors.dark.textMuted;
  }
}

export default function PlayerFinderScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState("all");
  const [showOpenToPlayOnly, setShowOpenToPlayOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<"search" | "openToPlay" | "discover">("discover");
  const [discoverFilter, setDiscoverFilter] = useState<"recommended" | "sameLevel" | "academy">("recommended");

  const searchParams = new URLSearchParams();
  if (searchQuery) searchParams.append("q", searchQuery);
  if (selectedSkill !== "all") searchParams.append("skill", selectedSkill);
  if (showOpenToPlayOnly) searchParams.append("openToPlay", "true");
  const searchQueryString = searchParams.toString();

  const { data: searchData, isLoading: searchLoading, refetch: refetchSearch, isError: searchError } = useQuery<SearchResults>({
    queryKey: [`/api/player/search?${searchQueryString}`],
    enabled: activeTab === "search",
  });

  const { data: openToPlayData, isLoading: openToPlayLoading, refetch: refetchOTP, isError: otpError } = useQuery<OpenToPlayData>({
    queryKey: ["/api/player/open-to-play"],
    enabled: activeTab === "openToPlay",
  });

  const { data: discoverData, isLoading: discoverLoading, refetch: refetchDiscover, isError: discoverError } = useQuery<{ players: PlayerResult[] }>({
    queryKey: [`/api/player/discover?filter=${discoverFilter}`],
    enabled: activeTab === "discover",
  });

  const players = activeTab === "search" 
    ? searchData?.results || [] 
    : activeTab === "openToPlay" 
      ? openToPlayData?.players || []
      : discoverData?.players || [];
  const isLoading = activeTab === "search" ? searchLoading : activeTab === "openToPlay" ? openToPlayLoading : discoverLoading;
  const isError = activeTab === "search" ? searchError : activeTab === "openToPlay" ? otpError : discoverError;
  const refetch = activeTab === "search" ? refetchSearch : activeTab === "openToPlay" ? refetchOTP : refetchDiscover;

  return (
    <LockedScreen featureKey="player_finder">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Find Players</Text>
          <View style={{ width: 40 }} />
        </View>

      <View style={styles.tabsContainer}>
        <Pressable
          style={[styles.tab, activeTab === "discover" && styles.tabActive]}
          onPress={() => setActiveTab("discover")}
        >
          <Ionicons name="compass" size={18} color={activeTab === "discover" ? Colors.dark.xpCyan : Colors.dark.textMuted} />
          <ThemedText style={[styles.tabText, activeTab === "discover" && styles.tabTextActive]}>Discover</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "search" && styles.tabActive]}
          onPress={() => setActiveTab("search")}
        >
          <Ionicons name="search" size={18} color={activeTab === "search" ? Colors.dark.xpCyan : Colors.dark.textMuted} />
          <ThemedText style={[styles.tabText, activeTab === "search" && styles.tabTextActive]}>Search</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "openToPlay" && styles.tabActive]}
          onPress={() => setActiveTab("openToPlay")}
        >
          <Ionicons name="tennisball" size={18} color={activeTab === "openToPlay" ? Colors.dark.primary : Colors.dark.textMuted} />
          <ThemedText style={[styles.tabText, activeTab === "openToPlay" && styles.tabTextActive]}>Play</ThemedText>
        </Pressable>
      </View>

      {activeTab === "discover" ? (
        <View style={styles.discoverFilters}>
          <Pressable
            style={[styles.discoverChip, discoverFilter === "recommended" && styles.discoverChipActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setDiscoverFilter("recommended");
            }}
          >
            <Ionicons name="star" size={14} color={discoverFilter === "recommended" ? Colors.dark.backgroundRoot : Colors.dark.gold} />
            <ThemedText style={[styles.discoverChipText, discoverFilter === "recommended" && styles.discoverChipTextActive]}>
              Recommended
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.discoverChip, discoverFilter === "sameLevel" && styles.discoverChipActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setDiscoverFilter("sameLevel");
            }}
          >
            <Ionicons name="bar-chart" size={14} color={discoverFilter === "sameLevel" ? Colors.dark.backgroundRoot : Colors.dark.xpCyan} />
            <ThemedText style={[styles.discoverChipText, discoverFilter === "sameLevel" && styles.discoverChipTextActive]}>
              Same Level
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.discoverChip, discoverFilter === "academy" && styles.discoverChipActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setDiscoverFilter("academy");
            }}
          >
            <Ionicons name="location" size={14} color={discoverFilter === "academy" ? Colors.dark.backgroundRoot : Colors.dark.primary} />
            <ThemedText style={[styles.discoverChipText, discoverFilter === "academy" && styles.discoverChipTextActive]}>
              My Academy
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {activeTab === "search" ? (
        <>
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name..."
                placeholderTextColor={Colors.dark.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={18} color={Colors.dark.textMuted} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.filtersContainer}>
            <FlatList
              horizontal
              data={SKILL_FILTERS}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.filterChip, selectedSkill === item.id && styles.filterChipActive]}
                  onPress={() => setSelectedSkill(item.id)}
                >
                  <ThemedText style={[styles.filterText, selectedSkill === item.id && styles.filterTextActive]}>
                    {item.label}
                  </ThemedText>
                </Pressable>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: Spacing.md }}
            />
            
            <Pressable
              style={[styles.openToPlayFilter, showOpenToPlayOnly && styles.openToPlayFilterActive]}
              onPress={() => setShowOpenToPlayOnly(!showOpenToPlayOnly)}
            >
              <Ionicons 
                name="tennisball" 
                size={14} 
                color={showOpenToPlayOnly ? Colors.dark.primary : Colors.dark.textMuted} 
              />
              <ThemedText style={[styles.openToPlayFilterText, showOpenToPlayOnly && styles.openToPlayFilterTextActive]}>
                Open to Play
              </ThemedText>
            </Pressable>
          </View>
        </>
      ) : null}

      {activeTab === "openToPlay" ? (
        <View style={styles.openToPlayHeader}>
          <LinearGradient
            colors={[Colors.dark.primary + "20", "transparent"]}
            style={styles.openToPlayBanner}
          >
            <Ionicons name="tennisball" size={28} color={Colors.dark.primary} />
            <View style={styles.openToPlayBannerText}>
              <ThemedText style={styles.openToPlayTitle}>Find a Match</ThemedText>
              <ThemedText style={styles.openToPlaySubtitle}>
                Players who are looking to play right now
              </ThemedText>
            </View>
          </LinearGradient>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        </View>
      ) : isError ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
          <ThemedText style={styles.emptyTitle}>Failed to load players</ThemedText>
          <Pressable onPress={() => refetch()} style={styles.retryButton}>
            <ThemedText style={styles.retryText}>Try Again</ThemedText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={players}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => <PlayerCard player={item} index={index} />}
          refreshControl={
            <RefreshControl 
              refreshing={false} 
              onRefresh={() => refetch()}
              tintColor={Colors.dark.xpCyan}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing.xl }
          ]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons 
                name={activeTab === "search" ? "people-outline" : "tennisball-outline"} 
                size={48} 
                color={Colors.dark.textMuted} 
              />
              <ThemedText style={styles.emptyTitle}>
                {activeTab === "discover" 
                  ? "No players found" 
                  : activeTab === "search" 
                    ? "No players found" 
                    : "No one is open to play right now"}
              </ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                {activeTab === "discover"
                  ? "Try a different filter to find players"
                  : activeTab === "search" 
                    ? "Try adjusting your search or filters"
                    : "Check back later or set yourself as open to play"
                }
              </ThemedText>
            </View>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  tabsContainer: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: 6,
  },
  tabActive: {
    backgroundColor: Colors.dark.backgroundDefault,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.text,
  },
  discoverFilters: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  discoverChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  discoverChipActive: {
    backgroundColor: Colors.dark.xpCyan,
    borderColor: Colors.dark.xpCyan,
  },
  discoverChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  discoverChipTextActive: {
    color: Colors.dark.buttonText,
  },
  searchContainer: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark.text,
  },
  filtersContainer: {
    marginBottom: Spacing.md,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    marginRight: Spacing.xs,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.xpCyan,
  },
  filterText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  filterTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  openToPlayFilter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginLeft: Spacing.md,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
  },
  openToPlayFilterActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  openToPlayFilterText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  openToPlayFilterTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  openToPlayHeader: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  openToPlayBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  openToPlayBannerText: {
    flex: 1,
  },
  openToPlayTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  openToPlaySubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.md,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  playerAvatarContainer: {
    position: "relative",
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  playerAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  openToPlayBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundDefault,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  playerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  levelBadge: {
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  levelText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  ballBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ballText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  playerScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scoreText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  retryButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: BorderRadius.md,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
});
