import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { Pressable } from "react-native";
import * as Haptics from "expo-haptics";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface HelpGuide {
  id: string;
  icon: string;
  title: string;
  description: string;
  content: string[];
}

const helpGuides: HelpGuide[] = [
  {
    id: "getting-started",
    icon: "book",
    title: "Getting Started",
    description: "Learn how to use the app",
    content: [
      "Welcome to Glow Up Sports! This app helps you track your tennis journey.",
      "Your Home screen shows your current Glow Score, upcoming sessions, and recent achievements.",
      "Use the Journey tab to see your complete skill development timeline.",
      "The Progress tab displays detailed skill breakdowns across all areas.",
      "Check the Schedule tab to view and book upcoming training sessions.",
    ],
  },
  {
    id: "booking",
    icon: "calendar",
    title: "Booking Sessions",
    description: "How to book and manage your training",
    content: [
      "Go to Schedule tab to see your calendar with available sessions.",
      "Tap any date to view available time slots and court availability.",
      "Select a slot and confirm your booking. Some courts may require approval.",
      "You'll receive notifications when sessions are confirmed or if there are changes.",
      "To cancel, tap on a booked session and select 'Cancel Booking' (subject to cancellation policy).",
    ],
  },
  {
    id: "progress",
    icon: "stats-chart",
    title: "Understanding Progress",
    description: "Track your skill development",
    content: [
      "Your skills are tracked across 5 domains: Technical, Mental, Physical, Social, and Tactical.",
      "Each domain has specific skills rated from Level 1-10.",
      "Your coach provides feedback after sessions that updates your skill levels.",
      "The radar chart on the Progress tab gives you an overview of all your skills.",
      "Regular training helps you level up and earn XP towards your next Glow Level.",
    ],
  },
  {
    id: "glow-score",
    icon: "trophy",
    title: "Glow Score Explained",
    description: "How your Glow Score is calculated",
    content: [
      "Glow Score is a unique measure of your overall tennis development (0-100).",
      "It combines your skill levels, consistency, improvement rate, and session attendance.",
      "Earn XP from training sessions, skill improvements, and completing milestones.",
      "Level up to unlock new badges and compete on the academy leaderboard.",
      "Higher Glow Scores unlock advanced training opportunities and special events.",
    ],
  },
  {
    id: "payments",
    icon: "card",
    title: "Payments & Billing",
    description: "Managing your training costs",
    content: [
      "View your billing in the Parent Dashboard accessible from your Profile.",
      "See detailed breakdown of sessions (paid, unpaid) and any packages you own.",
      "Payments are processed through your academy's preferred payment method.",
      "Session credits from packages are automatically applied to bookings.",
      "Contact your academy for questions about specific charges or refunds.",
    ],
  },
];

export default function PlayerHelpScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const toggleExpand = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedId(expandedId === id ? null : id);
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
          <Text style={styles.sectionTitle}>Quick Guides</Text>
          {helpGuides.map((guide) => (
            <ExpandableHelpItem
              key={guide.id}
              guide={guide}
              isExpanded={expandedId === guide.id}
              onToggle={() => toggleExpand(guide.id)}
            />
          ))}
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
          <Text style={styles.sectionTitle}>Report an Issue</Text>
          <Pressable 
            style={styles.contactCard}
            onPress={() => (navigation as any).navigate("ReportIssue")}
          >
            <View style={[styles.contactIcon, { backgroundColor: Colors.dark.accentWarning + "20" }]}>
              <Ionicons name="bug" size={24} color={Colors.dark.accentWarning} />
            </View>
            <View style={styles.contactContent}>
              <Text style={styles.contactTitle}>Report a Bug</Text>
              <Text style={styles.contactDesc}>Let us know if something isn't working</Text>
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

function ExpandableHelpItem({ 
  guide, 
  isExpanded, 
  onToggle 
}: { 
  guide: HelpGuide; 
  isExpanded: boolean; 
  onToggle: () => void;
}) {
  return (
    <View style={styles.helpItemContainer}>
      <Pressable style={styles.helpItem} onPress={onToggle}>
        <View style={styles.helpIcon}>
          <Ionicons name={guide.icon as any} size={20} color={Colors.dark.primary} />
        </View>
        <View style={styles.helpContent}>
          <Text style={styles.helpTitle}>{guide.title}</Text>
          <Text style={styles.helpDesc}>{guide.description}</Text>
        </View>
        <Ionicons 
          name={isExpanded ? "chevron-down" : "chevron-forward"} 
          size={18} 
          color={Colors.dark.textMuted} 
        />
      </Pressable>
      {isExpanded ? (
        <View style={styles.expandedContent}>
          {guide.content.map((item, index) => (
            <View key={index} style={styles.contentItem}>
              <View style={styles.bulletPoint} />
              <Text style={styles.contentText}>{item}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
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
    borderBottomColor: Colors.dark.chipBackground,
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
  helpItemContainer: {
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  helpItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
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
    fontWeight: "600",
    color: Colors.dark.text,
  },
  helpDesc: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  expandedContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    paddingTop: 0,
    marginTop: -Spacing.xs,
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  contentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.xs,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
    marginTop: 6,
    marginRight: Spacing.sm,
  },
  contentText: {
    flex: 1,
    ...Typography.small,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0, 212, 255, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  contactContent: {
    flex: 1,
  },
  contactTitle: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  contactDesc: {
    ...Typography.small,
    color: Colors.dark.textMuted,
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
    marginTop: Spacing.xs,
  },
}));
