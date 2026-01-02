import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { Pressable } from "react-native";
import * as Haptics from "expo-haptics";

export default function PlayerMessagesScreen() {
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
        <Text style={styles.headerTitle}>Messages</Text>
        <Pressable style={styles.composeButton}>
          <Ionicons name="create-outline" size={22} color={Colors.dark.primary} />
        </Pressable>
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <LinearGradient
          colors={["rgba(46, 204, 64, 0.1)", "rgba(46, 204, 64, 0.03)"]}
          style={styles.placeholderCard}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="chatbubbles" size={48} color={Colors.dark.primary} />
          </View>
          <Text style={styles.placeholderTitle}>Messages</Text>
          <Text style={styles.placeholderText}>
            Connect with your coaches, training partners, and academy staff. All your conversations in one place.
          </Text>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>Coming Soon</Text>
          </View>
        </LinearGradient>

        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Messages Yet</Text>
          <Text style={styles.emptyText}>
            Your conversations with coaches and players will appear here.
          </Text>
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
  composeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  placeholderCard: {
    marginTop: Spacing.xl,
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  placeholderTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  placeholderText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  comingSoonBadge: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  comingSoonText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  emptyState: {
    marginTop: Spacing.xl,
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
});
