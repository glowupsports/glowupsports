import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Platform, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  criteria: string;
}

export default function BadgeDefinitionsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [badges, setBadges] = useState<Badge[]>([
    { id: "1", name: "First Steps", description: "Attend your first session", icon: "footsteps", xpReward: 100, criteria: "first_session" },
    { id: "2", name: "Week Warrior", description: "Attend 5 sessions in a week", icon: "flame", xpReward: 200, criteria: "5_sessions_week" },
    { id: "3", name: "Level Up", description: "Advance to the next ball level", icon: "arrow-up-circle", xpReward: 300, criteria: "level_advance" },
    { id: "4", name: "Perfect Attendance", description: "100% attendance for a month", icon: "checkmark-done-circle", xpReward: 500, criteria: "perfect_month" },
    { id: "5", name: "Social Butterfly", description: "Train with 10 different partners", icon: "people", xpReward: 150, criteria: "10_partners" },
    { id: "6", name: "Glow Champion", description: "Reach Glow level", icon: "star", xpReward: 1000, criteria: "glow_level" },
  ]);

  const handleDelete = (id: string) => {
    const badge = badges.find(b => b.id === id);
    const confirmDelete = () => {
      setBadges(prev => prev.filter(b => b.id !== id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Delete badge "${badge?.name}"?`);
      if (confirmed) confirmDelete();
    } else {
      Alert.alert("Delete Badge", `Delete badge "${badge?.name}"?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: confirmDelete },
      ]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Badge Definitions</Text>
        <Pressable style={styles.addButton}>
          <Ionicons name="add" size={24} color={PLATFORM_COLOR} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Manage achievement badges and their rewards</Text>

        <View style={styles.badgeGrid}>
          {badges.map((badge) => (
            <View key={badge.id} style={[styles.badgeCard, CardStyles.elevated]}>
              <Pressable 
                style={styles.deleteBtn}
                onPress={() => handleDelete(badge.id)}
              >
                <Ionicons name="close-circle" size={20} color={Colors.dark.error} />
              </Pressable>
              <View style={styles.badgeIcon}>
                <Ionicons name={badge.icon as any} size={28} color={Colors.dark.gold} />
              </View>
              <Text style={styles.badgeName}>{badge.name}</Text>
              <Text style={styles.badgeDescription}>{badge.description}</Text>
              <View style={styles.badgeReward}>
                <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
                <Text style={styles.rewardText}>+{badge.xpReward} XP</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  topBarTitle: {
    ...Typography.h2,
    color: PLATFORM_COLOR,
    flex: 1,
    textAlign: "center",
  },
  addButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: `${PLATFORM_COLOR}20`,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  badgeCard: {
    width: "47%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
  },
  deleteBtn: {
    position: "absolute",
    top: Spacing.xs,
    right: Spacing.xs,
    zIndex: 1,
  },
  badgeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${Colors.dark.gold}20`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  badgeName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    textAlign: "center",
  },
  badgeDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  badgeReward: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    backgroundColor: `${Colors.dark.xpCyan}20`,
    borderRadius: BorderRadius.full,
  },
  rewardText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
});
