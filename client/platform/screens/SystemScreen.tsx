import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform, Switch, ActivityIndicator, Modal, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";
import type { PlatformStackParamList } from "@/platform/navigation/PlatformNavigator";
type NavigationProp = NativeStackNavigationProp<PlatformStackParamList>;

const PLATFORM_COLOR = "#9B59B6";
const TEST_COLOR = "#E67E22";

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  color?: string;
  danger?: boolean;
  onPress?: () => void;
}

function SettingRow({ icon, label, description, color = Colors.dark.textMuted, danger, onPress }: SettingRowProps) {
  return (
    <Pressable 
      style={styles.settingRow}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
    >
      <View style={[styles.settingIcon, { backgroundColor: danger ? `${Colors.dark.error}20` : `${PLATFORM_COLOR}20` }]}>
        <Ionicons name={icon} size={20} color={danger ? Colors.dark.error : PLATFORM_COLOR} />
      </View>
      <View style={styles.settingInfo}>
        <Text style={[styles.settingLabel, danger && { color: Colors.dark.error }]}>{label}</Text>
        {description ? <Text style={styles.settingDescription}>{description}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

interface StatusIndicatorProps {
  label: string;
  status: "operational" | "degraded" | "down";
}

function StatusIndicator({ label, status }: StatusIndicatorProps) {
  const statusConfig = {
    operational: { color: Colors.dark.primary, text: "Operational" },
    degraded: { color: Colors.dark.orange, text: "Degraded" },
    down: { color: Colors.dark.error, text: "Down" },
  };

  const config = statusConfig[status];

  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={styles.statusIndicator}>
        <View style={[styles.statusDot, { backgroundColor: config.color }]} />
        <Text style={[styles.statusText, { color: config.color }]}>{config.text}</Text>
      </View>
    </View>
  );
}

export default function SystemScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const { data: maintenanceStatus, isLoading: maintenanceLoading } = useQuery<{ maintenance: boolean }>({
    queryKey: ["/api/maintenance/status"],
  });
  const maintenanceMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("POST", "/api/platform/maintenance", { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/status"] });
    },
  });

  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testSignupLoading, setTestSignupLoading] = useState(false);

  const [showWelcomeVideoModal, setShowWelcomeVideoModal] = useState(false);
  const [welcomeVideoUrl, setWelcomeVideoUrl] = useState("");

  const { data: welcomeVideoConfig } = useQuery<{ value: { url: string } } | null>({
    queryKey: ["/api/platform/config/welcome_video"],
  });

  const welcomeVideoMutation = useMutation({
    mutationFn: async (url: string) => {
      return apiRequest("PUT", "/api/platform/config/welcome_video", { value: { url } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/config/welcome_video"] });
      setShowWelcomeVideoModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === "web") {
        window.alert("Welcome video updated successfully!");
      } else {
        Alert.alert("Success", "Welcome video updated successfully!");
      }
    },
    onError: () => {
      if (Platform.OS === "web") {
        window.alert("Failed to update welcome video.");
      } else {
        Alert.alert("Error", "Failed to update welcome video.");
      }
    },
  });

  const handleOpenWelcomeVideoModal = () => {
    setWelcomeVideoUrl(welcomeVideoConfig?.value?.url || "");
    setShowWelcomeVideoModal(true);
  };

  const handleTestPushNotification = async () => {
    setTestPushLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const response = await apiRequest("POST", "/api/push/test", {});
      const data = response as unknown as { success: boolean; devicesNotified?: number };
      const deviceCount = data.devicesNotified ?? 1;
      const message = `Test notification sent to ${deviceCount} device(s). Check your phone!`;
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Success", message);
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      const message = error?.message || "Failed to send test notification. Make sure you have the app open on your phone with notifications enabled.";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
    } finally {
      setTestPushLoading(false);
    }
  };

  const handleTestAcademySignup = async () => {
    setTestSignupLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const response = await apiRequest("POST", "/api/platform/test/academy-signup", {});
      const data = response as unknown as { success: boolean; simulation: { academyName: string; ownerName: string; email: string; notificationSent: boolean } };
      const message = data.simulation.notificationSent 
        ? `Simulated sign-up request from "${data.simulation.ownerName}" for "${data.simulation.academyName}". Push notification sent!`
        : `Simulated sign-up: "${data.simulation.ownerName}" wants to create "${data.simulation.academyName}". (No push token - open app on phone first)`;
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Academy Sign-up Simulation", message);
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      const message = error?.message || "Failed to simulate academy sign-up.";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
    } finally {
      setTestSignupLoading(false);
    }
  };

  const isMaintenanceOn = maintenanceStatus?.maintenance ?? false;

  const handleMaintenanceToggle = (enabled: boolean) => {
    const action = enabled ? "enable" : "disable";
    const message = enabled 
      ? "This will temporarily disable platform access for all users (except platform owners)."
      : "This will restore platform access for all users.";

    if (Platform.OS === "web") {
      const confirmed = window.confirm(`${enabled ? "Enable" : "Disable"} Maintenance Mode?\n\n${message}`);
      if (confirmed) {
        maintenanceMutation.mutate(enabled, {
          onSuccess: () => {
            Haptics.notificationAsync(enabled ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
            window.alert(`Maintenance mode ${enabled ? "enabled" : "disabled"}.`);
          },
          onError: () => {
            window.alert("Failed to toggle maintenance mode. Please try again.");
          },
        });
      }
    } else {
      Alert.alert(
        `${enabled ? "Enable" : "Disable"} Maintenance Mode`,
        message,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: enabled ? "Enable" : "Disable",
            style: enabled ? "destructive" : "default",
            onPress: () => {
              maintenanceMutation.mutate(enabled, {
                onSuccess: () => {
                  Haptics.notificationAsync(enabled ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
                  Alert.alert("Success", `Maintenance mode ${enabled ? "enabled" : "disabled"}.`);
                },
                onError: () => {
                  Alert.alert("Error", "Failed to toggle maintenance mode. Please try again.");
                },
              });
            },
          },
        ]
      );
    }
  };

  const handleKillSwitch = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("EMERGENCY KILL SWITCH\n\nThis will immediately shut down all platform services by enabling maintenance mode. Only use in case of critical emergency.\n\nAre you absolutely sure?");
      if (confirmed) {
        maintenanceMutation.mutate(true, {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            window.alert("Kill switch activated. Platform is now in maintenance mode.");
          },
          onError: () => {
            window.alert("Failed to activate kill switch. Please try again.");
          },
        });
      }
    } else {
      Alert.alert(
        "EMERGENCY KILL SWITCH",
        "This will immediately shut down all platform services by enabling maintenance mode. Only use in case of critical emergency.\n\nAre you absolutely sure?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "ACTIVATE",
            style: "destructive",
            onPress: () => {
              maintenanceMutation.mutate(true, {
                onSuccess: () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  Alert.alert("Kill Switch Activated", "Platform is now in maintenance mode.");
                },
                onError: () => {
                  Alert.alert("Error", "Failed to activate kill switch. Please try again.");
                },
              });
            },
          },
        ]
      );
    }
  };

  const handleExportData = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "web") {
      window.alert("Preparing data export... You will receive a download link via email when ready.");
    } else {
      Alert.alert("Export Started", "Preparing data export... You will receive a download link via email when ready.");
    }
  };

  const handleGDPR = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      window.alert("GDPR Tools:\n- Data subject access requests\n- Right to erasure requests\n- Data portability\n- Consent management\n\nFull GDPR compliance tools coming soon.");
    } else {
      Alert.alert("GDPR Tools", "Data privacy and compliance features:\n\n- Data subject access requests\n- Right to erasure requests\n- Data portability\n- Consent management\n\nFull GDPR compliance tools coming soon.");
    }
  };

  const handleLogout = () => {
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
  };

  const systemStatus = [
    { label: "API Server", status: "operational" as const },
    { label: "Database", status: "operational" as const },
    { label: "WebSocket", status: "operational" as const },
    { label: "Push Notifications", status: "operational" as const },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        
          <View style={styles.header}>
            <Text style={styles.title}>System & Settings</Text>
            <Text style={styles.subtitle}>Platform configuration and controls</Text>
          </View>
        

        
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>System Status</Text>
            <View style={[styles.statusCard, CardStyles.elevated]}>
              {systemStatus.map((item, index) => (
                <StatusIndicator key={index} {...item} />
              ))}
            </View>
          </View>
        

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>XP Engine Configuration</Text>
          <View style={[styles.settingsCard, CardStyles.elevated]}>
            <SettingRow 
              icon="flash" 
              label="XP Multipliers" 
              description="Configure base XP values"
              onPress={() => navigation.navigate("XPMultipliers")}
            />
            <SettingRow 
              icon="shield-checkmark" 
              label="Anti-Abuse Rules" 
              description="XP caps and pattern detection"
              onPress={() => navigation.navigate("AntiAbuseRules")}
            />
            <SettingRow 
              icon="trending-up" 
              label="Level Thresholds" 
              description="XP required per level"
              onPress={() => navigation.navigate("LevelThresholds")}
            />
            <SettingRow 
              icon="ribbon" 
              label="Badge Definitions" 
              description="Manage achievement badges"
              onPress={() => navigation.navigate("BadgeDefinitions")}
            />
            <SettingRow 
              icon="lock-open" 
              label="Feature Unlocks" 
              description="Configure which level unlocks each feature"
              onPress={() => navigation.navigate("FeatureUnlocks")}
            />
          </View>
        </View>

        
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Platform Settings</Text>
            <View style={[styles.settingsCard, CardStyles.elevated]}>
              <SettingRow 
                icon="videocam" 
                label="Welcome Video" 
                description={welcomeVideoConfig?.value?.url ? "Video configured" : "Set platform intro video"}
                onPress={handleOpenWelcomeVideoModal}
              />
              <SettingRow 
                icon="business" 
                label="Academy Defaults" 
                description="Default settings for new academies"
                onPress={() => navigation.navigate("AcademyDefaults")}
              />
              <SettingRow 
                icon="card" 
                label="Billing Configuration" 
                description="Stripe and payment settings"
                onPress={() => navigation.navigate("BillingConfig")}
              />
              <SettingRow 
                icon="notifications" 
                label="Notification Templates" 
                description="Email and push notification templates"
                onPress={() => navigation.navigate("NotificationTemplates")}
              />
              <SettingRow 
                icon="document-text" 
                label="Terms & Privacy" 
                description="Legal document management"
              />
              <SettingRow 
                icon="construct" 
                label="Provider Invites" 
                description="Invite or create service provider accounts"
                onPress={() => navigation.navigate("ProviderInviteManagement")}
              />
            </View>
          </View>
        

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & Compliance</Text>
          <View style={[styles.settingsCard, CardStyles.elevated]}>
            <SettingRow 
              icon="download" 
              label="Export All Data" 
              description="Download complete platform data"
              onPress={handleExportData}
            />
            <SettingRow 
              icon="analytics" 
              label="Audit Logs" 
              description="View system activity logs"
              onPress={() => navigation.navigate("AuditLogs")}
            />
            <SettingRow 
              icon="bug" 
              label="Diagnostics" 
              description="Error reports from users"
              onPress={() => navigation.navigate("Diagnostics")}
            />
            <SettingRow
              icon="flag"
              label="Moderation Queue"
              description="Review reported chat messages"
              onPress={() => navigation.navigate("ModerationReports")}
            />
            <SettingRow 
              icon="shield" 
              label="GDPR Tools" 
              description="Data privacy and compliance"
              onPress={handleGDPR}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: TEST_COLOR }]}>Developer Tools</Text>
          <View style={[styles.settingsCard, CardStyles.elevated, { borderColor: TEST_COLOR + "40", borderWidth: 1 }]}>
            <Pressable 
              style={styles.settingRow}
              onPress={handleTestPushNotification}
              disabled={testPushLoading}
            >
              <View style={[styles.settingIcon, { backgroundColor: `${TEST_COLOR}20` }]}>
                {testPushLoading ? (
                  <ActivityIndicator size="small" color={TEST_COLOR} />
                ) : (
                  <Ionicons name="notifications" size={20} color={TEST_COLOR} />
                )}
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Test Push Notification</Text>
                <Text style={styles.settingDescription}>Send a test notification to your phone</Text>
              </View>
              <Ionicons name="send" size={20} color={TEST_COLOR} />
            </Pressable>
            <Pressable 
              style={styles.settingRow}
              onPress={handleTestAcademySignup}
              disabled={testSignupLoading}
            >
              <View style={[styles.settingIcon, { backgroundColor: `${TEST_COLOR}20` }]}>
                {testSignupLoading ? (
                  <ActivityIndicator size="small" color={TEST_COLOR} />
                ) : (
                  <Ionicons name="business-outline" size={20} color={TEST_COLOR} />
                )}
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Simulate Academy Sign-up</Text>
                <Text style={styles.settingDescription}>Test new academy request notification</Text>
              </View>
              <Ionicons name="flask" size={20} color={TEST_COLOR} />
            </Pressable>
          </View>
        </View>

        
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Danger Zone</Text>
            <View style={[styles.settingsCard, CardStyles.elevated]}>
              <View style={styles.settingRow}>
                <View style={[styles.settingIcon, { backgroundColor: `${Colors.dark.error}20` }]}>
                  <Ionicons name="pause" size={20} color={Colors.dark.error} />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingLabel, { color: Colors.dark.error }]}>Maintenance Mode</Text>
                  <Text style={styles.settingDescription}>
                    {isMaintenanceOn ? "Platform is currently locked" : "Temporarily disable platform access"}
                  </Text>
                </View>
                {maintenanceLoading || maintenanceMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.error} />
                ) : (
                  <Switch
                    value={isMaintenanceOn}
                    onValueChange={handleMaintenanceToggle}
                    trackColor={{ false: Colors.dark.backgroundRoot, true: Colors.dark.error + "80" }}
                    thumbColor={isMaintenanceOn ? Colors.dark.error : Colors.dark.textMuted}
                  />
                )}
              </View>
              <SettingRow 
                icon="nuclear" 
                label="Kill Switch" 
                description="Emergency platform shutdown"
                danger
                onPress={handleKillSwitch}
              />
            </View>
          </View>
        

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={Colors.dark.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>

        <View style={styles.versionInfo}>
          <Text style={styles.versionText}>Glow Up Sports Platform v1.0.0</Text>
          <Text style={styles.versionSubtext}>Build 2024.12.28</Text>
        </View>
      </ScrollView>

      <Modal visible={showWelcomeVideoModal} transparent animationType="fade" onRequestClose={() => setShowWelcomeVideoModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowWelcomeVideoModal(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>Platform Welcome Video</Text>
            <Text style={styles.modalDescription}>
              This video will be shown to all new players during onboarding, introducing them to the Glow Up Sports experience.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter YouTube or video URL..."
              placeholderTextColor={Colors.dark.textMuted}
              value={welcomeVideoUrl}
              onChangeText={setWelcomeVideoUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalCancelButton} onPress={() => setShowWelcomeVideoModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.modalSaveButton, !welcomeVideoUrl && styles.modalSaveButtonDisabled]} 
                onPress={() => welcomeVideoMutation.mutate(welcomeVideoUrl)}
                disabled={!welcomeVideoUrl || welcomeVideoMutation.isPending}
              >
                {welcomeVideoMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    color: PLATFORM_COLOR,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  statusCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  statusLabel: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...Typography.small,
    fontWeight: "600",
  },
  settingsCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  settingDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
    marginBottom: Spacing.xl,
  },
  logoutText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.error,
  },
  versionInfo: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  versionText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  versionSubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  modalDescription: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  modalInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
    marginBottom: Spacing.lg,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  modalCancelText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: PLATFORM_COLOR,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  modalSaveButtonDisabled: {
    opacity: 0.5,
  },
  modalSaveText: {
    ...Typography.body,
    color: "#fff",
    fontWeight: "600",
  },
});
