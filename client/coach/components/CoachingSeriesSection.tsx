import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Alert,
  TextInput,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Animated, { 
  useAnimatedStyle, 
  withTiming, 
  useSharedValue,
  interpolate,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { CoachingSeriesCard } from "./CoachingSeriesCard";
import { GuidedEmptyState } from "@/components/GuidedEmptyState";
import { apiRequest } from "@/lib/query-client";
import { useCoach } from "@/coach/context/CoachContext";
import { convertUTCTimeToLocal } from "@/lib/dateUtils";
import { getSportColor, formatSportSkillLevel, getSportSkillLevelColor } from "@shared/sportConfig";

interface PlayerPreview {
  id: string;
  name: string;
  ballLevel?: string | null;
}

interface CoachingSeries {
  id: string;
  title: string;
  dayOfWeek: number;
  startTime: string;
  duration: number;
  sessionType: string;
  status: string;
  seriesStartDate: string;
  seriesEndDate?: string | null;
  weekCount?: number | null;
  maxPlayers?: number | null;
  locationName?: string | null;
  courtName?: string | null;
  playerCount: number;
  sessionsCompleted: number;
  pendingFeedback: number;
  playerPreview?: PlayerPreview[];
  sport?: string | null;
  isPublic?: boolean | null;
}

interface Props {
  onSeriesPress: (series: CoachingSeries) => void;
  onCreatePress: () => void;
}

type FilterType = "all" | "active" | "paused" | "ended";
type SportFilter = "all" | "tennis" | "padel" | "pickleball";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FLEXIBLE_DAY = -1;

function getBallColor(level: string, sport?: string | null): string {
  if (sport && sport !== "tennis") {
    return getSportSkillLevelColor(sport, level);
  }
  const l = level.toLowerCase();
  if (l.includes("red")) return "#FF4444";
  if (l.includes("orange")) return "#FF8C00";
  if (l.includes("green")) return "#00C853";
  if (l.includes("yellow")) return "#FFD700";
  if (l.includes("adult") || l.includes("dss")) return "#8E24AA";
  return Colors.dark.textMuted;
}

interface CollapsibleDaySectionProps {
  dayOfWeek: number;
  series: CoachingSeries[];
  isExpanded: boolean;
  onToggle: () => void;
  onSeriesPress: (series: CoachingSeries) => void;
  onSeriesLongPress?: (series: CoachingSeries) => void;
  isFlexible?: boolean;
}

function CollapsibleDaySection({ 
  dayOfWeek, 
  series, 
  isExpanded, 
  onToggle, 
  onSeriesPress,
  onSeriesLongPress,
  isFlexible = false,
}: CollapsibleDaySectionProps) {
  const rotation = useSharedValue(isExpanded ? 1 : 0);
  const height = useSharedValue(isExpanded ? 1 : 0);

  React.useEffect(() => {
    rotation.value = withTiming(isExpanded ? 1 : 0, { duration: 200 });
    height.value = withTiming(isExpanded ? 1 : 0, { duration: 250 });
  }, [isExpanded]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [-90, 0])}deg` }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: height.value,
    maxHeight: interpolate(height.value, [0, 1], [0, 5000]),
    overflow: "hidden" as const,
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  };

  const sortedSeries = [...series].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const sectionTitle = isFlexible ? "Flexible Schedule" : DAY_NAMES[dayOfWeek];
  const accentColor = isFlexible ? Colors.dark.cyan : Colors.dark.gold;

  return (
    <View style={collapsibleStyles.container}>
      <Pressable onPress={handlePress} style={[collapsibleStyles.header, isFlexible && { borderColor: `${Colors.dark.cyan}30` }]}>
        <View style={collapsibleStyles.headerLeft}>
          <Animated.View style={arrowStyle}>
            <Ionicons name="chevron-down" size={20} color={accentColor} />
          </Animated.View>
          {isFlexible && <Ionicons name="calendar-outline" size={18} color={Colors.dark.cyan} />}
          <Text style={[collapsibleStyles.dayTitle, isFlexible && { color: Colors.dark.cyan }]}>{sectionTitle}</Text>
        </View>
        <View style={collapsibleStyles.headerRight}>
          <Text style={[collapsibleStyles.classCount, { color: accentColor }]}>{series.length}</Text>
          <Text style={collapsibleStyles.classLabel}>
            {series.length === 1 ? "class" : "classes"}
          </Text>
        </View>
      </Pressable>
      
      <Animated.View style={contentStyle}>
        <View style={collapsibleStyles.content}>
          {sortedSeries.map((s) => (
            <CoachingSeriesCard
              key={s.id}
              series={s}
              onPress={onSeriesPress}
              onLongPress={onSeriesLongPress}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const collapsibleStyles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.gold}30`,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  dayTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  classCount: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  classLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  content: {
    paddingTop: Spacing.sm,
    paddingLeft: Spacing.md,
  },
});

