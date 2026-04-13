import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface BirthdayEntry {
  id: string;
  name: string;
  ballLevel: string | null;
  photoUrl: string | null;
  turningAge: number;
  daysAway: number;
  monthLabel?: string;
  dateLabel?: string;
}

interface BirthdayUpcomingData {
  today: BirthdayEntry[];
  upcoming: BirthdayEntry[];
  todayCount: number;
  upcomingCount: number;
}

function InitialCircle({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <View style={styles.initialCircle}>
      <Text style={styles.initialText}>{initial}</Text>
    </View>
  );
}

function BirthdayFullSheet({ onClose, coachId }: { onClose: () => void; coachId: string }) {
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery<BirthdayUpcomingData>({
    queryKey: ["/api/coach/birthdays/upcoming", { days: 60 }],
    queryFn: async () => {
      const { getApiUrl, getAuthHeaders } = await import("@/lib/query-client");
      const res = await fetch(
        new URL("/api/coach/birthdays/upcoming?days=60", getApiUrl()).toString(),
        { headers: await getAuthHeaders() }
      );
      if (!res.ok) throw new Error("Failed to fetch birthdays");
      return res.json();
    },
    enabled: !!coachId,
    staleTime: 1000 * 60 * 10,
  });

  const grouped: Record<string, BirthdayEntry[]> = {};
  if (data) {
    for (const p of data.today) {
      const label = "Today";
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(p);
    }
    for (const p of data.upcoming) {
      const label = p.monthLabel || "Upcoming";
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(p);
    }
  }

  const monthKeys = Object.keys(grouped);
  const totalCount = (data?.todayCount ?? 0) + (data?.upcomingCount ?? 0);

  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheetContainer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Ionicons name="gift" size={20} color="#FF69B4" />
          <Text style={styles.sheetTitle}>Birthdays — Next 60 Days</Text>
          {totalCount > 0 ? (
            <View style={styles.sheetCountBadge}>
              <Text style={styles.sheetCountText}>{totalCount}</Text>
            </View>
          ) : null}
          <TouchableOpacity onPress={onClose} style={styles.sheetCloseBtn}>
            <Ionicons name="close" size={20} color={Colors.dark.tabIconDefault} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <Text style={styles.sheetEmptyText}>Loading...</Text>
          ) : monthKeys.length === 0 ? (
            <View style={styles.sheetEmptyState}>
              <Ionicons name="calendar-outline" size={40} color={Colors.dark.tabIconDefault} />
              <Text style={styles.sheetEmptyText}>No birthdays in the next 60 days</Text>
            </View>
          ) : (
            monthKeys.map((monthLabel) => (
              <View key={monthLabel}>
                <Text style={styles.sheetMonthLabel}>{monthLabel}</Text>
                {grouped[monthLabel].map((player) => {
                  const isToday = player.daysAway === 0;
                  return (
                    <View
                      key={player.id}
                      style={[styles.sheetPlayerRow, isToday && styles.sheetPlayerRowToday]}
                    >
                      <InitialCircle name={player.name} />
                      <View style={styles.sheetPlayerInfo}>
                        <Text style={styles.sheetPlayerName} numberOfLines={1}>
                          {player.name}
                        </Text>
                        <Text style={styles.sheetPlayerAge}>
                          Turns {player.turningAge}
                        </Text>
                      </View>
                      <View style={styles.sheetPlayerRight}>
                        {isToday ? (
                          <>
                            <Ionicons name="gift" size={14} color="#FF69B4" />
                            <Text style={[styles.sheetDaysText, { color: "#FF69B4", marginLeft: 4 }]}>Today</Text>
                          </>
                        ) : (
                          <>
                            <Text style={styles.sheetDateLabel}>{player.dateLabel}</Text>
                            <Text style={styles.sheetDaysText}>
                              {player.daysAway === 1 ? "Tomorrow" : `in ${player.daysAway}d`}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

export function BirthdayOverviewCard() {
  const { coach } = useCoach();
  const { t } = useTranslation();
  const [showFullSheet, setShowFullSheet] = useState(false);

  const { data, isLoading } = useQuery<BirthdayUpcomingData>({
    queryKey: ["/api/coach/birthdays/upcoming"],
    enabled: !!coach?.id,
    staleTime: 1000 * 60 * 30,
  });

  if (isLoading || !data) return null;
  if (data.todayCount === 0 && data.upcomingCount === 0) return null;

  const hasToday = data.todayCount > 0;
  const totalCount = data.todayCount + data.upcomingCount;

  return (
    <>
      <Pressable
        style={styles.container}
        onPress={() => setShowFullSheet(true)}
      >
        <LinearGradient
          colors={
            hasToday
              ? ["rgba(255, 105, 180, 0.15)", "rgba(255, 215, 0, 0.1)"]
              : ["rgba(255, 105, 180, 0.08)", "rgba(200, 200, 255, 0.05)"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.header}>
            <Ionicons
              name={hasToday ? "gift" : "calendar-outline"}
              size={20}
              color="#FF69B4"
              style={styles.headerIcon}
            />
            <View style={styles.titleRow}>
              <Text style={styles.title}>
                {hasToday
                  ? t("coach.dashboard.todaysBirthdays")
                  : t("coach.dashboard.upcomingBirthdays")}
              </Text>
              <View style={[styles.countBadge, !hasToday && styles.countBadgeUpcoming]}>
                <Text style={[styles.countText, !hasToday && styles.countTextUpcoming]}>
                  {totalCount}
                </Text>
              </View>
            </View>
            <Text style={styles.seeAll}>See all</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.tabIconDefault} />
          </View>

          {data.today.map((player) => (
            <View key={player.id} style={styles.playerRow}>
              <View style={styles.playerInfo}>
                <Ionicons name="star" size={14} color="#FF69B4" style={styles.rowIcon} />
                <Text style={styles.playerName}>{player.name}</Text>
              </View>
              <Text style={styles.ageText}>{t("coach.dashboard.turnsAge", { age: player.turningAge })}</Text>
            </View>
          ))}

          {data.upcoming.length > 0 && hasToday && (
            <View style={styles.divider} />
          )}

          {data.upcoming.length > 0 && hasToday && (
            <Text style={styles.upcomingLabel}>{t("coach.dashboard.comingUp")}</Text>
          )}

          {data.upcoming.slice(0, 3).map((player) => (
            <View key={player.id} style={styles.playerRow}>
              <View style={styles.playerInfo}>
                <Ionicons name="time-outline" size={14} color={Colors.dark.tabIconDefault} style={styles.rowIcon} />
                <Text style={[styles.playerName, styles.upcomingName]}>{player.name}</Text>
              </View>
              <Text style={styles.daysText}>
                {player.daysAway === 1
                  ? t("coach.dashboard.tomorrow")
                  : t("coach.dashboard.daysAway", { count: player.daysAway })}
              </Text>
            </View>
          ))}

          {data.upcomingCount > 3 && (
            <Text style={styles.moreText}>+{data.upcomingCount - 3} more — tap to see all</Text>
          )}
        </LinearGradient>
      </Pressable>

      <Modal
        visible={showFullSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFullSheet(false)}
      >
        <BirthdayFullSheet
          onClose={() => setShowFullSheet(false)}
          coachId={coach?.id || ""}
        />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  card: {
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 105, 180, 0.2)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  headerIcon: {
    marginRight: Spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  countBadge: {
    marginLeft: Spacing.sm,
    backgroundColor: "rgba(255, 105, 180, 0.3)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeUpcoming: {
    backgroundColor: "rgba(200, 200, 255, 0.2)",
  },
  countText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#FF69B4",
  },
  countTextUpcoming: {
    color: Colors.dark.tabIconDefault,
  },
  seeAll: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    marginRight: 2,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rowIcon: {
    marginRight: 8,
  },
  playerName: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: Colors.dark.text,
  },
  upcomingName: {
    color: Colors.dark.tabIconDefault,
  },
  ageText: {
    fontSize: 12,
    color: "#FF69B4",
    fontWeight: "600" as const,
  },
  daysText: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500" as const,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    marginVertical: Spacing.sm,
  },
  upcomingLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: Colors.dark.tabIconDefault,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  moreText: {
    fontSize: 12,
    color: "#FF69B4",
    marginTop: 6,
    opacity: 0.8,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheetContainer: {
    backgroundColor: "#1a1a2e",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    borderTopWidth: 1,
    borderColor: "rgba(255,105,180,0.15)",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    gap: 8,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  sheetCountBadge: {
    backgroundColor: "rgba(255,105,180,0.25)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sheetCountText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#FF69B4",
  },
  sheetCloseBtn: {
    padding: 4,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetMonthLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.dark.tabIconDefault,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 6,
  },
  sheetPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
    gap: 12,
  },
  sheetPlayerRowToday: {
    backgroundColor: "rgba(255,105,180,0.06)",
    borderRadius: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 0,
    marginBottom: 4,
  },
  initialCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,105,180,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,105,180,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  initialText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#FF69B4",
  },
  sheetPlayerInfo: {
    flex: 1,
  },
  sheetPlayerName: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  sheetPlayerAge: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    marginTop: 1,
  },
  sheetPlayerRight: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 4,
  },
  sheetDateLabel: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500" as const,
  },
  sheetDaysText: {
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
  },
  sheetEmptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  sheetEmptyText: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
});
