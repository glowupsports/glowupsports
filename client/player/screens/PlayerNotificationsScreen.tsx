import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, Backgrounds, GlowColors } from "@/constants/theme";
import { Pressable } from "react-native";
import * as Haptics from "expo-haptics";

export default function PlayerNotificationsScreen() {
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
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <View style={styles.emptyState}>
          <View style={styles.iconContainer}>
            <Ionicons name="notifications-outline" size={48} color={Colors.dark.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Notifications</Text>
          <Text style={styles.emptyText}>
            You're all caught up! New session reminders, feedback alerts, and level-up celebrations will appear here.
          </Text>
        </View>

        <View style={styles.notificationTypes}>
          <Text style={styles.sectionTitle}>Notification Types</Text>
          <NotificationTypeItem 
            icon="calendar" 
            label="Session Reminders" 
            color={Colors.dark.primary}
          />
          <NotificationTypeItem 
            icon="star" 
            label="Feedback Received" 
            color={Colors.dark.gold}
          />
          <NotificationTypeItem 
            icon="trending-up" 
            label="Level Up Alerts" 
            color={Colors.dark.xpCyan}
          />
          <NotificationTypeItem 
            icon="trophy" 
            label="Achievements" 
            color="#FF6B6B"
          />
        </View>
      </ScrollView>
    </View>
  );
}

function NotificationTypeItem({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <View style={styles.typeItem}>
      <View style={[styles.typeIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.typeLabel}>{label}</Text>
      <Ionicons name="checkmark-circle" size={20} color={GlowColors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
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
  emptyState: {
    marginTop: Spacing["2xl"],
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  notificationTypes: {
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  typeItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  typeLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
});