export function CoachingSeriesSection({ onSeriesPress, onCreatePress }: Props) {
  const [filter, setFilter] = useState<FilterType>("active");
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const [searchText, setSearchText] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const queryClient = useQueryClient();
  const { academy } = useCoach();
  const timezone = academy?.timezone || "Asia/Dubai";

  const { data: seriesList, isLoading, error, refetch } = useQuery<CoachingSeries[]>({
    queryKey: ["/api/coach/series"],
  });

  const migrateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/coach/series/migrate");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Migration failed");
      }
      return response.json() as Promise<{ message: string; migratedCount: number; seriesCreated: any[] }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (data.migratedCount > 0) {
        Alert.alert(
          "Migration Complete",
          `Successfully imported ${data.migratedCount} recurring session groups into classes.`,
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "No Sessions to Import",
          "All recurring sessions have already been imported as classes.",
          [{ text: "OK" }]
        );
      }
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Migration Failed", error.message);
    },
  });

  const togglePublicMutation = useMutation({
    mutationFn: async ({ seriesId, isPublic }: { seriesId: string; isPublic: boolean }) => {
      const response = await apiRequest("PATCH", `/api/coach/series/${seriesId}`, { isPublic });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to update listing");
      }
      return response.json();
    },
    onSuccess: (_, { isPublic }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        isPublic ? "Listed Publicly" : "Set to Private",
        isPublic
          ? "This class is now visible in the marketplace."
          : "This class is now private and no longer listed.",
        [{ text: "OK" }]
      );
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error.message);
    },
  });

  const handleLongPress = (series: CoachingSeries) => {
    const isCurrentlyPublic = !!series.isPublic;
    Alert.alert(
      isCurrentlyPublic ? "Remove from Marketplace?" : "List on Marketplace?",
      isCurrentlyPublic
        ? `"${series.title}" will be removed from public listings.`
        : `"${series.title}" will appear in the marketplace for drop-in players.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isCurrentlyPublic ? "Make Private" : "Make Public",
          onPress: () => togglePublicMutation.mutate({ seriesId: series.id, isPublic: !isCurrentlyPublic }),
        },
      ]
    );
  };

  const searchResults = useMemo(() => {
    if (!searchText.trim() || !seriesList) return [];
    const q = searchText.toLowerCase().trim();
    return seriesList.filter(s => {
      const players = s.playerPreview || [];
      return players.some(p => p.name.toLowerCase().includes(q)) || s.title.toLowerCase().includes(q);
    });
  }, [searchText, seriesList]);

  const uniqueSports = useMemo(() => {
    if (!seriesList) return new Set<string>();
    const sports = new Set<string>();
    for (const s of seriesList) {
      sports.add(s.sport || "tennis");
    }
    return sports;
  }, [seriesList]);

  const showSportFilter = uniqueSports.size > 1;

  const filteredSeries = (seriesList?.filter(series => {
    const statusMatch = filter === "all" ? true : series.status === filter;
    const sportMatch = sportFilter === "all" ? true : (series.sport || "tennis") === sportFilter;
    return statusMatch && sportMatch;
  }) || []);

  const flexibleSeries = filteredSeries.filter(s => s.dayOfWeek === FLEXIBLE_DAY);
  const regularSeries = filteredSeries.filter(s => s.dayOfWeek !== FLEXIBLE_DAY);

  const flexibleGroupedByPlayer = useMemo(() => {
    const playerMap = new Map<string, { playerName: string; ballLevel: string | null; sport: string | null; series: CoachingSeries[] }>();
    const ungrouped: CoachingSeries[] = [];

    for (const s of flexibleSeries) {
      const players = s.playerPreview || [];
      if (players.length === 0) {
        ungrouped.push(s);
        continue;
      }
      for (const p of players) {
        const key = p.id;
        if (!playerMap.has(key)) {
          playerMap.set(key, { playerName: p.name, ballLevel: p.ballLevel || null, sport: s.sport || null, series: [] });
        }
        const existing = playerMap.get(key)!;
        if (!existing.series.find(ex => ex.id === s.id)) {
          existing.series.push(s);
        }
      }
    }

    const groups = Array.from(playerMap.values())
      .filter(g => g.series.length > 0)
      .sort((a, b) => a.playerName.localeCompare(b.playerName));

    return { groups, ungrouped };
  }, [flexibleSeries]);
  
  const groupedByDay = regularSeries.reduce((acc, series) => {
    const day = series.dayOfWeek;
    if (!acc[day]) acc[day] = [];
    acc[day].push(series);
    return acc;
  }, {} as Record<number, CoachingSeries[]>);

  const sortedDays = Object.keys(groupedByDay).map(Number).sort((a, b) => a - b);

  const toggleDay = (day: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  const statusCounts = {
    active: seriesList?.filter(s => s.status === "active").length || 0,
    paused: seriesList?.filter(s => s.status === "paused").length || 0,
    ended: seriesList?.filter(s => s.status === "ended").length || 0,
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading classes...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
        <Text style={styles.emptyTitle}>Error loading classes</Text>
        <Pressable onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const SESSION_TYPE_LABELS: Record<string, string> = {
    private: "Private",
    semi_private: "Semi-Private",
    group: "Group",
    activity: "Activity",
    physical: "Fitness",
  };

  return (
    <View style={styles.container}>
      <View style={searchStyles.searchRow}>
        <View style={searchStyles.searchInputContainer}>
          <Ionicons name="search" size={18} color={Colors.dark.textMuted} style={searchStyles.searchIcon} />
          <TextInput
            style={searchStyles.searchInput}
            placeholder="Search player or class name..."
            placeholderTextColor={Colors.dark.textMuted}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchText.length > 0 ? (
            <Pressable onPress={() => setSearchText("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Colors.dark.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {searchText.trim().length > 0 ? (
        <View style={searchStyles.resultsContainer}>
          <Text style={searchStyles.resultsTitle}>
            {searchResults.length} {searchResults.length === 1 ? "class" : "classes"} found
          </Text>
          {searchResults.map(series => {
            const typeConfig: Record<string, { color: string }> = {
              private: { color: Colors.dark.sessionPrivate },
              semi_private: { color: Colors.dark.sessionSemiPrivate },
              group: { color: Colors.dark.sessionGroup },
              activity: { color: Colors.dark.sessionActivity },
              physical: { color: Colors.dark.sessionPhysical },
            };
            const config = typeConfig[series.sessionType] || typeConfig.private;
            const isFlexible = series.dayOfWeek === -1;
            const dayName = isFlexible ? "Flexible" : DAY_NAMES[series.dayOfWeek];
            const localTime = convertUTCTimeToLocal(series.startTime, timezone);
            const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const autoTitleMatch = series.title.match(/^(.+?) - (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2}:\d{2}$/);
            const displayTitle = autoTitleMatch && !isFlexible
              ? `${autoTitleMatch[1]} - ${SHORT_DAYS[series.dayOfWeek]} ${localTime}`
              : series.title;
            const matchedPlayers = (series.playerPreview || []).filter(p => 
              p.name.toLowerCase().includes(searchText.toLowerCase().trim())
            );

            return (
              <Pressable
                key={series.id}
                style={searchStyles.resultCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setSearchText("");
                  onSeriesPress(series);
                }}
              >
                <View style={[searchStyles.resultAccent, { backgroundColor: config.color }]} />
                <View style={searchStyles.resultContent}>
                  <View style={searchStyles.resultHeader}>
                    <Text style={searchStyles.resultTitle} numberOfLines={1}>{displayTitle}</Text>
                    <View style={[searchStyles.typeBadge, { backgroundColor: config.color + "25" }]}>
                      <Text style={[searchStyles.typeText, { color: config.color }]}>
                        {SESSION_TYPE_LABELS[series.sessionType] || series.sessionType}
                      </Text>
                    </View>
                  </View>
                  <View style={searchStyles.resultMeta}>
                    <Ionicons name="time-outline" size={13} color={Colors.dark.textMuted} />
                    <Text style={searchStyles.resultMetaText}>
                      {dayName} {localTime} - {series.duration}min
                    </Text>
                  </View>
                  {matchedPlayers.length > 0 ? (
                    <View style={searchStyles.matchedPlayersRow}>
                      <Ionicons name="person" size={13} color={Colors.dark.primary} />
                      {matchedPlayers.map(p => (
                        <View key={p.id} style={searchStyles.matchedPlayerBadge}>
                          <Text style={searchStyles.matchedPlayerName}>{p.name}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
              </Pressable>
            );
          })}
          {searchResults.length === 0 ? (
            <View style={searchStyles.noResults}>
              <Ionicons name="search-outline" size={32} color={Colors.dark.textMuted} />
              <Text style={searchStyles.noResultsText}>No classes found for &quot;{searchText}&quot;</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <>

      <View style={styles.filterRow}>
        {(["active", "paused", "ended", "all"] as FilterType[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => {
              Haptics.selectionAsync();
              setFilter(f);
            }}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== "all" && statusCounts[f as keyof typeof statusCounts] > 0 && (
                ` (${statusCounts[f as keyof typeof statusCounts]})`
              )}
            </Text>
          </Pressable>
        ))}
      </View>

      {showSportFilter ? (
        <View style={styles.sportFilterRow}>
          {(["all", "tennis", "padel", "pickleball"] as SportFilter[]).map((s) => {
            const isActive = sportFilter === s;
            const sportColor = s === "all" ? Colors.dark.textMuted : getSportColor(s);
            return (
              <Pressable
                key={s}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSportFilter(s);
                }}
                style={[
                  styles.sportFilterChip,
                  isActive && { backgroundColor: `${sportColor}20`, borderColor: `${sportColor}60` },
                ]}
              >
                <Text style={[styles.sportFilterText, isActive && { color: sportColor }]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {filteredSeries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <GuidedEmptyState
            icon="layers-outline"
            title="No Series Created"
            description={filter === "all" 
              ? "Recurring training series help you organize your weekly schedule. Create one to get started!"
              : `No ${filter} classes found`}
            actionLabel="Create Series"
            onAction={() => onCreatePress()}
            compact
          />
        </View>
      ) : (
        <View style={styles.seriesListContainer}>
          {flexibleSeries.length > 0 ? (
            <View style={collapsibleStyles.container}>
              <Pressable 
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleDay(FLEXIBLE_DAY); }} 
                style={[collapsibleStyles.header, { borderColor: `${Colors.dark.cyan}30` }]}
              >
                <View style={collapsibleStyles.headerLeft}>
                  <Animated.View style={{ transform: [{ rotate: expandedDays.has(FLEXIBLE_DAY) ? '0deg' : '-90deg' }] }}>
                    <Ionicons name="chevron-down" size={20} color={Colors.dark.cyan} />
                  </Animated.View>
                  <Ionicons name="calendar-outline" size={18} color={Colors.dark.cyan} />
                  <Text style={[collapsibleStyles.dayTitle, { color: Colors.dark.cyan }]}>Flexible Schedule</Text>
                </View>
                <View style={collapsibleStyles.headerRight}>
                  <Text style={[collapsibleStyles.classCount, { color: Colors.dark.cyan }]}>{flexibleSeries.length}</Text>
                  <Text style={collapsibleStyles.classLabel}>{flexibleSeries.length === 1 ? "class" : "classes"}</Text>
                </View>
              </Pressable>

              {expandedDays.has(FLEXIBLE_DAY) ? (
                <View style={collapsibleStyles.content}>
                  {flexibleGroupedByPlayer.groups.map((group) => (
                    <View key={group.playerName} style={playerGroupStyles.playerGroup}>
                      <View style={playerGroupStyles.playerHeader}>
                        <View style={playerGroupStyles.playerAvatar}>
                          <Text style={playerGroupStyles.playerInitial}>{group.playerName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <Text style={playerGroupStyles.playerName}>{group.playerName}</Text>
                        {group.ballLevel ? (
                          <View style={[playerGroupStyles.ballBadge, { backgroundColor: getBallColor(group.ballLevel, group.sport) + "25" }]}>
                            <Text style={[playerGroupStyles.ballText, { color: getBallColor(group.ballLevel, group.sport) }]}>
                              {group.sport && group.sport !== "tennis"
                                ? formatSportSkillLevel(group.sport, group.ballLevel)
                                : group.ballLevel}
                            </Text>
                          </View>
                        ) : null}
                        <Text style={playerGroupStyles.classCount}>{group.series.length} {group.series.length === 1 ? "class" : "classes"}</Text>
                      </View>
                      {group.series.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((s) => (
                        <CoachingSeriesCard key={s.id} series={s} onPress={onSeriesPress} onLongPress={handleLongPress} />
                      ))}
                    </View>
                  ))}
                  {flexibleGroupedByPlayer.ungrouped.map((s) => (
                    <CoachingSeriesCard key={s.id} series={s} onPress={onSeriesPress} onLongPress={handleLongPress} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          
          {sortedDays.map((dayOfWeek) => (
            <CollapsibleDaySection
              key={dayOfWeek}
              dayOfWeek={dayOfWeek}
              series={groupedByDay[dayOfWeek]}
              isExpanded={expandedDays.has(dayOfWeek)}
              onToggle={() => toggleDay(dayOfWeek)}
              onSeriesPress={onSeriesPress}
              onSeriesLongPress={handleLongPress}
            />
          ))}
          
          <Pressable 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onCreatePress();
            }}
            style={styles.addMoreButton}
          >
            <Ionicons name="add-circle-outline" size={24} color={Colors.dark.primary} />
            <Text style={styles.addMoreText}>Add New Class</Text>
          </Pressable>
        </View>
      )}

        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  filterRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterChipActive: {
    backgroundColor: `${Colors.dark.primary}20`,
    borderColor: Colors.dark.primary,
  },
  filterText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  filterTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  sportFilterRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    flexWrap: "wrap",
  },
  sportFilterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sportFilterText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  emptyContent: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  createButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  createButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  createButtonText: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  migrateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: `${Colors.dark.gold}15`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.gold}40`,
  },
  migrateButtonText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "500",
  },
  retryButton: {
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  retryText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  seriesListContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  dayGroup: {
    marginBottom: Spacing.lg,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  dayTitle: {
    ...Typography.h4,
    color: Colors.dark.gold,
    flex: 1,
  },
  dayCount: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  addMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.dark.primary,
    backgroundColor: `${Colors.dark.primary}10`,
  },
  addMoreText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
});

