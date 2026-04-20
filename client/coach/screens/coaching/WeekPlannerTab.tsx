import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { convertUTCTimeToLocal } from "@/lib/dateUtils";
import SeriesDetailDrawer from "@/coach/components/SeriesDetailDrawer";
import { SportBadge } from "@/components/SportBadge";
import { formatSportSkillLevel, getSportSkillLevelColor } from "@shared/sportConfig";
import type { TabProps } from "./types";
import { useCoachingScroll } from "./CoachingScrollContext";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getBallColor(level: string | null | undefined, sport?: string | null): string {
  if (sport && sport !== "tennis") {
    return getSportSkillLevelColor(sport, level);
  }
  switch (level?.toLowerCase()) {
    case "red": return "#FF4D4D";
    case "orange": return "#FF851B";
    case "green": return "#C8FF3D";
    case "yellow": return "#FFD700";
    case "blue": return "#4FC3F7";
    case "glow": return "#E040FB";
    default: return Colors.dark.textMuted;
  }
}

function getSessionTypeBadge(type: string | null | undefined) {
  switch (type) {
    case "group": return { label: "Group", color: Colors.dark.orange };
    case "private": return { label: "Private", color: Colors.dark.primary };
    case "semi_private": return { label: "Semi", color: Colors.dark.xpCyan };
    default: return { label: type || "Session", color: Colors.dark.textMuted };
  }
}

