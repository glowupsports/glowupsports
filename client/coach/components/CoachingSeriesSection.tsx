import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Alert,
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
import { NeoLoadoutPanel, NeoGlowBadge } from "@/components/NeoLoadoutPanel";
import { apiRequest } from "@/lib/query-client";

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
}

interface Props {
  onSeriesPress: (series: CoachingSeries) => void;
  onCreatePress: () => void;
}

type FilterType = "all" | "active" | "paused" | "ended";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface CollapsibleDaySectionProps {
  dayOfWeek: number;
  series: CoachingSeries[];
  isExpanded: boolean;
  onToggle: () => void;
  onSeriesPress: (series: CoachingSeries) => void;
}

function CollapsibleDaySection({ 
  dayOfWeek, 
  series, 
  isExpanded, 
  onToggle, 
  onSeriesPress 
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

  return (
    <View style={collapsibleStyles.container}>
      <Pressable onPress={handlePress} style={collapsibleStyles.header}>
        <View style={collapsibleStyles.headerLeft}>
          <Animated.View style={arrowStyle}>
            <Ionicons name="chevron-down" size={20} color={Colors.dark.gold} />
          </Animated.View>
          <Text style={collapsibleStyles.dayTitle}>{DAY_NAMES[dayOfWeek]}</Text>
        </View>
        <View style={collapsibleStyles.headerRight}>
          <Text style={collapsibleStyles.classCount}>{series.length}</Text>
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
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));
  const queryClient = useQueryClient();

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

  const filteredSeries = seriesList?.filter(series => {
    if (filter === "all") return true;
    return series.status === filter;
  }) || [];

  const groupedByDay = filteredSeries.reduce((acc, series) => {
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

  return (
    <View style={styles.container}>
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

      {filteredSeries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <NeoLoadoutPanel variant="card" accentColor={Colors.dark.primary} tone="calm">
            <View style={styles.emptyContent}>
              <NeoGlowBadge accentColor={Colors.dark.primary}>
                <Ionicons name="layers-outline" size={24} color={Colors.dark.primary} />
              </NeoGlowBadge>
              <Text style={styles.emptyTitle}>No Classes</Text>
              <Text style={styles.emptySubtitle}>
                {filter === "all" 
                  ? "Create your first recurring class to get started"
                  : `No ${filter} classes found`}
              </Text>
              <Pressable 
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onCreatePress();
                }}
                style={styles.createButton}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.primaryGlow]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.createButtonGradient}
                >
                  <Ionicons name="add" size={20} color={Colors.dark.buttonText} />
                  <Text style={styles.createButtonText}>Create Class</Text>
                </LinearGradient>
              </Pressable>
              <Pressable 
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Alert.alert(
                    "Import Recurring Sessions",
                    "This will convert your existing recurring sessions into classes. Sessions will be grouped by their recurring pattern.",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Migrate", onPress: () => migrateMutation.mutate() },
                    ]
                  );
                }}
                disabled={migrateMutation.isPending}
                style={styles.migrateButton}
              >
                {migrateMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.gold} />
                ) : (
                  <>
                    <Ionicons name="sync-outline" size={16} color={Colors.dark.gold} />
                    <Text style={styles.migrateButtonText}>Import Recurring Sessions</Text>
                  </>
                )}
              </Pressable>
            </View>
          </NeoLoadoutPanel>
        </View>
      ) : (
        <View style={styles.seriesListContainer}>
          {sortedDays.map((dayOfWeek) => (
            <CollapsibleDaySection
              key={dayOfWeek}
              dayOfWeek={dayOfWeek}
              series={groupedByDay[dayOfWeek]}
              isExpanded={expandedDays.has(dayOfWeek)}
              onToggle={() => toggleDay(dayOfWeek)}
              onSeriesPress={onSeriesPress}
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
