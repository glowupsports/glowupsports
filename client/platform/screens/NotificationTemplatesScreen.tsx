import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

interface NotificationTemplate {
  id: string;
  name: string;
  type: "email" | "push";
  subject: string;
  enabled: boolean;
}

export default function NotificationTemplatesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [templates] = useState<NotificationTemplate[]>([
    { id: "1", name: "Welcome Email", type: "email", subject: "Welcome to {academy_name}!", enabled: true },
    { id: "2", name: "Session Reminder", type: "push", subject: "Session in 1 hour", enabled: true },
    { id: "3", name: "Level Up", type: "push", subject: "Congratulations! You leveled up!", enabled: true },
    { id: "4", name: "Feedback Available", type: "push", subject: "New feedback from your coach", enabled: true },
    { id: "5", name: "Payment Receipt", type: "email", subject: "Payment Confirmation", enabled: true },
    { id: "6", name: "Session Cancelled", type: "push", subject: "Session Cancelled", enabled: true },
    { id: "7", name: "Weekly Progress", type: "email", subject: "Your Weekly Progress Report", enabled: false },
    { id: "8", name: "Badge Earned", type: "push", subject: "You earned a new badge!", enabled: true },
  ]);

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const handleEditTemplate = (id: string) => {
    setSelectedTemplate(id);
    const template = templates.find(t => t.id === id);
    if (Platform.OS === "web") {
      window.alert(`Edit template: ${template?.name}\n\nTemplate editor would open here.`);
    } else {
      Alert.alert("Edit Template", `Template editor for "${template?.name}" would open here.`);
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
        <Text style={styles.topBarTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Manage email and push notification templates</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Email Templates</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            {templates.filter(t => t.type === "email").map((template) => (
              <Pressable 
                key={template.id} 
                style={styles.row}
                onPress={() => handleEditTemplate(template.id)}
              >
                <View style={[styles.rowIcon, { backgroundColor: `${Colors.dark.xpCyan}20` }]}>
                  <Ionicons name="mail" size={20} color={Colors.dark.xpCyan} />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowLabel}>{template.name}</Text>
                  <Text style={styles.rowDescription}>{template.subject}</Text>
                </View>
                <View style={[styles.statusBadge, !template.enabled && styles.statusBadgeDisabled]}>
                  <Text style={[styles.statusText, !template.enabled && styles.statusTextDisabled]}>
                    {template.enabled ? "Active" : "Disabled"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Push Notification Templates</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            {templates.filter(t => t.type === "push").map((template) => (
              <Pressable 
                key={template.id} 
                style={styles.row}
                onPress={() => handleEditTemplate(template.id)}
              >
                <View style={[styles.rowIcon, { backgroundColor: `${PLATFORM_COLOR}20` }]}>
                  <Ionicons name="notifications" size={20} color={PLATFORM_COLOR} />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowLabel}>{template.name}</Text>
                  <Text style={styles.rowDescription}>{template.subject}</Text>
                </View>
                <View style={[styles.statusBadge, !template.enabled && styles.statusBadgeDisabled]}>
                  <Text style={[styles.statusText, !template.enabled && styles.statusTextDisabled]}>
                    {template.enabled ? "Active" : "Disabled"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
              </Pressable>
            ))}
          </View>
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
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  rowInfo: {
    flex: 1,
  },
  rowLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  rowDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: `${Colors.dark.primary}20`,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  statusBadgeDisabled: {
    backgroundColor: `${Colors.dark.textMuted}20`,
  },
  statusText: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  statusTextDisabled: {
    color: Colors.dark.textMuted,
  },
});
