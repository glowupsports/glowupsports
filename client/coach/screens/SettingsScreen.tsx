import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

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
  const { coach, focusMode, setFocusMode } = useCoach();
  const [settings, setSettings] = useState<CoachSettings>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);

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
      Alert.alert("Fout", "Instellingen opslaan mislukt");
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
        <Text style={styles.title}>Instellingen</Text>
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Standaard Instellingen</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="time-outline" size={24} color={Colors.dark.tabIconDefault} />
              <View>
                <Text style={styles.settingLabel}>Standaard lesduur</Text>
                <Text style={styles.settingDescription}>Voor nieuwe lessen</Text>
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
                <Text style={styles.settingLabel}>Standaard recurring</Text>
                <Text style={styles.settingDescription}>{settings.defaultRecurringWeeks} weken</Text>
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
                <Text style={styles.settingLabel}>Standaard reistijd</Text>
                <Text style={styles.settingDescription}>{settings.defaultTravelTime} minuten</Text>
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
          <Text style={styles.sectionTitle}>Focus Mode</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="eye-outline" size={24} color={Colors.dark.tabIconDefault} />
              <View>
                <Text style={styles.settingLabel}>Focus Mode nu</Text>
                <Text style={styles.settingDescription}>Verberg afleiding tijdens les</Text>
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
                <Text style={styles.settingDescription}>Automatisch aan bij les start</Text>
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
          <Text style={styles.sectionTitle}>Notificaties</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="notifications-outline" size={24} color={Colors.dark.tabIconDefault} />
              <View>
                <Text style={styles.settingLabel}>Notificaties</Text>
                <Text style={styles.settingDescription}>Alle meldingen</Text>
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
                <Text style={styles.settingLabel}>Les herinnering</Text>
                <Text style={styles.settingDescription}>{settings.lessonReminderMinutes} min voor les</Text>
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
                <Text style={styles.settingLabel}>Reistijd waarschuwing</Text>
                <Text style={styles.settingDescription}>Alert bij korte reistijd</Text>
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
                <Text style={styles.settingLabel}>Automatisch syncen</Text>
                <Text style={styles.settingDescription}>Sync bij online verbinding</Text>
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
            <Text style={styles.syncButtonText}>Handmatig syncen</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Versie</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Build</Text>
            <Text style={styles.infoValue}>2024.12.26</Text>
          </View>
        </View>
      </ScrollView>
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
});
