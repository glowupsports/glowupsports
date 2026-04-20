import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface CurrencyDisplayProps {
  diamonds: number;
  coins: number;
  compact?: boolean;
}

export function CurrencyDisplay({ diamonds, coins, compact = false }: CurrencyDisplayProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  return (
    <View style={styles.container}>
      <View style={[styles.currencyItem, !compact && styles.currencyItemPadded]}>
        <Ionicons name="diamond-outline" size={compact ? 16 : 18} color={Colors.dark.diamondSilver} />
        <ThemedText style={[styles.value, compact && styles.valueCompact]}>
          {formatNumber(diamonds)}
        </ThemedText>
      </View>
      <View style={[styles.currencyItem, !compact && styles.currencyItemPadded]}>
        <Ionicons name="ellipse-outline" size={compact ? 16 : 18} color={Colors.dark.bronzeCoin} />
        <ThemedText style={[styles.value, compact && styles.valueCompact]}>
          {formatNumber(coins)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  currencyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  currencyItemPadded: {
    backgroundColor: "rgba(45, 45, 45, 0.8)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  value: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  valueCompact: {
    fontSize: 12,
  },
}));
