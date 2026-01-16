import React from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { CurrencyDisplay } from "@/components/CurrencyDisplay";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, Backgrounds, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";

interface Transaction {
  id: string;
  type: "purchase" | "reward" | "lesson";
  description: string;
  diamonds?: number;
  coins?: number;
  date: string;
}

const TRANSACTIONS: Transaction[] = [
  { id: "1", type: "reward", description: "Quest Completed: Practice Forehand", coins: 50, date: "Today" },
  { id: "2", type: "lesson", description: "Lesson: Backhand Slice", diamonds: -10, date: "Yesterday" },
  { id: "3", type: "purchase", description: "Purchased Coin Pack", coins: 1000, date: "Dec 18" },
  { id: "4", type: "reward", description: "Level Up Bonus", diamonds: 25, coins: 100, date: "Dec 17" },
  { id: "5", type: "lesson", description: "Lesson: Court Positioning", diamonds: -10, date: "Dec 15" },
];

const CURRENCY_PACKS = [
  { id: "coins-1", coins: 500, price: "$0.99" },
  { id: "coins-2", coins: 1500, price: "$2.99" },
  { id: "diamonds-1", diamonds: 50, price: "$4.99" },
  { id: "diamonds-2", diamonds: 150, price: "$9.99" },
];

export default function PaymentsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { player } = usePlayer();

  const getTypeIcon = (type: Transaction["type"]): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case "purchase": return "cart-outline";
      case "reward": return "gift-outline";
      case "lesson": return "book-outline";
    }
  };

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <View style={styles.transactionRow}>
      <View style={styles.transactionIcon}>
        <Ionicons name={getTypeIcon(item.type)} size={18} color={Colors.dark.text} />
      </View>
      <View style={styles.transactionInfo}>
        <ThemedText style={styles.transactionDesc} numberOfLines={1}>{item.description}</ThemedText>
        <ThemedText style={styles.transactionDate}>{item.date}</ThemedText>
      </View>
      <View style={styles.transactionAmount}>
        {item.diamonds ? (
          <View style={styles.amountRow}>
            <Ionicons name="diamond-outline" size={14} color={item.diamonds > 0 ? Colors.dark.successNeon : Colors.dark.error} />
            <ThemedText style={[styles.amountText, { color: item.diamonds > 0 ? Colors.dark.successNeon : Colors.dark.error }]}>
              {item.diamonds > 0 ? `+${item.diamonds}` : item.diamonds}
            </ThemedText>
          </View>
        ) : null}
        {item.coins ? (
          <View style={styles.amountRow}>
            <Ionicons name="ellipse-outline" size={14} color={item.coins > 0 ? Colors.dark.successNeon : Colors.dark.error} />
            <ThemedText style={[styles.amountText, { color: item.coins > 0 ? Colors.dark.successNeon : Colors.dark.error }]}>
              {item.coins > 0 ? `+${item.coins}` : item.coins}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <FlatList
      data={TRANSACTIONS}
      keyExtractor={(item) => item.id}
      renderItem={renderTransaction}
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      ListHeaderComponent={
        <View>
          <Card style={styles.balanceCard}>
            <ThemedText style={styles.balanceLabel}>Your Balance</ThemedText>
            <CurrencyDisplay diamonds={player.diamonds} coins={player.coins} />
          </Card>

          <ThemedText style={styles.sectionTitle}>Get More Currency</ThemedText>
          <View style={styles.packsGrid}>
            {CURRENCY_PACKS.map((pack) => (
              <Pressable key={pack.id} style={styles.packCard}>
                <View style={styles.packContent}>
                  {pack.diamonds ? (
                    <>
                      <Ionicons name="diamond-outline" size={24} color={Colors.dark.diamondSilver} />
                      <ThemedText style={styles.packAmount}>{pack.diamonds}</ThemedText>
                    </>
                  ) : (
                    <>
                      <Ionicons name="ellipse-outline" size={24} color={Colors.dark.bronzeCoin} />
                      <ThemedText style={styles.packAmount}>{pack.coins}</ThemedText>
                    </>
                  )}
                </View>
                <ThemedText style={styles.packPrice}>{pack.price}</ThemedText>
              </Pressable>
            ))}
          </View>

          <ThemedText style={styles.sectionTitle}>Transaction History</ThemedText>
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  balanceCard: {
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  balanceLabel: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  packsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  packCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    alignItems: "center",
  },
  packContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  packAmount: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  packPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  transactionInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  transactionDesc: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  transactionDate: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.5,
    marginTop: 2,
  },
  transactionAmount: {
    alignItems: "flex-end",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  amountText: {
    fontSize: 14,
    fontWeight: "600",
  },
  separator: {
    height: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
});
