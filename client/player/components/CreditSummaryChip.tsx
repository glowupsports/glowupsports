import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, FontSizes, Backgrounds } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface CreditSummaryChipProps {
  credits: {
    total: number;
    group: number;
    private: number;
    semi_private: number;
  } | undefined;
  /**
   * Called when the user taps the chip to view their credits.
   * Navigation target (PlayerProfile vs ParentCreditStore) is determined
   * by the parent screen based on family context.
   */
  onViewPress: () => void;
  /**
   * Called when the user taps the chip to buy/top-up credits.
   * Routing is again determined by the parent — ParentCreditStore for
   * family users, PlayerProfile for regular players.
   */
  onBuyPress: () => void;
}

type Status = "ok" | "low" | "empty";

function getStatus(total: number): Status {
  if (total <= 0) return "empty";
  if (total < 2) return "low";
  return "ok";
}

const STATUS_COLORS: Record<Status, string> = {
  ok: "#00E676",
  low: "#FFC107",
  empty: "#FF4D4D",
};

export function CreditSummaryChip({ credits, onViewPress, onBuyPress }: CreditSummaryChipProps) {
  if (!credits) return null;

  const total = credits.total ?? (credits.group + credits.private + credits.semi_private);
  const status = getStatus(total);
  const color = STATUS_COLORS[status];

  const typeParts: string[] = [];
  if (credits.private > 0) typeParts.push(`${credits.private} private`);
  if (credits.semi_private > 0) typeParts.push(`${credits.semi_private} semi`);
  if (credits.group > 0) typeParts.push(`${credits.group} group`);

  const hasBreakdown = typeParts.length > 1;

  // The whole chip is a single Pressable — no nested Pressables.
  // When credits are ok the action is "view"; when low/empty the action is
  // "buy/top-up". The CTA badge is purely visual (a styled View, not a button).
  const handlePress = () => {
    Haptics.impactAsync(
      status === "ok"
        ? Haptics.ImpactFeedbackStyle.Light
        : Haptics.ImpactFeedbackStyle.Medium,
    );
    if (status === "ok") {
      onViewPress();
    } else {
      onBuyPress();
    }
  };

  const ctaLabel = status === "empty" ? "Buy credits" : status === "low" ? "Top up" : null;

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(80)}>
      <Pressable
        style={({ pressed }) => [styles.chip, { borderColor: color + "44", opacity: pressed ? 0.75 : 1 }]}
        onPress={handlePress}
        accessibilityLabel={
          status === "ok"
            ? `${total} credits — tap to view`
            : `${total} credits — tap to ${status === "empty" ? "buy more" : "top up"}`
        }
        accessibilityRole="button"
      >
        <View style={[styles.dot, { backgroundColor: color }]} />

        <View style={styles.textBlock}>
          <Text style={[styles.totalText, { color }]}>
            {total}
            <Text style={styles.unitText}> {total === 1 ? "credit" : "credits"}</Text>
          </Text>
          {hasBreakdown ? (
            <Text style={styles.breakdownText} numberOfLines={1}>
              {typeParts.join(" · ")}
            </Text>
          ) : null}
        </View>

        {ctaLabel !== null ? (
          <View style={[styles.ctaBadge, { backgroundColor: color }]}>
            <Feather name="plus" size={11} color="#0A0A0A" />
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </View>
        ) : (
          <Feather name="chevron-right" size={14} color={Colors.dark.textMuted} />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  textBlock: {
    flex: 1,
  },
  totalText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    lineHeight: 18,
  },
  unitText: {
    fontSize: FontSizes.xs,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  breakdownText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  ctaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  ctaText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0A0A0A",
  },
}));
