import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import type { TabProps } from "./types";
import { useCoachingScroll } from "./CoachingScrollContext";

export function SessionPlanTab({ insets: _insets, tabBarHeight }: TabProps) {
  const navigation = useNavigation<any>();
  const onScroll = useCoachingScroll();

  return (
    <ScrollView
      style={sessionPlanStyles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={sessionPlanStyles.header}>
        <Text style={sessionPlanStyles.title}>Session Plans</Text>
        <Text style={sessionPlanStyles.subtitle}>Pre-built lesson structures with drill blocks</Text>
      </View>

      <View style={sessionPlanStyles.infoCard}>
        <View style={sessionPlanStyles.infoIcon}>
          <Ionicons name="clipboard" size={32} color={Colors.dark.gold} />
        </View>
        <Text style={sessionPlanStyles.infoTitle}>Plans Live in Sessions</Text>
        <Text style={sessionPlanStyles.infoText}>
          Each session can have its own session plan with drill blocks. To view or create a plan:
        </Text>
        <View style={sessionPlanStyles.stepsList}>
          <View style={sessionPlanStyles.step}>
            <Text style={sessionPlanStyles.stepNumber}>1</Text>
            <Text style={sessionPlanStyles.stepText}>Go to the Calendar tab</Text>
          </View>
          <View style={sessionPlanStyles.step}>
            <Text style={sessionPlanStyles.stepNumber}>2</Text>
            <Text style={sessionPlanStyles.stepText}>Tap on any scheduled session</Text>
          </View>
          <View style={sessionPlanStyles.step}>
            <Text style={sessionPlanStyles.stepNumber}>3</Text>
            <Text style={sessionPlanStyles.stepText}>Tap &quot;Session Plan&quot; to generate or view</Text>
          </View>
        </View>
        <Pressable
          style={sessionPlanStyles.actionButton}
          onPress={() => navigation.navigate("Calendar")}
        >
          <Ionicons name="calendar-outline" size={18} color={Colors.dark.buttonText} />
          <Text style={sessionPlanStyles.actionButtonText}>Go to Calendar</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const sessionPlanStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { padding: Spacing.lg },
  title: { fontSize: 24, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.xs },
  subtitle: { fontSize: 14, color: Colors.dark.disabled },
  infoCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: "center" },
  infoIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.dark.gold + "20", alignItems: "center", justifyContent: "center", marginBottom: Spacing.md },
  infoTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.sm },
  infoText: { fontSize: 14, color: Colors.dark.disabled, textAlign: "center", marginBottom: Spacing.lg },
  stepsList: { width: "100%", marginBottom: Spacing.lg },
  step: { flexDirection: "row", alignItems: "center", paddingVertical: Spacing.sm },
  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.dark.gold, color: Colors.dark.buttonText, textAlign: "center", lineHeight: 24, fontWeight: "700", fontSize: 12, marginRight: Spacing.md, overflow: "hidden" },
  stepText: { fontSize: 14, color: Colors.dark.text },
  actionButton: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.gold, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, marginTop: Spacing.sm, gap: Spacing.sm },
  actionButtonText: { color: Colors.dark.buttonText, fontWeight: "600", fontSize: 14 },
});

