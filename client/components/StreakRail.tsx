import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, FontSizes } from "@/constants/theme";

type StreakKind = "training" | "match";

interface StreakItem {
  kind: StreakKind;
  current: number;
  longest: number;
  lastDate: string | null;
  nextDeadline: string | null;
  completedThisWeek: boolean;
  ctaLabel: string;
  ctaScreen: string | null;
}

interface StreakResponse {
  streaks: StreakItem[];
}

const KIND_META: Record<
  StreakKind,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  training: { label: "Training", icon: "barbell", color: "#22C55E" },
  match: { label: "Match", icon: "trophy", color: "#F59E0B" },
};

function formatDeadline(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const days = Math.max(
      0,
      Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    );
    if (days === 0) return "by today";
    if (days === 1) return "by tomorrow";
    return `in ${days}d`;
  } catch {
    return "";
  }
}

function StreakChip({
  item,
  onPressCta,
}: {
  item: StreakItem;
  onPressCta: () => void;
}) {
  const meta = KIND_META[item.kind];
  const showFlame = item.current >= 3;
  const deadlineLabel = item.completedThisWeek ? "Streak safe" : `Keep alive ${formatDeadline(item.nextDeadline)}`;
  return (
    <View style={[styles.chip, { borderColor: meta.color + "40" }]}>
      <View style={styles.chipHeader}>
        <View style={[styles.iconWrap, { backgroundColor: meta.color + "22" }]}>
          <Ionicons name={meta.icon} size={16} color={meta.color} />
        </View>
        <View style={styles.chipText}>
          <Text style={styles.chipLabel}>{meta.label}</Text>
          <View style={styles.chipNumberRow}>
            <Text style={[styles.chipNumber, { color: meta.color }]}>
              {item.current}
            </Text>
            {showFlame ? (
              <Ionicons
                name="flame"
                size={14}
                color="#EF4444"
                style={styles.flame}
              />
            ) : null}
            <Text style={styles.chipUnit}>wk</Text>
          </View>
          <Text style={styles.chipBest}>Best {item.longest}</Text>
        </View>
      </View>
      <Text
        style={[
          styles.deadline,
          { color: item.completedThisWeek ? meta.color : "#EF4444" },
        ]}
        numberOfLines={1}
      >
        {deadlineLabel}
      </Text>
      {!item.completedThisWeek && item.ctaScreen ? (
        <Pressable
          onPress={onPressCta}
          style={({ pressed }) => [
            styles.cta,
            { borderColor: meta.color, opacity: pressed ? 0.7 : 1 },
          ]}
          testID={`button-streak-cta-${item.kind}`}
        >
          <Text style={[styles.ctaLabel, { color: meta.color }]}>
            {item.ctaLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function StreakRail() {
  const navigation = useNavigation<any>();
  const { data, isLoading } = useQuery<StreakResponse>({
    queryKey: ["/api/leaderboards/streak/me"],
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <View style={styles.loaderRow}>
        <ActivityIndicator size="small" color={Colors.dark.tint} />
      </View>
    );
  }

  const streaks = data?.streaks ?? [];
  if (streaks.length === 0) return null;

  const hasAny = streaks.some((s) => s.current > 0 || s.longest > 0);
  if (!hasAny) return null;

  const handleCta = (screen: string | null) => {
    if (!screen) return;
    navigation.navigate(screen);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="flame" size={14} color="#EF4444" />
        <Text style={styles.headerLabel}>YOUR STREAKS</Text>
      </View>
      <View style={styles.row}>
        {streaks.map((s) => (
          <StreakChip
            key={s.kind}
            item={s}
            onPressCta={() => handleCta(s.ctaScreen)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  headerLabel: {
    color: Colors.dark.accentText,
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  chip: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  chipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { flex: 1 },
  chipLabel: {
    color: Colors.dark.accentText,
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  chipNumberRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 2,
  },
  chipNumber: {
    fontSize: FontSizes.xl,
    fontWeight: "800",
  },
  chipUnit: {
    color: Colors.dark.text,
    fontSize: FontSizes.xs,
    fontWeight: "600",
    opacity: 0.7,
  },
  flame: {
    marginLeft: 2,
  },
  chipBest: {
    color: Colors.dark.text,
    opacity: 0.5,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  deadline: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    marginTop: 2,
  },
  cta: {
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  ctaLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  loaderRow: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
});
