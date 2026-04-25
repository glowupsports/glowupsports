import React, { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import type { TabProps } from "./types";
import { useCoachingScroll } from "./CoachingScrollContext";

export function LevelCardsTab({ insets: _insets, tabBarHeight }: TabProps) {
  const navigation = useNavigation<any>();
  const onScroll = useCoachingScroll();
  const [selectedLevel, setSelectedLevel] = useState<string>("red");

  const { data: levelData = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/glow-leveling/levels", selectedLevel],
  });

  const levels = [
    { key: "red", label: "RED", color: "#EF4444" },
    { key: "orange", label: "ORANGE", color: "#F97316" },
    { key: "green", label: "GREEN", color: "#22C55E" },
    { key: "yellow", label: "YELLOW", color: "#EAB308" },
  ];

  return (
    <ScrollView
      style={levelCardsStyles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={levelCardsStyles.header}>
        <Text style={levelCardsStyles.title}>Level Cards</Text>
        <Text style={levelCardsStyles.subtitle}>Complete skill definitions and requirements for each level</Text>
      </View>

      <View style={levelCardsStyles.levelTabs}>
        {levels.map(level => (
          <Pressable
            key={level.key}
            style={[
              levelCardsStyles.levelTab,
              selectedLevel === level.key && { backgroundColor: level.color, borderColor: level.color }
            ]}
            onPress={() => setSelectedLevel(level.key)}
          >
            <Ionicons name="tennisball" size={14} color={selectedLevel === level.key ? "#fff" : level.color} />
            <Text style={[levelCardsStyles.levelTabText, selectedLevel === level.key && { color: "#fff" }]}>{level.label}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.dark.primary} style={{ marginTop: Spacing.xl }} />
      ) : levelData && levelData.length > 0 ? (
        <View style={levelCardsStyles.pillarsContainer}>
          {levelData.map((level: any, index: number) => (
            <View key={index} style={levelCardsStyles.pillarCard}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.sm }}>
                <View style={[levelCardsStyles.skillDot, { backgroundColor: levels.find(l => l.key === selectedLevel)?.color, width: 12, height: 12, borderRadius: 6 }]} />
                <Text style={levelCardsStyles.pillarName}>{level.name || "Level " + (level.sublevel || index + 1)}</Text>
              </View>
              <Text style={levelCardsStyles.pillarDesc}>{level.description || `Sublevel ${level.sublevel || index + 1} skills`}</Text>
              {level.skills?.map((skill: any, skillIndex: number) => (
                <View key={skillIndex} style={levelCardsStyles.skillRow}>
                  <View style={[levelCardsStyles.skillDot, { backgroundColor: levels.find(l => l.key === selectedLevel)?.color }]} />
                  <Text style={levelCardsStyles.skillText}>{typeof skill === 'string' ? skill : skill.name || skill.skill}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={levelCardsStyles.emptyState}>
          <Ionicons name="layers-outline" size={48} color={Colors.dark.disabled} />
          <Text style={levelCardsStyles.emptyText}>No level card data available</Text>
          <Text style={levelCardsStyles.emptySubtext}>Select a different level to view skills</Text>
        </View>
      )}
    </ScrollView>
  );
}

const levelCardsStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { padding: Spacing.lg },
  title: { fontSize: 24, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.xs },
  subtitle: { fontSize: 14, color: Colors.dark.disabled },
  levelTabs: { flexDirection: "row", paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg, gap: Spacing.sm },
  levelTab: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.dark.border, gap: Spacing.xs },
  levelTabText: { fontSize: 12, fontWeight: "600", color: Colors.dark.text },
  pillarsContainer: { paddingHorizontal: Spacing.lg },
  pillarCard: { backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.md },
  pillarName: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.xs },
  pillarDesc: { fontSize: 12, color: Colors.dark.disabled, marginBottom: Spacing.md },
  skillRow: { flexDirection: "row", alignItems: "center", paddingVertical: Spacing.xs },
  skillDot: { width: 6, height: 6, borderRadius: 3, marginRight: Spacing.sm },
  skillText: { fontSize: 14, color: Colors.dark.text },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: Spacing["2xl"] },
  emptyText: { fontSize: 16, fontWeight: "600", color: Colors.dark.text, marginTop: Spacing.md },
  emptySubtext: { fontSize: 14, color: Colors.dark.disabled, marginTop: Spacing.xs },
});

// Match Log Tab - Guide users to log matches
