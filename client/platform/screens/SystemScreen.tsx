import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import type { PlatformStackParamList } from "@/platform/navigation/PlatformNavigator";

type NavigationProp = NativeStackNavigationProp<PlatformStackParamList>;

const PLATFORM_COLOR = "#9B59B6";

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

  const handleMaintenanceMode = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("Enable Maintenance Mode? This will temporarily disable platform access for all users.");
      if (confirmed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        window.alert("Maintenance mode is now enabled.");
      }
    } else {
      Alert.alert(
        "Enable Maintenance Mode",
        "This will temporarily disable platform access for all users.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Enable",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              Alert.alert("Success", "Maintenance mode is now enabled.");
            },
          },
        ]
      );
    }
  };

  const handleKillSwitch = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("EMERGENCY KILL SWITCH\n\nThis will immediately shut down all platform services. Only use in case of critical emergency.\n\nAre you absolutely sure?");
      if (confirmed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        window.alert("Kill switch activated. All services are being shut down.");
      }
    } else {
      Alert.alert(
        "EMERGENCY KILL SWITCH",
        "This will immediately shut down all platform services. Only use in case of critical emergency.\n\nAre you absolutely sure?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "ACTIVATE",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Kill Switch Activated", "All services are being shut down.");
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
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform Settings</Text>
          <View style={[styles.settingsCard, CardStyles.elevated]}>
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
              icon="shield" 
              label="GDPR Tools" 
              description="Data privacy and compliance"
              onPress={handleGDPR}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <View style={[styles.settingsCard, CardStyles.elevated]}>
            <SettingRow 
              icon="pause" 
              label="Maintenance Mode" 
              description="Temporarily disable platform access"
              danger
              onPress={handleMaintenanceMode}
            />
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
});
