import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, BorderRadius, FontSizes } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface NextLessonItem {
  date: string;
  startTime: string;
  endTime?: string;
  type: string;
  coachName?: string | null;
  courtName?: string | null;
  title?: string;
}

interface NextLessonCardProps {
  nextSession: NextLessonItem | null | undefined;
  onBookLesson: () => void;
  getTypeLabel: (type: string) => string;
  getTypeColor: (type: string) => string;
}

function formatDateLabel(dateStr: string, t: (k: string) => string): string {
  const sessionDate = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const sd = new Date(sessionDate);
  sd.setHours(0, 0, 0, 0);

  if (sd.getTime() === today.getTime()) return t("player.schedule.today");
  if (sd.getTime() === tomorrow.getTime()) return t("player.schedule.tomorrow");

  return sessionDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeRange(start: string, end?: string): string {
  if (!end) return start;
  return `${start} - ${end}`;
}

export default function NextLessonCard({
  nextSession,
  onBookLesson,
  getTypeLabel,
  getTypeColor,
}: NextLessonCardProps) {
  const { t } = useTranslation();

  const handleBook = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onBookLesson();
  };

  if (!nextSession) {
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={styles.wrapper}>
        <View style={[styles.card, styles.emptyCard]}>
          <View style={styles.emptyIconCircle}>
            <Feather name="calendar" size={24} color={Colors.dark.textMuted} />
          </View>
          <View style={styles.emptyTextBlock}>
            <Text style={styles.emptyTitle}>{t("player.schedule.noNextLessonTitle")}</Text>
            <Text style={styles.emptySubtitle}>{t("player.schedule.noNextLessonSubtitle")}</Text>
          </View>
          <Pressable onPress={handleBook} style={styles.bookCta}>
            <Feather name="plus" size={16} color="#0A0A0A" />
            <Text style={styles.bookCtaText}>{t("player.schedule.bookLesson")}</Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  const accent = getTypeColor(nextSession.type);
  const dateLabel = formatDateLabel(nextSession.date, t);
  const timeLabel = formatTimeRange(nextSession.startTime, nextSession.endTime);

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.wrapper}>
      <View style={[styles.card, { borderColor: accent + "55" }]}>
        <View style={[styles.accentBar, { backgroundColor: accent }]} />
        <View style={styles.headerRow}>
          <Text style={styles.label}>{t("player.schedule.nextLesson")}</Text>
          <View style={[styles.typePill, { backgroundColor: accent + "22" }]}>
            <Text style={[styles.typePillText, { color: accent }]}>
              {getTypeLabel(nextSession.type)}
            </Text>
          </View>
        </View>

        <Text style={styles.dateText}>
          {dateLabel} <Text style={styles.atSeparator}>·</Text>{" "}
          <Text style={styles.timeText}>{timeLabel}</Text>
        </Text>

        <View style={styles.detailsRow}>
          {nextSession.coachName ? (
            <View style={styles.detailItem}>
              <Feather name="user" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.detailText}>{nextSession.coachName}</Text>
            </View>
          ) : null}
          {nextSession.courtName ? (
            <View style={styles.detailItem}>
              <Feather name="map-pin" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.detailText}>{nextSession.courtName}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  label: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  typePill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  typePillText: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  dateText: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  atSeparator: {
    color: Colors.dark.textMuted,
    fontWeight: "400",
  },
  timeText: {
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  detailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  emptyTextBlock: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  emptySubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  bookCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#00E676",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
  },
  bookCtaText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: "#0A0A0A",
  },
}));
