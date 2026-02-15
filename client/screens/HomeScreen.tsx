import React, { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, ImageBackground } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/ThemedText";
import { CustomHeader } from "@/components/CustomHeader";
import { ChatFooter } from "@/components/ChatFooter";
import { LevelUpModal } from "@/components/LevelUpModal";
import { Card } from "@/components/Card";
import { Colors, Spacing, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";

const tennisCourtBg = require("../../assets/images/tennis-court-bg.png");

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { player, refreshPlayer } = usePlayer();
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const headerHeight = 160 + insets.top;
  const footerHeight = 60 + insets.bottom;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshPlayer();
    setRefreshing(false);
  }, [refreshPlayer]);

  return (
    <ImageBackground
      source={tennisCourtBg}
      style={styles.fullScreenBackground}
      resizeMode="contain"
      imageStyle={styles.backgroundImageStyle}
    >
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fullScreenBackground: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  backgroundImageStyle: {
    bottom: 0,
  },
  container: {
    flex: 1,
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
