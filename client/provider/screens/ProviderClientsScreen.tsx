import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Colors, Spacing } from "@/constants/theme";

export default function ProviderClientsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Clients</Text>
      </View>
      <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.emptyState}>
        <View style={styles.iconCircle}>
          <Ionicons name="people-outline" size={40} color={Colors.dark.primary} />
        </View>
        <Text style={styles.emptyTitle}>Client Book</Text>
        <Text style={styles.emptySubtitle}>
          Your full client history, notes, and preferences are coming soon. 
          You'll be able to view every player who's booked you, add private session notes, 
          and save their service preferences.
        </Text>
        <View style={styles.featurePills}>
          {["Session history", "Private notes", "Preferences", "Booking trends"].map((f) => (
            <View key={f} style={styles.pill}>
              <Ionicons name="checkmark-circle" size={12} color={Colors.dark.primary} />
              <Text style={styles.pillText}>{f}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },
  featurePills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.dark.primary + "10",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "25",
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
});
