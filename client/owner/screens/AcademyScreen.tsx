import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

interface SectionCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress?: () => void;
}

function SectionCard({ icon, title, description, onPress }: SectionCardProps) {
  return (
    <Pressable style={[styles.sectionCard, CardStyles.elevated]} onPress={onPress}>
      <View style={styles.sectionCardIcon}>
        <Ionicons name={icon} size={24} color={Colors.dark.gold} />
      </View>
      <View style={styles.sectionCardContent}>
        <Text style={styles.sectionCardTitle}>{title}</Text>
        <Text style={styles.sectionCardDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

export default function AcademyScreen() {
  const insets = useSafeAreaInsets();

  const showComingSoon = (feature: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      window.alert(`${feature} - Coming soon! This feature is currently being developed.`);
    } else {
      Alert.alert(feature, "This feature is currently being developed. Check back soon!");
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Academy</Text>
          <Text style={styles.subtitle}>Manage your academy identity and structure</Text>
        </View>

        <View style={styles.section}>
          <SectionCard
            icon="business"
            title="Academy Profile"
            description="Name, logo, brand colors, contact info"
            onPress={() => showComingSoon("Academy Profile")}
          />
          <SectionCard
            icon="location"
            title="Courts"
            description="Manage courts, capacity, and availability"
            onPress={() => showComingSoon("Courts Management")}
          />
          <SectionCard
            icon="document-text"
            title="Rules & Policies"
            description="Attendance, cancellation, and XP rules"
            onPress={() => showComingSoon("Rules & Policies")}
          />
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  section: {
    gap: Spacing.md,
  },
  sectionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  sectionCardIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.gold}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCardContent: {
    flex: 1,
  },
  sectionCardTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  sectionCardDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
});
