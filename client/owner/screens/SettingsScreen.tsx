import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert, Platform, Modal, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
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
  players: boolean;
}

interface ResetCounts {
  sessions: number;
  attendance: number;
  payments: number;
  progress: number;
  feedback: number;
  packages: number;
  invoices: number;
  players: number;
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

interface AcademySettings {
  defaultSessionLength?: number;
  xpVisibleToPlayers?: boolean;
  notificationsEnabled?: boolean;
  welcomeVideoUrl?: string;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const [showSessionLengthModal, setShowSessionLengthModal] = useState(false);
  const [sessionLengthInput, setSessionLengthInput] = useState("60");
  const [showWelcomeVideoModal, setShowWelcomeVideoModal] = useState(false);
  const [welcomeVideoInput, setWelcomeVideoInput] = useState("");
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
    players: false,
  });

  const { data: settingsData } = useQuery<AcademySettings>({
    queryKey: ["/api/owner/academy-settings"],
  });

  const settings = settingsData || {
    defaultSessionLength: 60,
    xpVisibleToPlayers: true,
    notificationsEnabled: true,
    welcomeVideoUrl: "",
  };

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<AcademySettings>) => {
      return apiRequest("PATCH", "/api/owner/academy-settings", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/academy-settings"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      if (Platform.OS === "web") {
        window.alert(error.message || "Failed to update settings");
      } else {
        Alert.alert("Error", error.message || "Failed to update settings");
      }
    },
  });

  const handleToggleXpVisible = (value: boolean) => {
    updateSettingsMutation.mutate({ xpVisibleToPlayers: value });
  };

  const handleToggleNotifications = (value: boolean) => {
    updateSettingsMutation.mutate({ notificationsEnabled: value });
  };

  const handleOpenSessionLengthModal = () => {
    setSessionLengthInput(String(settings.defaultSessionLength || 60));
    setShowSessionLengthModal(true);
  };

  const handleOpenWelcomeVideoModal = () => {
    setWelcomeVideoInput(settings.welcomeVideoUrl || "");
    setShowWelcomeVideoModal(true);
  };

  const handleSaveWelcomeVideo = () => {
    updateSettingsMutation.mutate({ welcomeVideoUrl: welcomeVideoInput.trim() || null });
    setShowWelcomeVideoModal(false);
  };

  const handleExportPlayers = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // Use apiRequest to fetch with auth - returns JSON { csv, filename }
      const res = await apiRequest("GET", "/api/owner/export/players");
      const response = await res.json() as { csv: string; filename: string };
      const csvData = response.csv;
      
      if (Platform.OS === "web") {
        // Web: use native browser download
        const blob = new Blob([csvData], { type: "text/csv" });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = response.filename || "players.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        window.alert("Players exported successfully!");
      } else {
        // Native: write to file and share
        const fileUri = FileSystem.documentDirectory + (response.filename || "players.csv");
        await FileSystem.writeAsStringAsync(fileUri, csvData);
        
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "text/csv",
            dialogTitle: "Export Players",
          });
        } else {
          Alert.alert("Success", "Players exported successfully!");
        }
      }
    } catch (error) {
      if (Platform.OS === "web") {
        window.alert("Export failed - try again later");
      } else {
        Alert.alert("Error", "Export failed - try again later");
      }
    }
  };

  const handleExportSessions = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // Use apiRequest to fetch with auth - returns JSON { csv, filename }
      const res = await apiRequest("GET", "/api/owner/export/sessions");
      const response = await res.json() as { csv: string; filename: string };
      const csvData = response.csv;
      
      if (Platform.OS === "web") {
        // Web: use native browser download
        const blob = new Blob([csvData], { type: "text/csv" });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = response.filename || "sessions.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        window.alert("Sessions exported successfully!");
      } else {
        // Native: write to file and share
        const fileUri = FileSystem.documentDirectory + (response.filename || "sessions.csv");
        await FileSystem.writeAsStringAsync(fileUri, csvData);
        
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "text/csv",
            dialogTitle: "Export Sessions",
          });
        } else {
          Alert.alert("Success", "Sessions exported successfully!");
        }
      }
    } catch (error) {
      if (Platform.OS === "web") {
        window.alert("Export failed - try again later");
      } else {
        Alert.alert("Error", "Export failed - try again later");
      }
    }
  };

  const { data: resetCountsData } = useQuery<{ counts: ResetCounts }>({
    queryKey: ["/api/academy/reset-counts"],
    enabled: showResetModal,
  });
  const resetCounts = resetCountsData?.counts;

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
        players: false,
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
      players: false,
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

  const RESET_OPTIONS_LIST: { key: keyof ResetOptions; label: string; desc: string }[] = [
    { key: "sessions", label: "Sessions", desc: "All scheduled and past sessions" },
    { key: "attendance", label: "Attendance", desc: "Player attendance records" },
    { key: "payments", label: "Payments", desc: "Payment records and transactions" },
    { key: "progress", label: "Progress", desc: "Player XP, levels, and skill data" },
    { key: "feedback", label: "Feedback", desc: "Session feedback and observations" },
    { key: "packages", label: "Packages", desc: "Credit packages assigned to players" },
    { key: "invoices", label: "Invoices", desc: "All generated invoices" },
    { key: "players", label: "Players", desc: "All player accounts in this academy" },
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
            value={`${settings.defaultSessionLength || 60} min`}
            onPress={handleOpenSessionLengthModal}
          />
          <SettingRow
            icon="eye"
            title="XP Visible to Players"
            toggle={settings.xpVisibleToPlayers ?? true}
            onToggle={handleToggleXpVisible}
          />
          <SettingRow
            icon="notifications"
            title="Notifications"
            toggle={settings.notificationsEnabled ?? true}
            onToggle={handleToggleNotifications}
          />
          <SettingRow
            icon="videocam"
            title="Welcome Video"
            subtitle="Shown during player onboarding"
            value={settings.welcomeVideoUrl ? "Set" : "Not set"}
            onPress={handleOpenWelcomeVideoModal}
          />
        </Section>

        <Section title="Billing & Pricing">
          <SettingRow
            icon="pricetag"
            title="Session Pricing"
            subtitle="Set prices for different session types"
            onPress={() => navigation.navigate("Pricing")}
          />
          <SettingRow
            icon="wallet"
            title="Coach Compensation"
            subtitle="Manage coach payout rates"
            onPress={() => navigation.navigate("CoachCompensation")}
          />
          <SettingRow
            icon="gift"
            title="Credit Packages"
            subtitle="Create packages for players to purchase"
            onPress={() => navigation.navigate("CreditPackages")}
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
            onPress={() => navigation.navigate("RulesAndPolicies")}
          />
          <SettingRow
            icon="key"
            title="Head Coach Settings"
            subtitle="Special permissions for head coaches"
            onPress={() => navigation.navigate("RulesAndPolicies")}
          />
        </Section>

        <Section title="Data & Export">
          <SettingRow
            icon="download"
            title="Export Players"
            subtitle="Download player data as CSV"
            onPress={handleExportPlayers}
          />
          <SettingRow
            icon="document"
            title="Export Sessions"
            subtitle="Download session history"
            onPress={handleExportSessions}
          />
          <SettingRow
            icon="lock-closed"
            title="GDPR Tools"
            subtitle="Data privacy and deletion"
            onPress={handleOpenResetModal}
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
        visible={showSessionLengthModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSessionLengthModal(false)}
      >
        <View style={styles.sessionLengthModalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowSessionLengthModal(false)} />
          <View style={[styles.sessionLengthModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setShowSessionLengthModal(false)}>
                <Text style={styles.cancelButton}>Cancel</Text>
              </Pressable>
              <Text style={styles.modalTitle}>Session Length</Text>
              <View style={{ width: 50 }} />
            </View>
            <Text style={styles.sessionLengthLabel}>Select default session length</Text>
            <View style={styles.sessionLengthOptions}>
              {[30, 45, 60, 75, 90, 120].map((minutes) => {
                const isSelected = parseInt(sessionLengthInput) === minutes;
                return (
                  <Pressable
                    key={minutes}
                    style={[
                      styles.sessionLengthOption,
                      isSelected && styles.sessionLengthOptionSelected,
                    ]}
                    onPress={() => {
                      setSessionLengthInput(String(minutes));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      updateSettingsMutation.mutate({ defaultSessionLength: minutes });
                      setShowSessionLengthModal(false);
                    }}
                  >
                    <Text style={[
                      styles.sessionLengthOptionText,
                      isSelected && styles.sessionLengthOptionTextSelected,
                    ]}>
                      {minutes} min
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showWelcomeVideoModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowWelcomeVideoModal(false)}
      >
        <View style={styles.sessionLengthModalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowWelcomeVideoModal(false)} />
          <KeyboardAwareScrollViewCompat style={{ flex: 0 }}>
            <View style={[styles.sessionLengthModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowWelcomeVideoModal(false)}>
                  <Text style={styles.cancelButton}>Cancel</Text>
                </Pressable>
                <Text style={styles.modalTitle}>Welcome Video</Text>
                <Pressable onPress={handleSaveWelcomeVideo}>
                  <Text style={styles.saveButton}>Save</Text>
                </Pressable>
              </View>
              <Text style={styles.sessionLengthLabel}>Enter a YouTube or video URL to show new players during onboarding</Text>
              <TextInput
                style={styles.welcomeVideoInput}
                value={welcomeVideoInput}
                onChangeText={setWelcomeVideoInput}
                placeholder="https://youtube.com/watch?v=..."
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              {settings.welcomeVideoUrl ? (
                <Pressable
                  style={styles.clearVideoButton}
                  onPress={() => {
                    updateSettingsMutation.mutate({ welcomeVideoUrl: null });
                    setShowWelcomeVideoModal(false);
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                  <Text style={styles.clearVideoText}>Remove video</Text>
                </Pressable>
              ) : null}
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

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

            {RESET_OPTIONS_LIST.map((item) => {
              const count = resetCounts ? resetCounts[item.key] : undefined;
              return (
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
                    <View style={styles.resetOptionHeader}>
                      <Text style={[styles.resetOptionLabel, resetOptions[item.key] && { color: Colors.dark.error }]}>
                        {item.label}
                      </Text>
                      {count !== undefined ? (
                        <View style={styles.countBadge}>
                          <Text style={styles.countText}>{count}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.resetOptionDesc}>{item.desc}</Text>
                  </View>
                </Pressable>
              );
            })}

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
  resetOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  countBadge: {
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    minWidth: 28,
    alignItems: "center",
  },
  countText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
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
  sessionLengthModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sessionLengthModalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  saveButton: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  sessionLengthLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sessionLengthOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  sessionLengthOption: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "transparent",
    minWidth: 80,
    alignItems: "center",
  },
  sessionLengthOptionSelected: {
    borderColor: Colors.dark.gold,
    backgroundColor: `${Colors.dark.gold}15`,
  },
  sessionLengthOptionText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sessionLengthOptionTextSelected: {
    color: Colors.dark.gold,
  },
  sessionLengthInput: {
    ...Typography.h2,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    textAlign: "center",
  },
  sessionLengthHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  welcomeVideoInput: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  clearVideoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  clearVideoText: {
    ...Typography.small,
    color: Colors.dark.error,
  },
});
