import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Dimensions,
  Platform,
  Image as RNImage,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Colors, ProTennisColors, Spacing, BorderRadius, GlowColors, Backgrounds } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

const NEWS_SPORT_PREF_KEY = "@news_sport_preference";

type SportKey = "tennis" | "padel" | "pickleball";

const SPORT_CHIPS: { key: SportKey; label: string }[] = [
  { key: "tennis", label: "Tennis" },
  { key: "padel", label: "Padel" },
  { key: "pickleball", label: "Pickleball" },
];

interface NewsArticle {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  thumbnail?: string;
}

interface NewsResponse {
  articles: NewsArticle[];
  cached?: boolean;
}

const SOURCE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  "ATP Tour": { bg: "#0062FF", text: Colors.dark.text, icon: "tennisball" },
  "BBC Sport": { bg: "#BB1919", text: Colors.dark.text, icon: "globe" },
  "Tennis.com": { bg: "#00B894", text: Colors.dark.text, icon: "tennisball" },
  "WTA": { bg: "#E91E63", text: Colors.dark.text, icon: "tennisball" },
  "World Padel Tour": { bg: "#00B4D8", text: Colors.dark.text, icon: "newspaper" },
  "Padel Magazine": { bg: "#FF6B35", text: Colors.dark.text, icon: "newspaper" },
  "PPA Tour": { bg: "#7B2FBE", text: Colors.dark.text, icon: "newspaper" },
  "The Pickler": { bg: "#2ECC71", text: Colors.dark.text, icon: "newspaper" },
  "PickleballCentral": { bg: "#FFD700", text: Backgrounds.root, icon: "newspaper" },
  default: { bg: ProTennisColors.neonGreen, text: Colors.dark.buttonText, icon: "newspaper" },
};

function getSourceConfig(source: string) {
  return SOURCE_COLORS[source] || SOURCE_COLORS.default;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function NewsCard({ article, index }: { article: NewsArticle; index: number }) {
  const scale = useSharedValue(1);
  const sourceConfig = getSourceConfig(article.source);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const handlePress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await WebBrowser.openBrowserAsync(article.link, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      controlsColor: ProTennisColors.neonGreen,
    });
  };

  const hasThumbnail = !!article.thumbnail;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
      style={animatedStyle}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.card}
      >
        <View style={styles.thumbnailContainer}>
          {hasThumbnail ? (
            <>
              {Platform.OS === "web" ? (
                <RNImage
                  source={{ uri: article.thumbnail }}
                  style={styles.thumbnail}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={{ uri: article.thumbnail }}
                  style={styles.thumbnail}
                  contentFit="cover"
                  transition={300}
                />
              )}
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.8)"]}
                style={styles.thumbnailGradient}
              />
            </>
          ) : (
            <LinearGradient
              colors={[`${sourceConfig.bg}40`, ProTennisColors.surfaceDark, ProTennisColors.midnightBlue]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.placeholderGradient}
            >
              <View style={styles.placeholderIconContainer}>
                <Ionicons name="tennisball" size={40} color={`${sourceConfig.bg}60`} />
              </View>
            </LinearGradient>
          )}
        </View>

        <View style={styles.cardContent}>
          <View style={styles.sourceRow}>
            <View style={[styles.sourceBadge, { backgroundColor: sourceConfig.bg }]}>
              <Ionicons
                name={sourceConfig.icon as any}
                size={12}
                color={sourceConfig.text}
              />
              <Text style={[styles.sourceText, { color: sourceConfig.text }]}>
                {article.source}
              </Text>
            </View>
            <Text style={styles.timeAgo}>{formatTimeAgo(article.publishedAt)}</Text>
          </View>

          <Text style={styles.title} numberOfLines={3}>
            {article.title}
          </Text>

          <View style={styles.actionRow}>
            <View style={styles.readMoreButton}>
              <Text style={styles.readMoreText}>Read Article</Text>
              <Ionicons name="arrow-forward" size={14} color={ProTennisColors.neonGreen} />
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function FeaturedCard({ article }: { article: NewsArticle }) {
  const sourceConfig = getSourceConfig(article.source);

  const handlePress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await WebBrowser.openBrowserAsync(article.link, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      controlsColor: ProTennisColors.neonGreen,
    });
  };

  return (
    <Animated.View entering={FadeIn.duration(500)}>
      <Pressable onPress={handlePress} style={styles.featuredCard}>
        {article.thumbnail ? (
          <View style={styles.featuredImageContainer}>
            {Platform.OS === "web" ? (
              <RNImage
                source={{ uri: article.thumbnail }}
                style={styles.featuredImage}
                resizeMode="cover"
              />
            ) : (
              <Image
                source={{ uri: article.thumbnail }}
                style={styles.featuredImage}
                contentFit="cover"
                transition={300}
              />
            )}
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.9)"]}
              style={styles.featuredGradient}
            />
          </View>
        ) : (
          <LinearGradient
            colors={[ProTennisColors.surfaceDark, ProTennisColors.midnightBlue]}
            style={styles.featuredPlaceholder}
          />
        )}

        <View style={styles.featuredContent}>
          <View style={styles.featuredBadge}>
            <Ionicons name="flame" size={14} color="#FF6B35" />
            <Text style={styles.featuredBadgeText}>TRENDING</Text>
          </View>

          <Text style={styles.featuredTitle} numberOfLines={3}>
            {article.title}
          </Text>

          <View style={styles.featuredMeta}>
            <View style={[styles.sourceBadge, { backgroundColor: sourceConfig.bg }]}>
              <Text style={[styles.sourceText, { color: sourceConfig.text }]}>
                {article.source}
              </Text>
            </View>
            <Text style={styles.featuredTime}>{formatTimeAgo(article.publishedAt)}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function EmptyState({ sport }: { sport: SportKey }) {
  const sportLabel = SPORT_CHIPS.find((c) => c.key === sport)?.label ?? "Sport";
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="newspaper-outline" size={64} color={Colors.dark.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>No News Available</Text>
      <Text style={styles.emptySubtitle}>
        Pull down to refresh and check for the latest {sportLabel} news
      </Text>
    </View>
  );
}