export function WeekPlannerTab({ insets: _insets, tabBarHeight }: TabProps) {
  const onScroll = useCoachingScroll();
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [showSeriesDetail, setShowSeriesDetail] = useState(false);
  const { academy } = useCoach();
  const timezone = academy?.timezone || "Asia/Dubai";

  const { data: allSeries, isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ["/api/coach/series"],
  });

  const todayDayIndex = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone });
    const dayName = formatter.format(new Date());
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return dayMap[dayName] ?? new Date().getDay();
  }, [timezone]);

  const dayGroups = useMemo(() => {
    if (!allSeries) return [];
    const activeSeries = allSeries.filter((s: any) => s.status === "active" && s.dayOfWeek >= 0);
    const grouped = new Map<number, any[]>();
    for (const s of activeSeries) {
      const day = s.dayOfWeek;
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day)!.push(s);
    }
    for (const [, items] of grouped) {
      items.sort((a: any, b: any) => {
        const timeA = convertUTCTimeToLocal(a.startTime || "00:00", timezone);
        const timeB = convertUTCTimeToLocal(b.startTime || "00:00", timezone);
        return timeA.localeCompare(timeB);
      });
    }
    const orderedDays = [];
    for (let i = 0; i < 7; i++) {
      const dayIndex = (todayDayIndex + i) % 7;
      if (grouped.has(dayIndex)) {
        orderedDays.push({ day: dayIndex, series: grouped.get(dayIndex)! });
      }
    }
    return orderedDays;
  }, [allSeries, todayDayIndex, timezone]);

  const totalActive = useMemo(() => {
    if (!allSeries) return 0;
    return allSeries.filter((s: any) => s.status === "active" && s.dayOfWeek >= 0).length;
  }, [allSeries]);

  const totalPlayers = useMemo(() => {
    if (!allSeries) return 0;
    const uniquePlayerIds = new Set<string>();
    allSeries.filter((s: any) => s.status === "active" && s.dayOfWeek >= 0).forEach((s: any) => {
      (s.playerPreview || []).forEach((p: any) => uniquePlayerIds.add(p.id));
    });
    return uniquePlayerIds.size;
  }, [allSeries]);

  const totalPaused = useMemo(() => {
    if (!allSeries) return 0;
    return allSeries
      .filter((s: any) => s.status === "active" && s.dayOfWeek >= 0)
      .reduce((sum: number, s: any) => sum + (s.pausedCount || 0), 0);
  }, [allSeries]);

  const handleSeriesPress = (series: any) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedSeriesId(series.id);
    setShowSeriesDetail(true);
  };

  if (isLoading) {
    return (
      <View style={wpStyles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={wpStyles.loadingText}>Loading week overview...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={wpStyles.loadingContainer}>
        <Ionicons name="cloud-offline-outline" size={48} color={Colors.dark.textMuted} />
        <Text style={wpStyles.loadingText}>Could not load classes</Text>
        <Pressable
          style={{ backgroundColor: Colors.dark.primary + "20", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 }}
          onPress={() => refetch()}
        >
          <Text style={{ color: Colors.dark.primary, fontWeight: "600" }}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={wpStyles.scrollView}
        contentContainerStyle={[
          wpStyles.scrollContent,
          { paddingBottom: tabBarHeight + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={wpStyles.summaryRow}>
          <View style={wpStyles.summaryCard}>
            <Text style={wpStyles.summaryValue}>{totalActive}</Text>
            <Text style={wpStyles.summaryLabel}>Groups</Text>
          </View>
          <View style={wpStyles.summaryCard}>
            <Text style={wpStyles.summaryValue}>{totalPlayers}</Text>
            <Text style={wpStyles.summaryLabel}>Players</Text>
          </View>
          {totalPaused > 0 ? (
            <View style={[wpStyles.summaryCard, wpStyles.summaryCardPaused]}>
              <Text style={[wpStyles.summaryValue, { color: Colors.dark.orange }]}>{totalPaused}</Text>
              <Text style={wpStyles.summaryLabel}>On Holiday</Text>
            </View>
          ) : null}
        </View>

        {dayGroups.map(({ day, series: daySeries }) => {
          const isToday = day === todayDayIndex;
          return (
            <View key={day} style={wpStyles.daySection}>
              <View style={wpStyles.dayHeader}>
                <Text style={[wpStyles.dayTitle, isToday && { color: Colors.dark.primary }]}>
                  {DAY_NAMES[day]}
                </Text>
                {isToday ? (
                  <View style={wpStyles.todayBadge}>
                    <Text style={wpStyles.todayBadgeText}>TODAY</Text>
                  </View>
                ) : null}
                <Text style={wpStyles.dayCount}>{daySeries.length} {daySeries.length === 1 ? "class" : "classes"}</Text>
              </View>

              {daySeries.map((s: any) => {
                const badge = getSessionTypeBadge(s.sessionType);
                const players = s.playerPreview || [];
                const localStart = s.startTime ? convertUTCTimeToLocal(s.startTime, timezone) : "?";
                const endTime = (() => {
                  if (!localStart || localStart === "?" || !s.duration) return "";
                  const [h, m] = localStart.split(":").map(Number);
                  const totalMin = h * 60 + m + s.duration;
                  const eh = Math.floor(totalMin / 60) % 24;
                  const em = totalMin % 60;
                  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
                })();

                const maxCapacity = s.sessionType === "private" ? 1
                  : s.sessionType === "semi_private" ? Math.min(s.maxPlayers || 2, 3)
                  : s.maxPlayers || 6;

                return (
                  <Pressable
                    key={s.id}
                    style={({ pressed }) => [wpStyles.groupCard, pressed && { opacity: 0.85 }]}
                    onPress={() => handleSeriesPress(s)}
                  >
                    <View style={wpStyles.groupCardHeader}>
                      <View style={[wpStyles.typeBadge, { backgroundColor: badge.color + "25", borderColor: badge.color + "50" }]}>
                        <Text style={[wpStyles.typeBadgeText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                      <Text style={wpStyles.groupTime}>{localStart} - {endTime}</Text>
                      <View style={wpStyles.groupCapacity}>
                        <Text style={[
                          wpStyles.capacityText,
                          s.playerCount >= maxCapacity && { color: Colors.dark.orange },
                        ]}>
                          {s.playerCount}/{maxCapacity}
                        </Text>
                        <Ionicons name="people" size={14} color={Colors.dark.textMuted} />
                      </View>
                    </View>

                    {(s.courtName || s.title || (s.sport && s.sport !== "tennis")) ? (
                      <View style={wpStyles.subtitleRow}>
                        {s.sport && s.sport !== "tennis" ? (
                          <SportBadge sport={s.sport} size="sm" showLabel={true} />
                        ) : null}
                        {s.courtName || s.title ? (
                          <Text style={wpStyles.groupSubtitle} numberOfLines={1}>
                            {s.courtName ? `${s.courtName}` : ""}{s.title ? ` \u2022 ${s.title}` : ""}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={wpStyles.playerList}>
                      {players.map((p: any) => {
                        const dotColor = getBallColor(p.ballLevel, s.sport);
                        const levelLabel = p.ballLevel
                          ? (s.sport && s.sport !== "tennis"
                            ? formatSportSkillLevel(s.sport, p.ballLevel)
                            : p.ballLevel)
                          : null;
                        return (
                          <View key={p.id} style={wpStyles.playerRow}>
                            <View style={[wpStyles.ballDot, { backgroundColor: dotColor }]} />
                            <Text style={wpStyles.playerName} numberOfLines={1}>{p.name}</Text>
                            {levelLabel ? (
                              <Text style={[wpStyles.playerBallLevel, { color: dotColor }]}>
                                {levelLabel}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                      {players.length === 0 ? (
                        <Text style={wpStyles.noPlayersText}>No active players</Text>
                      ) : null}
                    </View>

                    {s.pausedCount > 0 ? (
                      <View style={wpStyles.pausedRow}>
                        <Ionicons name="pause-circle-outline" size={14} color={Colors.dark.orange} />
                        <Text style={wpStyles.pausedText}>
                          {s.pausedCount} on holiday
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        {dayGroups.length === 0 ? (
          <View style={wpStyles.emptyContainer}>
            <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={wpStyles.emptyText}>No active classes found</Text>
          </View>
        ) : null}
      </ScrollView>

      <SeriesDetailDrawer
        visible={showSeriesDetail}
        seriesId={selectedSeriesId}
        onClose={() => {
          setShowSeriesDetail(false);
          setSelectedSeriesId(null);
        }}
      />
    </>
  );
}

const wpStyles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textMuted,
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: Spacing.md,
    alignItems: "center",
  },
  summaryCardPaused: {
    borderColor: "rgba(255,133,27,0.2)",
  },
  summaryValue: {
    color: Colors.dark.text,
    fontSize: 24,
    fontWeight: "700",
  },
  summaryLabel: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  daySection: {
    marginBottom: Spacing.xl,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  dayTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: "700",
  },
  todayBadge: {
    backgroundColor: Colors.dark.primary + "25",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  todayBadgeText: {
    color: Colors.dark.primary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  dayCount: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    marginLeft: "auto",
  },
  groupCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  groupCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  typeBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  groupTime: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  groupCapacity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  capacityText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    flexWrap: "wrap",
  },
  groupSubtitle: {
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  playerList: {
    gap: 4,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 3,
  },
  ballDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  playerName: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    flex: 1,
  },
  playerBallLevel: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  noPlayersText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontStyle: "italic",
  },
  pausedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  pausedText: {
    color: Colors.dark.orange,
    fontSize: 12,
    fontWeight: "500",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: Spacing.md,
  },
  emptyText: {
    color: Colors.dark.textMuted,
    fontSize: 16,
  },
});

