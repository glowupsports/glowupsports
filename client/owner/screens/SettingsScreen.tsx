import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert, Platform, Modal, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import type { OwnerStackParamList } from "@/owner/navigation/OwnerNavigator";

interface ResetOptions {
  sessions: boolean;
  attendance: boolean;
  payments: boolean;
  progress: boolean;
  feedback: boolean;
  packages: boolean;
  invoices: boolean;
}

type NavigationProp = NativeStackNavigationProp<OwnerStackParamList>;

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value?: string;
  toggle?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  danger?: boolean;
}

function SettingRow({ icon, title, subtitle, value, toggle, onToggle, onPress, danger }: SettingRowProps) {
  const iconColor = danger ? Colors.dark.error : Colors.dark.gold;

  return (
    <Pressable 
      style={styles.settingRow} 
      onPress={onPress}
      disabled={toggle !== undefined}
    >
      <View style={[styles.settingIcon, { backgroundColor: `${iconColor}15` }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, danger && { color: Colors.dark.error }]}>{title}</Text>
        {subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}
      </View>
      {toggle !== undefined ? (
        <Switch
          value={toggle}
          onValueChange={onToggle}
          trackColor={{ false: Colors.dark.backgroundRoot, true: Colors.dark.gold }}
          thumbColor={Colors.dark.text}
        />
      ) : value ? (
        <View style={styles.settingValueContainer}>
          <Text style={styles.settingValue}>{value}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
      )}
    </Pressable>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[styles.sectionContent, CardStyles.elevated]}>
        {children}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [xpVisible, setXpVisible] = useState(true);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetOptions, setResetOptions] = useState<ResetOptions>({
    sessions: false,
    attendance: false,
    payments: false,
    progress: false,
    feedback: false,
    packages: false,
    invoices: false,
  });

  const resetAcademyMutation = useMutation({
    mutationFn: async ({ resetTypes, confirmationCode }: { resetTypes: ResetOptions; confirmationCode: string }) => {
      return apiRequest("POST", "/api/academy/reset", { resetTypes, confirmationCode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowResetModal(false);
      setResetConfirmation("");
      setResetOptions({
        sessions: false,
        attendance: false,
        payments: false,
        progress: false,
        feedback: false,
        packages: false,
        invoices: false,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === "web") {
        window.alert("Academy data reset successfully!");
      } else {
        Alert.alert("Success", "Academy data has been reset successfully!");
      }
    },
    onError: (error: any) => {
      if (Platform.OS === "web") {
        window.alert(error.message || "Failed to reset academy data");
      } else {
        Alert.alert("Error", error.message || "Failed to reset academy data");
      }
    },
  });

  const handleOpenResetModal = () => {
    setShowResetModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleCloseResetModal = () => {
    setShowResetModal(false);
    setResetConfirmation("");
    setResetOptions({
      sessions: false,
      attendance: false,
      payments: false,
      progress: false,
      feedback: false,
      packages: false,
      invoices: false,
    });
  };

  const handleResetAcademy = () => {
    const selectedCount = Object.values(resetOptions).filter(Boolean).length;
    if (selectedCount === 0) {
      if (Platform.OS === "web") {
        window.alert("Please select at least one data type to reset");
      } else {
        Alert.alert("Error", "Please select at least one data type to reset");
      }
      return;
    }
    if (resetConfirmation !== "RESET") {
      if (Platform.OS === "web") {
        window.alert("Please type RESET to confirm");
      } else {
        Alert.alert("Error", "Please type RESET to confirm");
      }
      return;
    }
    resetAcademyMutation.mutate({ resetTypes: resetOptions, confirmationCode: resetConfirmation });
  };

  const toggleResetOption = (key: keyof ResetOptions) => {
    setResetOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const RESET_OPTIONS_LIST = [
    { key: "sessions" as const, label: "Sessions", desc: "All scheduled and past sessions" },
    { key: "attendance" as const, label: "Attendance", desc: "Player attendance records" },
    { key: "payments" as const, label: "Payments", desc: "Payment records and transactions" },
    { key: "progress" as const, label: "Progress", desc: "Player XP, levels, and skill data" },
    { key: "feedback" as const, label: "Feedback", desc: "Session feedback and observations" },
    { key: "packages" as const, label: "Packages", desc: "Credit packages assigned to players" },
    { key: "invoices" as const, label: "Invoices", desc: "All generated invoices" },
  ];

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Academy configuration and preferences</Text>
        </View>

        <Section title="Academy Settings">
          <SettingRow
            icon="time"
            title="Default Session Length"
            value="60 min"
          />
          <SettingRow
            icon="eye"
            title="XP Visible to Players"
            toggle={xpVisible}
            onToggle={setXpVisible}
          />
          <SettingRow
            icon="notifications"
            title="Notifications"
            toggle={notificationsEnabled}
            onToggle={setNotificationsEnabled}
          />
        </Section>

        <Section title="Team Management">
          <SettingRow
            icon="person-add"
            title="Coach Invites"
            subtitle="Invite new coaches to your academy"
            onPress={() => navigation.navigate("InviteManagement")}
          />
          <SettingRow
            icon="shield-checkmark"
            title="Coach Permissions"
            subtitle="Manage what coaches can access"
          />
          <SettingRow
            icon="key"
            title="Head Coach Settings"
            subtitle="Special permissions for head coaches"
          />
        </Section>

        <Section title="Data & Export">
          <SettingRow
            icon="download"
            title="Export Players"
            subtitle="Download player data as CSV"
          />
          <SettingRow
            icon="document"
            title="Export Sessions"
            subtitle="Download session history"
          />
          <SettingRow
            icon="lock-closed"
            title="GDPR Tools"
            subtitle="Data privacy and deletion"
          />
        </Section>

        <Section title="Danger Zone">
          <SettingRow
            icon="refresh"
            title="Reset Academy Data"
            subtitle="Selectively clear sessions, payments, progress"
            onPress={handleOpenResetModal}
            danger
          />
          <SettingRow
            icon="pause-circle"
            title="Pause Academy"
            subtitle="Temporarily disable all activities"
            danger
          />
          <SettingRow
            icon="trash"
            title="Delete Academy"
            subtitle="Permanently remove all data"
            danger
          />
        </Section>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={Colors.dark.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={showResetModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseResetModal}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={handleCloseResetModal}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Reset Data</Text>
            <Pressable
              onPress={handleResetAcademy}
              disabled={resetAcademyMutation.isPending}
            >
              <Text style={[styles.resetButton, resetAcademyMutation.isPending && styles.disabledButton]}>
                {resetAcademyMutation.isPending ? "Resetting..." : "Reset"}
              </Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalContent}>
            <View style={styles.warningBanner}>
              <Ionicons name="warning" size={24} color={Colors.dark.error} />
              <Text style={styles.warningText}>
                This action cannot be undone. Selected data will be permanently deleted.
              </Text>
            </View>

            <Text style={styles.resetSectionTitle}>Select Data to Reset</Text>

            {RESET_OPTIONS_LIST.map((item) => (
              <Pressable
                key={item.key}
                style={[styles.resetOption, resetOptions[item.key] && styles.resetOptionSelected]}
                onPress={() => toggleResetOption(item.key)}
              >
                <View style={styles.resetOptionCheck}>
                  <Ionicons
                    name={resetOptions[item.key] ? "checkbox" : "square-outline"}
                    size={24}
                    color={resetOptions[item.key] ? Colors.dark.error : Colors.dark.textMuted}
                  />
                </View>
                <View style={styles.resetOptionContent}>
                  <Text style={[styles.resetOptionLabel, resetOptions[item.key] && { color: Colors.dark.error }]}>
                    {item.label}
                  </Text>
                  <Text style={styles.resetOptionDesc}>{item.desc}</Text>
                </View>
              </Pressable>
            ))}

            <View style={styles.confirmSection}>
              <Text style={styles.confirmLabel}>Type RESET to confirm</Text>
              <TextInput
                style={[styles.confirmInput, resetConfirmation === "RESET" && styles.confirmInputValid]}
                value={resetConfirmation}
                onChangeText={setResetConfirmation}
                placeholder="RESET"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="characters"
              />
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
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
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  sectionContent: {
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
    gap: Spacing.md,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  settingSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  settingValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  settingValue: {
    ...Typography.body,
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
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  logoutText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.error,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  cancelButton: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  resetButton: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalContent: {
    padding: Spacing.lg,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${Colors.dark.error}15`,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  warningText: {
    ...Typography.small,
    color: Colors.dark.error,
    flex: 1,
  },
  resetSectionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  resetOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  resetOptionSelected: {
    borderColor: Colors.dark.error,
    backgroundColor: `${Colors.dark.error}10`,
  },
  resetOptionCheck: {
    marginRight: Spacing.md,
  },
  resetOptionContent: {
    flex: 1,
  },
  resetOptionLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  resetOptionDesc: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  confirmSection: {
    marginTop: Spacing.lg,
  },
  confirmLabel: {
    ...Typography.body,
    color: Colors.dark.error,
    marginBottom: Spacing.sm,
    fontWeight: "600",
  },
  confirmInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    fontSize: Typography.body.fontSize,
    textAlign: "center",
  },
  confirmInputValid: {
    borderColor: Colors.dark.error,
  },
});
