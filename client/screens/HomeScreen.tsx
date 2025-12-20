import React, { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, Dimensions, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { SkillCategoryCard } from "@/components/SkillCategoryCard";
import { CustomHeader } from "@/components/CustomHeader";
import { ChatFooter } from "@/components/ChatFooter";
import { LevelUpModal } from "@/components/LevelUpModal";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";
import { SkillCategory } from "@/constants/playerData";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_GAP = Spacing.md;
const HORIZONTAL_PADDING = Spacing.lg;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - CARD_GAP) / 2;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { player, earnXP, updateSkill, refreshPlayer } = usePlayer();
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const headerHeight = 160 + insets.top;
  const footerHeight = 60 + insets.bottom;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshPlayer();
    setRefreshing(false);
  }, [refreshPlayer]);

  const handleSkillPress = async (skill: SkillCategory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateSkill(skill.id, 5);
    const leveledUp = await earnXP(50);
    if (leveledUp) {
      setShowLevelUp(true);
    }
  };

  const handleQuickXP = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const leveledUp = await earnXP(100);
    if (leveledUp) {
      setShowLevelUp(true);
    }
  };

  const skills = player.skills;
  const skillRows: SkillCategory[][] = [];
  for (let i = 0; i < skills.length; i += 2) {
    skillRows.push(skills.slice(i, i + 2));
  }

  const fullWidth = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;

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
        <View style={styles.listHeader}>
          <ThemedText style={styles.sectionTitle}>Glow Engine</ThemedText>
          <ThemedText style={styles.sectionSubtitle}>
            Tap a skill to practice and earn XP
          </ThemedText>
        </View>

        <View style={styles.skillsGrid}>
          {skillRows.map((row, rowIndex) => {
            const isSingleItem = row.length === 1;
            return (
              <View 
                key={rowIndex} 
                style={[
                  styles.skillRow,
                  isSingleItem && styles.singleItemRow,
                ]}
              >
                {row.map((skill) => (
                  <View 
                    key={skill.id} 
                    style={[
                      styles.cardWrapper,
                      isSingleItem && { width: fullWidth },
                    ]}
                  >
                    <SkillCategoryCard skill={skill} onPress={() => handleSkillPress(skill)} />
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        <View style={styles.listFooter}>
          <Pressable
            onPress={handleQuickXP}
            style={({ pressed }) => [styles.quickXPButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Feather name="zap" size={20} color={Colors.dark.backgroundRoot} />
            <ThemedText style={styles.quickXPText}>Quick Practice +100 XP</ThemedText>
          </Pressable>
        </View>
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
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  listHeader: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  skillsGrid: {
    gap: CARD_GAP,
  },
  skillRow: {
    flexDirection: "row",
    gap: CARD_GAP,
  },
  singleItemRow: {
    justifyContent: "center",
  },
  cardWrapper: {
    width: CARD_WIDTH,
  },
  listFooter: {
    marginTop: Spacing.lg,
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
});
