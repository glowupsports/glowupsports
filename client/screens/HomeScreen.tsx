import React, { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { CustomHeader } from "@/components/CustomHeader";
import { ChatFooter } from "@/components/ChatFooter";
import { LevelUpModal } from "@/components/LevelUpModal";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { player, earnXP, refreshPlayer } = usePlayer();
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const headerHeight = 160 + insets.top;
  const footerHeight = 60 + insets.bottom;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshPlayer();
    setRefreshing(false);
  }, [refreshPlayer]);

  const handleQuickXP = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const leveledUp = await earnXP(100);
    if (leveledUp) {
      setShowLevelUp(true);
    }
  };

  return (
    <View style={styles.container}>
      <CustomHeader />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.lg, paddingBottom: footerHeight + Spacing.xl },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom + footerHeight }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.dark.primary}
            progressViewOffset={headerHeight}
          />
        }
      >
        <View style={styles.welcomeSection}>
          <ThemedText style={styles.welcomeText}>Welcome back,</ThemedText>
          <ThemedText style={styles.nameText}>{player.name.split(" ")[0]}</ThemedText>
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Ionicons name="sunny-outline" size={20} color={Colors.dark.successNeon} />
          </View>
          <View style={styles.tipContent}>
            <ThemedText style={styles.tipTitle}>Tap your Glow Score above</ThemedText>
            <ThemedText style={styles.tipText}>to see all your skill categories and practice</ThemedText>
          </View>
          <Ionicons name="chevron-up-outline" size={20} color={Colors.dark.text} style={styles.tipArrow} />
        </View>

        <View style={styles.quickXPSection}>
          <Pressable
            onPress={handleQuickXP}
            style={({ pressed }) => [styles.quickXPButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="flash-outline" size={20} color={Colors.dark.backgroundRoot} />
            <ThemedText style={styles.quickXPText}>Quick Practice +100 XP</ThemedText>
          </Pressable>
        </View>

        <Card style={styles.statsCard}>
          <ThemedText style={styles.statsTitle}>Today's Progress</ThemedText>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <ThemedText style={styles.statValue}>{player.currentXP.toLocaleString()}</ThemedText>
              <ThemedText style={styles.statLabel}>XP Earned</ThemedText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <ThemedText style={styles.statValue}>{player.level}</ThemedText>
              <ThemedText style={styles.statLabel}>Level</ThemedText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <ThemedText style={[styles.statValue, { color: Colors.dark.successNeon }]}>{player.totalGlowScore}</ThemedText>
              <ThemedText style={styles.statLabel}>Glow Score</ThemedText>
            </View>
          </View>
        </Card>
      </ScrollView>

      <ChatFooter />

      <LevelUpModal
        visible={showLevelUp}
        level={player.level}
        onClose={() => setShowLevelUp(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  welcomeSection: {
    marginBottom: Spacing.lg,
  },
  welcomeText: {
    fontSize: 16,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  nameText: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.successNeon + "40",
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.successNeon + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  tipContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  tipText: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  tipArrow: {
    opacity: 0.5,
  },
  quickXPSection: {
    marginTop: Spacing.xl,
    alignItems: "center",
  },
  quickXPButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.orange,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  quickXPText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.backgroundRoot,
  },
  statsCard: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
});
