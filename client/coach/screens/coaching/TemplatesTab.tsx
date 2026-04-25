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

export function TemplatesTab({ insets: _insets, tabBarHeight }: TabProps) {
  const navigation = useNavigation<any>();
  const onScroll = useCoachingScroll();
  
  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/lesson-templates"],
  });

  const ballLevels = [
    { key: "blue", label: "Blue Ball", ages: "2-4 jaar", desc: "Pre-tennis foundation", color: "#3B82F6", icon: "star" },
    { key: "red", label: "Red Ball", ages: "4-8 jaar", desc: "First strokes & rallies", color: "#EF4444", icon: "tennisball" },
    { key: "orange", label: "Orange Ball", ages: "7-10 jaar", desc: "Bigger court, faster ball", color: "#F97316", icon: "tennisball" },
    { key: "green", label: "Green Ball", ages: "9-12 jaar", desc: "Full court transition", color: "#22C55E", icon: "tennisball" },
    { key: "yellow", label: "Yellow Ball", ages: "11+ jaar", desc: "Competition ready", color: "#EAB308", icon: "tennisball" },
  ];

  const getCounts = () => {
    if (!templates || !Array.isArray(templates)) return { blue: 0, red: 0, orange: 0, green: 0, yellow: 0, adult: 0 };
    const grouped: Record<string, number> = { blue: 0, red: 0, orange: 0, green: 0, yellow: 0, adult: 0 };
    templates.forEach((t: any) => {
      const level = t.ballLevel?.toLowerCase() || "adult";
      if (grouped[level] !== undefined) grouped[level]++;
    });
    return grouped;
  };

  const counts = getCounts();
  const totalTemplates = templates?.length || 0;

  if (isLoading) {
    return (
      <View style={templatesStyles.container}>
        <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
      </View>
    );
  }

  return (
    <ScrollView 
      style={templatesStyles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={templatesStyles.header}>
        <Text style={templatesStyles.title}>Lesson Templates</Text>
        <Text style={templatesStyles.subtitle}>{totalTemplates} templates across {ballLevels.length} ball levels</Text>
        
        <View style={templatesStyles.countBadges}>
          {ballLevels.map(level => (
            <View key={level.key} style={templatesStyles.countBadge}>
              <View style={[templatesStyles.countDot, { backgroundColor: level.color }]} />
              <Text style={templatesStyles.countText}>{counts[level.key as keyof typeof counts]}</Text>
              <Text style={templatesStyles.countLabel}>{level.key.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </View>

      {ballLevels.map(level => (
        <Pressable
          key={level.key}
          style={[templatesStyles.levelCard, { backgroundColor: level.color }]}
          onPress={() => navigation.navigate("LessonTemplateLibrary", { initialLevel: level.key })}
        >
          <View style={templatesStyles.levelIcon}>
            <Ionicons name={level.icon as any} size={28} color="#fff" />
          </View>
          <View style={templatesStyles.levelInfo}>
            <Text style={templatesStyles.levelTitle}>{level.label}</Text>
            <Text style={templatesStyles.levelSubtitle}>{level.ages} • {counts[level.key as keyof typeof counts]} templates</Text>
            <Text style={templatesStyles.levelDesc}>{level.desc}</Text>
          </View>
          <Ionicons name="chevron-down" size={24} color="#fff" style={{ opacity: 0.7 }} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const templatesStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { padding: Spacing.lg },
  title: { fontSize: 24, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.xs },
  subtitle: { fontSize: 14, color: Colors.dark.disabled, marginBottom: Spacing.md },
  countBadges: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  countBadge: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  countDot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.xs },
  countText: { fontSize: 14, fontWeight: "700", color: Colors.dark.text, marginRight: Spacing.xs },
  countLabel: { fontSize: 12, color: Colors.dark.disabled },
  levelCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, borderRadius: BorderRadius.lg, padding: Spacing.lg, flexDirection: "row", alignItems: "center" },
  levelIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginRight: Spacing.md },
  levelInfo: { flex: 1 },
  levelTitle: { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 2 },
  levelSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.9)", marginBottom: 2 },
  levelDesc: { fontSize: 12, color: "rgba(255,255,255,0.7)" },
});

// Level Cards Tab - Skill definitions inline
