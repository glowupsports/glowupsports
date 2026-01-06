import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { Pressable } from "react-native";
import * as Haptics from "expo-haptics";

export default function GlowLeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Glow Rank</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <LinearGradient
          colors={["rgba(255, 193, 7, 0.15)", "rgba(255, 152, 0, 0.08)"]}
          style={styles.placeholderCard}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="flame" size={48} color={Colors.dark.gold} />
          </View>
          <Text style={styles.placeholderTitle}>Glow Leaderboard</Text>
          <Text style={styles.placeholderText}>
            Compete with players from your academy and beyond. Rise through the ranks and become a Glow Champion.
          </Text>
        </LinearGradient>

        <View style={styles.rankPreview}>
          <Text style={styles.sectionTitle}>Rank Categories</Text>
          <RankItem rank={1} icon="trophy" label="Academy Champion" color={Colors.dark.gold} />
          <RankItem rank={2} icon="medal" label="Regional Star" color="#C0C0C0" />
          <RankItem rank={3} icon="ribbon" label="Rising Player" color="#CD7F32" />
        </View>
      </ScrollView>
    </View>
  );
}

function RankItem({ rank, icon, label, color }: { rank: number; icon: string; label: string; color: string }) {
  return (
    <View style={styles.rankItem}>
      <View style={[styles.rankBadge, { backgroundColor: color + "20" }]}>
        <Text style={[styles.rankNumber, { color }]}>{rank}</Text>
      </View>
      <Ionicons name={icon as any} size={24} color={color} style={{ marginRight: Spacing.md }} />
      <Text style={styles.rankLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  placeholderCard: {
    marginTop: Spacing.xl,
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 193, 7, 0.2)",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 193, 7, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  placeholderTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  placeholderText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  rankPreview: {
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  rankItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: "700",
  },
  rankLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
});
