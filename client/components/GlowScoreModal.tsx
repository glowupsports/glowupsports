import React, { useState } from "react";
import { View, StyleSheet, Modal, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { LevelUpModal } from "@/components/LevelUpModal";
import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";
import { SkillCategory } from "@/constants/playerData";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface GlowScoreModalProps {
  visible: boolean;
  onClose: () => void;
}

function SkillItem({ skill, onPress }: { skill: SkillCategory; onPress: () => void }) {
  const percentage = (skill.score / skill.maxScore) * 100;
  const ringSize = 56;
  const strokeWidth = 5;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <Pressable 
      onPress={onPress}
      style={({ pressed }) => [styles.skillItem, { opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={styles.skillLeft}>
        <View style={[styles.skillIcon, { backgroundColor: `${skill.color}20` }]}>
          <Ionicons name={skill.icon as keyof typeof Ionicons.glyphMap} size={24} color={skill.color} />
        </View>
        <View style={styles.skillInfo}>
          <ThemedText style={styles.skillName}>{skill.name}</ThemedText>
          <ThemedText style={styles.skillDesc}>{skill.description}</ThemedText>
        </View>
      </View>
      <View style={styles.progressContainer}>
        <Svg width={ringSize} height={ringSize}>
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke={Colors.dark.backgroundSecondary}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke={skill.color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${ringSize / 2}, ${ringSize / 2}`}
          />
        </Svg>
        <View style={styles.scoreOverlay}>
          <ThemedText style={[styles.skillScore, { color: skill.color }]}>{skill.score}</ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

export function GlowScoreModal({ visible, onClose }: GlowScoreModalProps) {
  const insets = useSafeAreaInsets();
  const { player, earnXP, updateSkill } = usePlayer();
  const [showLevelUp, setShowLevelUp] = useState(false);

  const handleSkillPress = async (skill: SkillCategory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateSkill(skill.id, 5);
    const leveledUp = await earnXP(50);
    if (leveledUp) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowLevelUp(true);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.modalContainer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.handle} />
          
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="sunny-outline" size={28} color={Colors.dark.successNeon} />
              <View>
                <ThemedText style={styles.title}>Glow Score</ThemedText>
                <ThemedText style={styles.subtitle}>Your tennis mastery level</ThemedText>
              </View>
            </View>
            <View style={styles.totalScore}>
              <ThemedText style={styles.scoreValue}>{player.totalGlowScore}</ThemedText>
            </View>
          </View>

          <View style={styles.divider} />

          <ThemedText style={styles.sectionTitle}>Skill Categories</ThemedText>
          <ThemedText style={styles.sectionHint}>Tap a skill to practice and earn XP</ThemedText>

          <ScrollView 
            style={styles.skillsList}
            showsVerticalScrollIndicator={false}
          >
            {player.skills.map((skill) => (
              <SkillItem 
                key={skill.id} 
                skill={skill} 
                onPress={() => handleSkillPress(skill)}
              />
            ))}
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <ThemedText style={styles.closeButtonText}>Close</ThemedText>
          </Pressable>
        </View>
      </View>

      <LevelUpModal
        visible={showLevelUp}
        level={player.level}
        onClose={() => setShowLevelUp(false)}
      />
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.card,
  },
  modalContainer: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    maxHeight: "85%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderBottomWidth: 0,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Backgrounds.surface,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  totalScore: {
    backgroundColor: Backgrounds.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: Backgrounds.surface,
    marginVertical: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  sectionHint: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.5,
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  skillsList: {
    flex: 1,
  },
  skillItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  skillLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  skillIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  skillInfo: {
    flex: 1,
  },
  skillName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  skillDesc: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  progressContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  skillScore: {
    fontSize: 14,
    fontWeight: "700",
  },
  closeButton: {
    backgroundColor: Backgrounds.card,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
}));
