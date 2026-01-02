import React from "react";
import { View, Text, StyleSheet, ScrollView, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { Pressable } from "react-native";
import * as Haptics from "expo-haptics";

export default function PlayerHelpScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const handleContact = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const email = "support@glowupsports.com";
    const subject = "Player Support Request";
    const url = `mailto:${email}?subject=${encodeURIComponent(subject)}`;
    
    try {
      await Linking.openURL(url);
    } catch (error) {
    }
  };

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
        <Text style={styles.headerTitle}>Help</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Help</Text>
          <HelpItem 
            icon="book" 
            title="Getting Started" 
            description="Learn how to use the app"
          />
          <HelpItem 
            icon="calendar" 
            title="Booking Sessions" 
            description="How to book and manage your training"
          />
          <HelpItem 
            icon="stats-chart" 
            title="Understanding Progress" 
            description="Track your skill development"
          />
          <HelpItem 
            icon="trophy" 
            title="Glow Score Explained" 
            description="How your Glow Score is calculated"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Support</Text>
          <Pressable 
            style={styles.contactCard}
            onPress={handleContact}
          >
            <View style={styles.contactIcon}>
              <Ionicons name="mail" size={24} color={Colors.dark.primary} />
            </View>
            <View style={styles.contactContent}>
              <Text style={styles.contactTitle}>Email Support</Text>
              <Text style={styles.contactDesc}>support@glowupsports.com</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.aboutCard}>
            <Text style={styles.appName}>Glow Up Sports</Text>
            <Text style={styles.version}>Version 1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function HelpItem({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <Pressable style={styles.helpItem}>
      <View style={styles.helpIcon}>
        <Ionicons name={icon as any} size={20} color={Colors.dark.xpCyan} />
      </View>
      <View style={styles.helpContent}>
        <Text style={styles.helpTitle}>{title}</Text>
        <Text style={styles.helpDesc}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
    </Pressable>
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  helpItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  helpIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 212, 255, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  helpContent: {
    flex: 1,
  },
  helpTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  helpDesc: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(46, 204, 64, 0.2)",
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(46, 204, 64, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  contactContent: {
    flex: 1,
  },
  contactTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  contactDesc: {
    ...Typography.small,
    color: Colors.dark.primary,
    marginTop: 2,
  },
  aboutCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  appName: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  version: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
});