const searchStyles = StyleSheet.create({
  searchRow: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.md,
    height: 42,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
    height: 42,
    paddingVertical: 0,
  },
  resultsContainer: {
    paddingHorizontal: Spacing.lg,
  },
  resultsTitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    overflow: "hidden",
  },
  resultAccent: {
    width: 4,
    alignSelf: "stretch",
  },
  resultContent: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: 4,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  resultTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  typeText: {
    ...Typography.caption,
    fontWeight: "600",
    fontSize: 10,
  },
  resultMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  resultMetaText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  matchedPlayersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 2,
  },
  matchedPlayerBadge: {
    backgroundColor: `${Colors.dark.primary}20`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  matchedPlayerName: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
    fontSize: 11,
  },
  noResults: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.sm,
  },
  noResultsText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
});

const playerGroupStyles = StyleSheet.create({
  playerGroup: {
    marginBottom: Spacing.lg,
  },
  playerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: `${Colors.dark.cyan}10`,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.cyan,
  },
  playerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${Colors.dark.cyan}30`,
    alignItems: "center",
    justifyContent: "center",
  },
  playerInitial: {
    ...Typography.caption,
    color: Colors.dark.cyan,
    fontWeight: "700",
    fontSize: 13,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    flex: 1,
  },
  ballBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  ballText: {
    ...Typography.caption,
    fontWeight: "600",
    fontSize: 10,
    textTransform: "capitalize",
  },
  classCount: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
});
