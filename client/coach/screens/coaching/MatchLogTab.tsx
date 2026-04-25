import React, { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type { TabProps } from "./types";
import { useCoachingScroll } from "./CoachingScrollContext";

export function MatchLogTab({ insets: _insets, tabBarHeight }: TabProps) {
  const navigation = useNavigation<any>();
  const onScroll = useCoachingScroll();

  return (
    <ScrollView
      style={matchLogStyles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={matchLogStyles.header}>
        <Text style={matchLogStyles.title}>Match Logs</Text>
        <Text style={matchLogStyles.subtitle}>Track player match results and performance</Text>
      </View>

      <View style={matchLogStyles.infoCard}>
        <View style={matchLogStyles.infoIcon}>
          <Ionicons name="tennisball" size={32} color={Colors.dark.orange} />
        </View>
        <Text style={matchLogStyles.infoTitle}>Log Matches by Player</Text>
        <Text style={matchLogStyles.infoText}>
          Match logs are organized per player. To log a new match or view match history:
        </Text>
        <View style={matchLogStyles.stepsList}>
          <View style={matchLogStyles.step}>
            <Text style={matchLogStyles.stepNumber}>1</Text>
            <Text style={matchLogStyles.stepText}>Go to the Players tab</Text>
          </View>
          <View style={matchLogStyles.step}>
            <Text style={matchLogStyles.stepNumber}>2</Text>
            <Text style={matchLogStyles.stepText}>Select a player</Text>
          </View>
          <View style={matchLogStyles.step}>
            <Text style={matchLogStyles.stepNumber}>3</Text>
            <Text style={matchLogStyles.stepText}>Tap &quot;Log Match&quot; to record results</Text>
          </View>
        </View>
        <Pressable
          style={matchLogStyles.actionButton}
          onPress={() => navigation.navigate("Players")}
        >
          <Ionicons name="people-outline" size={18} color="#fff" />
          <Text style={matchLogStyles.actionButtonText}>Go to Players</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const matchLogStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { padding: Spacing.lg },
  title: { fontSize: 24, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.xs },
  subtitle: { fontSize: 14, color: Colors.dark.disabled },
  infoCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: "center" },
  infoIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.dark.orange + "20", alignItems: "center", justifyContent: "center", marginBottom: Spacing.md },
  infoTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.sm },
  infoText: { fontSize: 14, color: Colors.dark.disabled, textAlign: "center", marginBottom: Spacing.lg },
  stepsList: { width: "100%", marginBottom: Spacing.lg },
  step: { flexDirection: "row", alignItems: "center", paddingVertical: Spacing.sm },
  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.dark.orange, color: "#fff", textAlign: "center", lineHeight: 24, fontWeight: "700", fontSize: 12, marginRight: Spacing.md, overflow: "hidden" },
  stepText: { fontSize: 14, color: Colors.dark.text },
  actionButton: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.orange, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, marginTop: Spacing.sm, gap: Spacing.sm },
  actionButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});

// Session Plan Tab - Guide users to session plans
