import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { useTranslation } from "react-i18next";

interface BirthdayEntry {
  id: string;
  name: string;
  ballLevel: string | null;
  photoUrl: string | null;
  turningAge: number;
  daysAway: number;
}

interface BirthdayUpcomingData {
  today: BirthdayEntry[];
  upcoming: BirthdayEntry[];
  todayCount: number;
  upcomingCount: number;
}

export function BirthdayOverviewCard() {
  const { coach } = useCoach();
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<BirthdayUpcomingData>({
    queryKey: ["/api/coach/birthdays/upcoming"],
    enabled: !!coach?.id,
    staleTime: 1000 * 60 * 30,
  });

  if (isLoading || !data) return null;
  if (data.todayCount === 0 && data.upcomingCount === 0) return null;

  const hasToday = data.todayCount > 0;

  return (
    <View style={styles.container}>
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
                {data.todayCount + data.upcomingCount}
              </Text>
            </View>
          </View>
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

        {data.upcoming.map((player) => (
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
      </LinearGradient>
    </View>
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
});
