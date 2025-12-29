import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  Alert,
  TextInput,
  Modal,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCoach } from "@/coach/context/CoachContext";
import { useAppMode } from "@/context/AppModeContext";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useNetwork } from "@/context/NetworkContext";

interface Court {
  id: string;
  name: string;
  color: string | null;
  locationId: string | null;
  isActive: boolean;
}

const COURT_COLORS = [
  "#2ECC40", // Green (primary)
  "#00D4FF", // Cyan
  "#FF6B35", // Orange
  "#FFD700", // Gold
  "#9B59B6", // Purple
  "#E91E63", // Pink
  "#3498DB", // Blue
  "#95A5A6", // Gray
];

interface CoachSettings {
  defaultDuration: 60 | 90;
  defaultRecurringWeeks: number;
  defaultTravelTime: number;
  focusModeAutoOn: boolean;
  notificationsEnabled: boolean;
  lessonReminder: boolean;
  lessonReminderMinutes: number;
  travelTimeWarning: boolean;
  offlineSyncAuto: boolean;
}

const SETTINGS_KEY = "@coach_settings";

const defaultSettings: CoachSettings = {
  defaultDuration: 60,
  defaultRecurringWeeks: 10,
  defaultTravelTime: 15,
  focusModeAutoOn: false,
  notificationsEnabled: true,
  lessonReminder: true,
  lessonReminderMinutes: 10,
  travelTimeWarning: true,
  offlineSyncAuto: true,
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach, focusMode, setFocusMode } = useCoach();
  const { setMode } = useAppMode();
  const { logout } = useAuth();
  const { isOffline, logOfflineAttempt } = useNetwork();
  const [settings, setSettings] = useState<CoachSettings>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [showCourtModal, setShowCourtModal] = useState(false);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [newCourtName, setNewCourtName] = useState("");
  const [newCourtColor, setNewCourtColor] = useState(COURT_COLORS[0]);

  const showOfflineAlert = useCallback(() => {
    if (Platform.OS === "web") {
      window.alert("You're currently offline. This action can't be saved.");
    } else {
      Alert.alert(
        "You're Offline",
        "You're currently offline. This action can't be saved. Please reconnect to the internet and try again.",
        [{ text: "OK", style: "default" }]
      );
    }
  }, []);

  const { data: courts = [], isLoading: courtsLoading } = useQuery<Court[]>({
    queryKey: ["/api/courts"],
  });

  const createCourtMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      return apiRequest("POST", "/api/courts", { name, color, isActive: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      setShowCourtModal(false);
      setNewCourtName("");
      setNewCourtColor(COURT_COLORS[0]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const updateCourtMutation = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      return apiRequest("PATCH", `/api/courts/${id}`, { name, color });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      setEditingCourt(null);
      setNewCourtName("");
      setNewCourtColor(COURT_COLORS[0]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteCourtMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/courts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleAddCourt = () => {
    setEditingCourt(null);
    setNewCourtName("");
    setNewCourtColor(COURT_COLORS[0]);
    setShowCourtModal(true);
  };

  const handleEditCourt = (court: Court) => {
    setEditingCourt(court);
    setNewCourtName(court.name);
    setNewCourtColor(court.color || COURT_COLORS[0]);
    setShowCourtModal(true);
  };

  const handleDeleteCourt = async (court: Court) => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "SettingsScreen", action: "delete_court" });
      showOfflineAlert();
      return;
    }
    Alert.alert(
      "Delete Court",
      `Are you sure you want to delete "${court.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteCourtMutation.mutate(court.id) },
      ]
    );
  };

  const handleSaveCourt = async () => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "SettingsScreen", action: editingCourt ? "update_court" : "create_court" });
      showOfflineAlert();
      return;
    }
    if (!newCourtName.trim()) return;
    if (editingCourt) {
      updateCourtMutation.mutate({ id: editingCourt.id, name: newCourtName.trim(), color: newCourtColor });
    } else {
      createCourtMutation.mutate({ name: newCourtName.trim(), color: newCourtColor });
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        setSettings({ ...defaultSettings, ...JSON.parse(stored) });
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const saveSettings = async (newSettings: CoachSettings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);
      setHasChanges(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Failed to save settings:", error);
      Alert.alert("Error", "Failed to save settings");
    }
  };

  const updateSetting = <K extends keyof CoachSettings>(
    key: K,
    value: CoachSettings[K]
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    setHasChanges(true);
    saveSettings(newSettings);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {coach ? (
          <View style={styles.profileSection}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileInitial}>{coach.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{coach.name}</Text>
              {coach.email ? <Text style={styles.profileEmail}>{coach.email}</Text> : null}
            </View>
          </View>
        ) : null}

        {/* Switch to Player App */}
        <Pressable
          style={styles.switchAppButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setMode("player");
          }}
        >
          <View style={styles.switchAppContent}>
            <Ionicons name="swap-horizontal" size={24} color={Colors.dark.primary} />
            <View>
              <Text style={styles.switchAppTitle}>Switch to Player App</Text>
              <Text style={styles.switchAppDescription}>View as a player</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Settings</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="time-outline" size={24} color={Colors.dark.tabIconDefault} />
              <View>
                <Text style={styles.settingLabel}>Default lesson duration</Text>
                <Text style={styles.settingDescription}>For new lessons</Text>
              </View>
            </View>
            <View style={styles.durationButtons}>
              <Pressable
                style={[
                  styles.durationButton,
                  settings.defaultDuration === 60 && styles.durationButtonActive,
                ]}
                onPress={() => updateSetting("defaultDuration", 60)}
              >
                <Text
                  style={[
                    styles.durationButtonText,
                    settings.defaultDuration === 60 && styles.durationButtonTextActive,
                  ]}
                >
                  60m
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.durationButton,
                  settings.defaultDuration === 90 && styles.durationButtonActive,
                ]}
                onPress={() => updateSetting("defaultDuration", 90)}
              >
                <Text
                  style={[
                    styles.durationButtonText,
                    settings.defaultDuration === 90 && styles.durationButtonTextActive,
                  ]}
                >
                  90m
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="repeat-outline" size={24} color={Colors.dark.tabIconDefault} />
              <View>
                <Text style={styles.settingLabel}>Default recurring</Text>
                <Text style={styles.settingDescription}>{settings.defaultRecurringWeeks} weeks</Text>
              </View>
            </View>
            <View style={styles.weekButtons}>
              {[8, 10, 12].map((weeks) => (
                <Pressable
                  key={weeks}
                  style={[
                    styles.weekButton,
                    settings.defaultRecurringWeeks === weeks && styles.weekButtonActive,
                  ]}
                  onPress={() => updateSetting("defaultRecurringWeeks", weeks)}
                >
                  <Text
                    style={[
                      styles.weekButtonText,
                      settings.defaultRecurringWeeks === weeks && styles.weekButtonTextActive,
                    ]}
                  >
                    {weeks}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="car-outline" size={24} color={Colors.dark.tabIconDefault} />
              <View>
                <Text style={styles.settingLabel}>Default travel time</Text>
                <Text style={styles.settingDescription}>{settings.defaultTravelTime} minutes</Text>
              </View>
            </View>
            <View style={styles.travelButtons}>
              {[10, 15, 20, 30].map((mins) => (
                <Pressable
                  key={mins}
                  style={[
                    styles.travelButton,
                    settings.defaultTravelTime === mins && styles.travelButtonActive,
                  ]}
                  onPress={() => updateSetting("defaultTravelTime", mins)}
                >
                  <Text
                    style={[
                      styles.travelButtonText,
                      settings.defaultTravelTime === mins && styles.travelButtonTextActive,
                    ]}
                  >
                    {mins}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Courts</Text>
            <Pressable style={styles.addButton} onPress={handleAddCourt}>
              <Ionicons name="add" size={20} color={Colors.dark.primary} />
            </Pressable>
          </View>

          {courts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No courts yet</Text>
              <Text style={styles.emptyStateSubtext}>Add your first court to get started</Text>
            </View>
          ) : (
            courts.map((court) => (
              <View key={court.id} style={styles.courtRow}>
                <View style={styles.courtInfo}>
                  <View style={[styles.courtColorDot, { backgroundColor: court.color || Colors.dark.primary }]} />
                  <Text style={styles.courtName}>{court.name}</Text>
                </View>
                <View style={styles.courtActions}>
                  <Pressable style={styles.courtActionButton} onPress={() => handleEditCourt(court)}>
                    <Ionicons name="pencil" size={18} color={Colors.dark.tabIconDefault} />
                  </Pressable>
                  <Pressable style={styles.courtActionButton} onPress={() => handleDeleteCourt(court)}>
                    <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Focus Mode</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="eye-outline" size={24} color={Colors.dark.tabIconDefault} />
              <View>
                <Text style={styles.settingLabel}>Focus Mode now</Text>
                <Text style={styles.settingDescription}>Hide distractions during lessons</Text>
              </View>
            </View>
            <Switch
              value={focusMode}
              onValueChange={(value) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFocusMode(value);
              }}
              trackColor={{ false: Colors.dark.disabled, true: "rgba(46, 204, 64, 0.4)" }}
              thumbColor={focusMode ? Colors.dark.primary : Colors.dark.tabIconDefault}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="flash-outline" size={24} color={Colors.dark.tabIconDefault} />
              <View>
                <Text style={styles.settingLabel}>Auto Focus Mode</Text>
                <Text style={styles.settingDescription}>Automatically enable at lesson start</Text>
              </View>
            </View>
            <Switch
              value={settings.focusModeAutoOn}
              onValueChange={(value) => updateSetting("focusModeAutoOn", value)}
              trackColor={{ false: Colors.dark.disabled, true: "rgba(46, 204, 64, 0.4)" }}
              thumbColor={settings.focusModeAutoOn ? Colors.dark.primary : Colors.dark.tabIconDefault}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="notifications-outline" size={24} color={Colors.dark.tabIconDefault} />
              <View>
                <Text style={styles.settingLabel}>Notifications</Text>
                <Text style={styles.settingDescription}>All notifications</Text>
              </View>
            </View>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={(value) => updateSetting("notificationsEnabled", value)}
              trackColor={{ false: Colors.dark.disabled, true: "rgba(46, 204, 64, 0.4)" }}
              thumbColor={settings.notificationsEnabled ? Colors.dark.primary : Colors.dark.tabIconDefault}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="alarm-outline" size={24} color={Colors.dark.tabIconDefault} />
              <View>
                <Text style={styles.settingLabel}>Lesson reminder</Text>
                <Text style={styles.settingDescription}>{settings.lessonReminderMinutes} min before lesson</Text>
              </View>
            </View>
            <Switch
              value={settings.lessonReminder}
              onValueChange={(value) => updateSetting("lessonReminder", value)}
              trackColor={{ false: Colors.dark.disabled, true: "rgba(46, 204, 64, 0.4)" }}
              thumbColor={settings.lessonReminder ? Colors.dark.primary : Colors.dark.tabIconDefault}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="warning-outline" size={24} color={Colors.dark.tabIconDefault} />
              <View>
                <Text style={styles.settingLabel}>Travel time warning</Text>
                <Text style={styles.settingDescription}>Alert for short travel time</Text>
              </View>
            </View>
            <Switch
              value={settings.travelTimeWarning}
              onValueChange={(value) => updateSetting("travelTimeWarning", value)}
              trackColor={{ false: Colors.dark.disabled, true: "rgba(46, 204, 64, 0.4)" }}
              thumbColor={settings.travelTimeWarning ? Colors.dark.primary : Colors.dark.tabIconDefault}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Offline & Sync</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="cloud-outline" size={24} color={Colors.dark.tabIconDefault} />
              <View>
                <Text style={styles.settingLabel}>Auto sync</Text>
                <Text style={styles.settingDescription}>Sync when online</Text>
              </View>
            </View>
            <Switch
              value={settings.offlineSyncAuto}
              onValueChange={(value) => updateSetting("offlineSyncAuto", value)}
              trackColor={{ false: Colors.dark.disabled, true: "rgba(46, 204, 64, 0.4)" }}
              thumbColor={settings.offlineSyncAuto ? Colors.dark.primary : Colors.dark.tabIconDefault}
            />
          </View>

          <Pressable style={styles.syncButton}>
            <Ionicons name="sync-outline" size={20} color={Colors.dark.primary} />
            <Text style={styles.syncButtonText}>Sync manually</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Build</Text>
            <Text style={styles.infoValue}>2024.12.26</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Pressable
            style={styles.logoutButton}
            onPress={() => {
              console.log("[SettingsScreen] Logout button pressed");
              if (Platform.OS === "web") {
                const confirmed = window.confirm("Are you sure you want to sign out?");
                if (confirmed) {
                  console.log("[SettingsScreen] Confirmed logout");
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
                        console.log("[SettingsScreen] Confirmed logout");
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        logout();
                      },
                    },
                  ]
                );
              }
            }}
          >
            <Ionicons name="log-out-outline" size={24} color={Colors.dark.error} />
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={showCourtModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCourtModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingCourt ? "Edit Court" : "Add Court"}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Court name"
              placeholderTextColor={Colors.dark.disabled}
              value={newCourtName}
              onChangeText={setNewCourtName}
              autoFocus
            />
            <Text style={styles.colorPickerLabel}>Court Color</Text>
            <View style={styles.colorPicker}>
              {COURT_COLORS.map((color) => (
                <Pressable
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    newCourtColor === color && styles.colorOptionSelected,
                  ]}
                  onPress={() => {
                    setNewCourtColor(color);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  {newCourtColor === color ? (
                    <Ionicons name="checkmark" size={16} color={Colors.dark.backgroundRoot} />
                  ) : null}
                </Pressable>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalCancelButton} onPress={() => setShowCourtModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.modalSaveButton, !newCourtName.trim() && styles.modalSaveButtonDisabled]} 
                onPress={handleSaveCourt}
                disabled={!newCourtName.trim()}
              >
                <Text style={styles.modalSaveText}>{editingCourt ? "Save" : "Add"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitial: {
    fontSize: 24,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  profileEmail: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  switchAppButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  switchAppContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  switchAppTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  switchAppDescription: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  settingInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  settingLabel: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  settingDescription: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  durationButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  durationButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  durationButtonActive: {
    backgroundColor: Colors.dark.primary + "30",
  },
  durationButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  durationButtonTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  weekButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  weekButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  weekButtonActive: {
    backgroundColor: Colors.dark.primary + "30",
  },
  weekButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  weekButtonTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  travelButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  travelButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  travelButtonActive: {
    backgroundColor: Colors.dark.primary + "30",
  },
  travelButtonText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  travelButtonTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
    borderStyle: "dashed",
  },
  syncButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.primary,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  infoLabel: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  infoValue: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  emptyStateSubtext: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  courtRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  courtInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  courtColorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  courtName: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  courtActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  courtActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
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
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 320,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  modalInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modalCancelButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  modalSaveButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
  },
  modalSaveButtonDisabled: {
    opacity: 0.5,
  },
  modalSaveText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  colorPickerLabel: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
  },
  colorPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  colorOptionSelected: {
    borderWidth: 2,
    borderColor: Colors.dark.text,
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
  },
  logoutText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.error,
  },
});
