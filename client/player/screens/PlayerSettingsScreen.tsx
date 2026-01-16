import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, CardStyles, Backgrounds, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";

interface SettingItem {
  id: string;
  icon: string;
  label: string;
  type: "toggle" | "link" | "action";
  value?: boolean;
  onPress?: () => void;
}

export default function PlayerSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { logout } = useAuth();

  const [notifications, setNotifications] = useState(true);
  const [sessionReminders, setSessionReminders] = useState(true);
  const [progressUpdates, setProgressUpdates] = useState(true);
  const [coachMessages, setCoachMessages] = useState(true);
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testFeedbackLoading, setTestFeedbackLoading] = useState(false);
  const [messageLanguage, setMessageLanguage] = useState<"player" | "coach" | "parent">("player");

  const handleTestPushNotification = async () => {
    setTestPushLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const response = await apiRequest("POST", "/api/push/test", {});
      const data = response as unknown as { success: boolean; devicesNotified: number };
      const message = `Test notification sent to ${data.devicesNotified} device(s). Check your phone!`;
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Success", message);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Failed to send test notification";
      if (Platform.OS === "web") {
        window.alert(errMsg);
      } else {
        Alert.alert("Error", errMsg);
      }
    } finally {
      setTestPushLoading(false);
    }
  };

  const handleTestFeedback = async () => {
    setTestFeedbackLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const response = await apiRequest("POST", "/api/player/test/feedback", {});
      const data = response as unknown as { success: boolean; simulation: { coachName: string; xpGained: number; notificationSent: boolean } };
      const message = data.simulation.notificationSent 
        ? `Simulated: Feedback from "${data.simulation.coachName}" (+${data.simulation.xpGained} XP)! Push notification sent.`
        : `Simulated feedback received. (No push token - open app on phone first)`;
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Simulation Complete", message);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Failed to simulate feedback";
      if (Platform.OS === "web") {
        window.alert(errMsg);
      } else {
        Alert.alert("Error", errMsg);
      }
    } finally {
      setTestFeedbackLoading(false);
    }
  };

  const notificationSettings: SettingItem[] = [
    {
      id: "notifications",
      icon: "notifications",
      label: "Push Notifications",
      type: "toggle",
      value: notifications,
      onPress: () => setNotifications(!notifications),
    },
    {
      id: "session-reminders",
      icon: "calendar",
      label: "Session Reminders",
      type: "toggle",
      value: sessionReminders,
      onPress: () => setSessionReminders(!sessionReminders),
    },
    {
      id: "progress-updates",
      icon: "trending-up",
      label: "Progress Updates",
      type: "toggle",
      value: progressUpdates,
      onPress: () => setProgressUpdates(!progressUpdates),
    },
    {
      id: "coach-messages",
      icon: "chatbubble",
      label: "Coach Messages",
      type: "toggle",
      value: coachMessages,
      onPress: () => setCoachMessages(!coachMessages),
    },
  ];

  const languageOptions = [
    { id: "player", label: "Fun & Encouraging", description: "Kid-friendly messages" },
    { id: "coach", label: "Technical", description: "Coach-style technical terms" },
    { id: "parent", label: "Informative", description: "Parent-friendly updates" },
  ];

  const discoverySettings: SettingItem[] = [
    {
      id: "coach-directory",
      icon: "people",
      label: "Find Coaches",
      type: "link",
      onPress: () => (navigation.getParent() as any)?.navigate("CoachDirectory"),
    },
    {
      id: "academy-browser",
      icon: "school",
      label: "Browse Academies",
      type: "link",
      onPress: () => (navigation.getParent() as any)?.navigate("AcademyBrowser"),
    },
    {
      id: "transfer-request",
      icon: "swap-horizontal",
      label: "Transfer Academy",
      type: "link",
      onPress: () => (navigation.getParent() as any)?.navigate("TransferRequest"),
    },
  ];

  const accountSettings: SettingItem[] = [
    {
      id: "edit-profile",
      icon: "person",
      label: "Edit Profile",
      type: "link",
    },
    {
      id: "privacy",
      icon: "lock-closed",
      label: "Privacy Settings",
      type: "link",
    },
    {
      id: "help",
      icon: "help-circle",
      label: "Help & Support",
      type: "link",
    },
    {
      id: "about",
      icon: "information-circle",
      label: "About Glow Up Tennis",
      type: "link",
    },
  ];

  const renderSettingItem = (item: SettingItem) => (
    <Pressable
      key={item.id}
      style={styles.settingItem}
      onPress={item.onPress}
      disabled={item.type === "toggle"}
    >
      <View style={styles.settingIcon}>
        <Ionicons name={item.icon as any} size={20} color={Colors.dark.xpCyan} />
      </View>
      <Text style={styles.settingLabel}>{item.label}</Text>
      {item.type === "toggle" ? (
        <Switch
          value={item.value}
          onValueChange={item.onPress}
          trackColor={{ false: Colors.dark.backgroundTertiary, true: Colors.dark.primary }}
          thumbColor={Colors.dark.text}
        />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
      )}
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 200 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.sectionCard}>
            {notificationSettings.map(renderSettingItem)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Message Style</Text>
          <View style={styles.sectionCard}>
            {languageOptions.map((option) => (
              <Pressable
                key={option.id}
                style={styles.settingItem}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMessageLanguage(option.id as "player" | "coach" | "parent");
                }}
              >
                <View style={styles.settingIcon}>
                  <Ionicons 
                    name={option.id === "player" ? "happy" : option.id === "coach" ? "code" : "people"} 
                    size={20} 
                    color={Colors.dark.xpCyan} 
                  />
                </View>
                <View style={styles.languageTextContainer}>
                  <Text style={styles.settingLabel}>{option.label}</Text>
                  <Text style={styles.languageDescription}>{option.description}</Text>
                </View>
                <View style={[
                  styles.radioOuter,
                  messageLanguage === option.id && styles.radioOuterSelected
                ]}>
                  {messageLanguage === option.id && <View style={styles.radioInner} />}
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Discover</Text>
          <View style={styles.sectionCard}>
            {discoverySettings.map(renderSettingItem)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.sectionCard}>
            {accountSettings.map(renderSettingItem)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          <View style={styles.sectionCard}>
            <View style={styles.settingItem}>
              <View style={styles.settingIcon}>
                <Ionicons name="code" size={20} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.settingLabel}>Version</Text>
              <Text style={styles.settingValue}>1.0.0</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: "#E67E22" }]}>Developer Tools</Text>
          <View style={styles.devToolsCard}>
            <Text style={styles.devToolsNote}>
              Test push notifications and simulate events. Requires Expo Go with notifications enabled.
            </Text>
            
            <Pressable
              style={[styles.devToolsButton, testPushLoading && styles.devToolsButtonDisabled]}
              onPress={handleTestPushNotification}
              disabled={testPushLoading}
            >
              {testPushLoading ? (
                <ActivityIndicator size="small" color="#E67E22" />
              ) : (
                <>
                  <Ionicons name="notifications" size={20} color="#E67E22" />
                  <Text style={styles.devToolsButtonText}>Test Push Notification</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.devToolsButton, testFeedbackLoading && styles.devToolsButtonDisabled]}
              onPress={handleTestFeedback}
              disabled={testFeedbackLoading}
            >
              {testFeedbackLoading ? (
                <ActivityIndicator size="small" color="#E67E22" />
              ) : (
                <>
                  <Ionicons name="star" size={20} color="#E67E22" />
                  <Text style={styles.devToolsButtonText}>Simulate Coach Feedback</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        <Pressable 
          style={styles.logoutButton}
          onPress={() => {
            if (Platform.OS === "web") {
              const confirmed = window.confirm("Are you sure you want to sign out?");
              if (confirmed) {
                logout();
              }
            } else {
              Alert.alert(
                "Sign Out",
                "Are you sure you want to sign out?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Sign Out",
                    style: "destructive",
                    onPress: () => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      logout();
                    },
                  },
                ]
              );
            }
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.dark.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
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
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginLeft: Spacing.sm,
  },
  sectionCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    padding: 0,
    overflow: "hidden",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 212, 255, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
  },
  settingLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  settingValue: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  languageTextContainer: {
    flex: 1,
  },
  languageDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.dark.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: GlowColors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GlowColors.primary,
  },
  devToolsCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  devToolsNote: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  devToolsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: "rgba(230, 126, 34, 0.12)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(230, 126, 34, 0.2)",
  },
  devToolsButtonDisabled: {
    opacity: 0.6,
  },
  devToolsButtonText: {
    ...Typography.body,
    color: "#E67E22",
    fontWeight: "600",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 76, 77, 0.2)",
  },
  logoutText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
});