function LoadingState({ sport }: { sport: SportKey }) {
  const sportLabel = SPORT_CHIPS.find((c) => c.key === sport)?.label ?? "sport";
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color={ProTennisColors.neonGreen} />
      <Text style={styles.loadingText}>Loading {sportLabel} news...</Text>
    </View>
  );
}

function SportFilterChips({
  selected,
  onSelect,
}: {
  selected: SportKey;
  onSelect: (sport: SportKey) => void;
}) {
  return (
    <View style={styles.chipsRow}>
      {SPORT_CHIPS.map((chip) => {
        const isActive = chip.key === selected;
        return (
          <Pressable
            key={chip.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(chip.key);
            }}
            style={[styles.chip, isActive ? styles.chipActive : styles.chipInactive]}
          >
            <Text style={[styles.chipText, isActive ? styles.chipTextActive : styles.chipTextInactive]}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function NewsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSport, setSelectedSport] = useState<SportKey>("tennis");
  const [prefLoaded, setPrefLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(NEWS_SPORT_PREF_KEY);
        if (saved && ["tennis", "padel", "pickleball"].includes(saved)) {
          setSelectedSport(saved as SportKey);
        } else {
          try {
            const profileRes = await apiFetch("/api/player/me/profile");
            if (profileRes.ok) {
              const profile = await profileRes.json();
              type SportProfileEntry = { sport?: string; sportType?: string };
              const sports: string[] = (profile?.sportProfiles as SportProfileEntry[] | undefined)?.map(
                (sp) => (sp.sport || sp.sportType || "").toLowerCase()
              ) ?? [];
              if (sports.includes("tennis")) {
                setSelectedSport("tennis");
              } else if (sports.includes("padel")) {
                setSelectedSport("padel");
              } else if (sports.includes("pickleball")) {
                setSelectedSport("pickleball");
              }
            }
          } catch {
          }
        }
      } catch {
      } finally {
        setPrefLoaded(true);
      }
    })();
  }, []);

  const handleSelectSport = useCallback(async (sport: SportKey) => {
    setSelectedSport(sport);
    try {
      await AsyncStorage.setItem(NEWS_SPORT_PREF_KEY, sport);
    } catch {
    }
  }, []);

  const { data, isLoading, error, refetch } = useQuery<NewsResponse>({
    queryKey: ["/api/player/news", selectedSport],
    queryFn: async () => {
      const res = await apiFetch(`/api/player/news?sport=${selectedSport}`);
      if (!res.ok) throw new Error("Failed to fetch news");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: prefLoaded,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await queryClient.invalidateQueries({ queryKey: ["/api/player/news", selectedSport] });
    await refetch();
    setRefreshing(false);
  }, [queryClient, refetch, selectedSport]);

  const articles = data?.articles || [];
  const featuredArticle = articles[0];
  const remainingArticles = articles.slice(1);

  const sportLabel = SPORT_CHIPS.find((c) => c.key === selectedSport)?.label ?? "Sport";

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <Animated.View entering={FadeInUp.delay(100)} style={styles.headerTitleRow}>
        <View style={styles.headerIconContainer}>
          <LinearGradient
            colors={[ProTennisColors.neonGreen, ProTennisColors.neonCyan]}
            style={styles.headerIconGradient}
          >
            <Ionicons name="newspaper" size={24} color={Colors.dark.buttonText} />
          </LinearGradient>
        </View>
        <View>
          <Text style={styles.headerTitle}>{sportLabel} News</Text>
          <Text style={styles.headerSubtitle}>Stay updated with the latest</Text>
        </View>
      </Animated.View>

      <SportFilterChips selected={selectedSport} onSelect={handleSelectSport} />

      {featuredArticle ? <FeaturedCard article={featuredArticle} /> : null}

      {remainingArticles.length > 0 ? (
        <Animated.View entering={FadeInUp.delay(200)} style={styles.sectionHeader}>
          <View style={styles.sectionDivider} />
          <Text style={styles.sectionTitle}>Latest Stories</Text>
          <View style={styles.sectionDivider} />
        </Animated.View>
      ) : null}
    </View>
  );

  if (isLoading && !data) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[ProTennisColors.midnightBlue, Backgrounds.root]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.chipsRowStandalone, { paddingTop: insets.top + Spacing.md }]}>
          <SportFilterChips selected={selectedSport} onSelect={handleSelectSport} />
        </View>
        <LoadingState sport={selectedSport} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[ProTennisColors.midnightBlue, Backgrounds.root]}
        style={StyleSheet.absoluteFill}
      />

      <FlatList
        data={remainingArticles}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <NewsCard article={item} index={index} />}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={articles.length === 0 ? <EmptyState sport={selectedSport} /> : null}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: Spacing.md, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ProTennisColors.neonGreen}
            colors={[ProTennisColors.neonGreen]}
          />
        }
      />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ProTennisColors.midnightBlue,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
  },
  headerSection: {
    marginBottom: Spacing.lg,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  headerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    overflow: "hidden",
  },
  headerIconGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  chipsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  chipsRowStandalone: {
    paddingHorizontal: Spacing.md,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipActive: {
    backgroundColor: ProTennisColors.neonGreen,
  },
  chipInactive: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  chipTextActive: {
    color: Colors.dark.buttonText,
  },
  chipTextInactive: {
    color: Colors.dark.textMuted,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  sectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.chipBackgroundStrong,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  featuredCard: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    backgroundColor: ProTennisColors.surfaceDark,
    height: 280,
  },
  featuredImageContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  featuredImage: {
    width: "100%",
    height: "100%",
  },
  featuredGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  featuredPlaceholder: {
    ...StyleSheet.absoluteFillObject,
  },
  featuredContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.lg,
  },
  featuredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,107,53,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginBottom: Spacing.sm,
  },
  featuredBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FF6B35",
    letterSpacing: 1,
  },
  featuredTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    lineHeight: 28,
    marginBottom: Spacing.md,
  },
  featuredMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  featuredTime: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  card: {
    borderRadius: BorderRadius.lg,
    backgroundColor: ProTennisColors.surfaceCard,
    overflow: "hidden",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: ProTennisColors.neonCyan + "20",
  },
  thumbnailContainer: {
    height: 180,
    position: "relative",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  thumbnailGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  placeholderGradient: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.chipBackground,
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: {
    padding: Spacing.md,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sourceText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timeAgo: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: Colors.dark.text,
    lineHeight: 24,
    marginBottom: Spacing.md,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  readMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  readMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.neonGreen,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
    paddingHorizontal: Spacing.xl,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.dark.chipBackground,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: 15,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  loadingState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: Colors.dark.textMuted,
  },
}));
