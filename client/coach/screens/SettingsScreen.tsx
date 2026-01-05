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
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { useCoach } from "@/coach/context/CoachContext";
import { useAppMode } from "@/context/AppModeContext";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useNavigation } from "@react-navigation/native";
import { useNetwork } from "@/context/NetworkContext";
import { showOfflineAlert } from "@/hooks/useOfflineGuard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Court {
  id: string;
  name: string;
  color: string | null;
  locationId: string | null;
  isActive: boolean;
}

const COURT_COLORS = [
  "#2ECC40",
  "#00D4FF",
  "#FF6B35",
  "#FFD700",
  "#9B59B6",
  "#E91E63",
  "#3498DB",
  "#95A5A6",
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function GlowSwitch({ value, onValueChange }: { value: boolean; onValueChange: (val: boolean) => void }) {
  const glowOpacity = useSharedValue(value ? 1 : 0);

  React.useEffect(() => {
    glowOpacity.value = withTiming(value ? 1 : 0, { duration: 200 });
  }, [value]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowOpacity.value, [0, 1], [0, 0.6]),
  }));

  return (
    <View style={styles.switchContainer}>
      <Animated.View style={[styles.switchGlow, glowStyle]} />
      <Switch
        value={value}
        onValueChange={(val) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onValueChange(val);
        }}
        trackColor={{ false: "rgba(80, 80, 80, 0.5)", true: "rgba(46, 204, 64, 0.4)" }}
        thumbColor={value ? Colors.dark.primary : Colors.dark.tabIconDefault}
        ios_backgroundColor="rgba(80, 80, 80, 0.5)"
      />
    </View>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: string }) {
  return (
    <View style={styles.sectionHeaderContainer}>
      <View style={styles.sectionHeaderContent}>
        {icon ? (
          <Ionicons name={icon as any} size={16} color={Colors.dark.xpCyan} style={styles.sectionIcon} />
        ) : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <LinearGradient
        colors={[Colors.dark.primary, Colors.dark.xpCyan, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.sectionUnderline}
      />
    </View>
  );
}

function GradientButton({ 
  onPress, 
  label, 
  icon, 
  colors = [Colors.dark.xpCyan, Colors.dark.primary],
  disabled = false,
  loading = false,
}: { 
  onPress: () => void; 
  label: string; 
  icon?: string;
  colors?: string[];
  disabled?: boolean;
  loading?: boolean;
}) {
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || loading}
      onPressIn={() => { scale.value = withSpring(0.96); }}
      onPressOut={() => { scale.value = withSpring(1); }}
      style={[animatedStyle, disabled && { opacity: 0.5 }]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientButton}
      >
        {loading ? (
          <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
        ) : (
          <>
            {icon ? <Ionicons name={icon as any} size={18} color={Colors.dark.backgroundRoot} /> : null}
            <Text style={styles.gradientButtonText}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </AnimatedPressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const queryClient = useQueryClient();
  const navigation = useNavigation<any>();
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
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testBookingLoading, setTestBookingLoading] = useState(false);

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

  const handleTestBookingRequest = async () => {
    setTestBookingLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const response = await apiRequest("POST", "/api/coach/test/booking-request", {});
      const data = response as unknown as { success: boolean; simulation: { playerName: string; sessionType: string; notificationSent: boolean } };
      const message = data.simulation.notificationSent 
        ? `Simulated: "${data.simulation.playerName}" requested a ${data.simulation.sessionType}! Push notification sent.`
        : `Simulated booking request. (No push token - open app on phone first)`;
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Simulation Complete", message);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Failed to simulate booking request";
      if (Platform.OS === "web") {
        window.alert(errMsg);
      } else {
        Alert.alert("Error", errMsg);
      }
    } finally {
      setTestBookingLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerAccentLine}
        />
        <LinearGradient
          colors={["rgba(46, 204, 64, 0.15)", "rgba(0, 212, 255, 0.08)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.headerGradientBg}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerIconWrapper}>
              <Ionicons name="settings" size={20} color={Colors.dark.xpCyan} />
            </View>
            <Text style={styles.title}>SETTINGS</Text>
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {coach ? (
          <View style={styles.profileCard}>
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.profileTopAccent}
            />
            <View style={styles.profileContent}>
              <View style={styles.profileAvatar}>
                <LinearGradient
                  colors={[Colors.dark.primary + "40", Colors.dark.xpCyan + "20"]}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.profileInitial}>{coach.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{coach.name}</Text>
                {coach.email ? <Text style={styles.profileEmail}>{coach.email}</Text> : null}
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader title="Default Settings" icon="options-outline" />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="time-outline" size={20} color={Colors.dark.xpCyan} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Default lesson duration</Text>
                <Text style={styles.settingDescription}>For new lessons</Text>
              </View>
            </View>
            <View style={styles.durationButtons}>
              {[60, 90].map((mins) => (
                <Pressable
                  key={mins}
                  style={[
                    styles.optionButton,
                    settings.defaultDuration === mins && styles.optionButtonActive,
                  ]}
                  onPress={() => updateSetting("defaultDuration", mins as 60 | 90)}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      settings.defaultDuration === mins && styles.optionButtonTextActive,
                    ]}
                  >
                    {mins}m
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="repeat-outline" size={20} color={Colors.dark.xpCyan} />
              </View>
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
                    styles.circleButton,
                    settings.defaultRecurringWeeks === weeks && styles.circleButtonActive,
                  ]}
                  onPress={() => updateSetting("defaultRecurringWeeks", weeks)}
                >
                  <Text
                    style={[
                      styles.circleButtonText,
                      settings.defaultRecurringWeeks === weeks && styles.circleButtonTextActive,
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
              <View style={styles.settingIconWrapper}>
                <Ionicons name="car-outline" size={20} color={Colors.dark.xpCyan} />
              </View>
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
                    styles.smallCircleButton,
                    settings.defaultTravelTime === mins && styles.smallCircleButtonActive,
                  ]}
                  onPress={() => updateSetting("defaultTravelTime", mins)}
                >
                  <Text
                    style={[
                      styles.smallCircleButtonText,
                      settings.defaultTravelTime === mins && styles.smallCircleButtonTextActive,
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
          <View style={styles.sectionHeaderRow}>
            <SectionHeader title="Courts" icon="tennisball-outline" />
            <Pressable style={styles.addCourtButton} onPress={handleAddCourt}>
              <LinearGradient
                colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addCourtButtonGradient}
              >
                <Ionicons name="add" size={18} color={Colors.dark.backgroundRoot} />
              </LinearGradient>
            </Pressable>
          </View>

          {courts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="tennisball-outline" size={32} color={Colors.dark.tabIconDefault} />
              <Text style={styles.emptyStateText}>No courts yet</Text>
              <Text style={styles.emptyStateSubtext}>Add your first court to get started</Text>
            </View>
          ) : (
            courts.map((court) => (
              <View key={court.id} style={styles.courtCard}>
                <View style={[styles.courtColorBar, { backgroundColor: court.color || Colors.dark.primary }]} />
                <View style={styles.courtCardContent}>
                  <View style={styles.courtInfo}>
                    <View style={[styles.courtColorDot, { backgroundColor: court.color || Colors.dark.primary }]}>
                      <View style={[styles.courtColorDotGlow, { backgroundColor: court.color || Colors.dark.primary }]} />
                    </View>
                    <Text style={styles.courtName}>{court.name}</Text>
                  </View>
                  <View style={styles.courtActions}>
                    <Pressable 
                      style={styles.courtActionButton} 
                      onPress={() => handleEditCourt(court)}
                    >
                      <Ionicons name="pencil" size={16} color={Colors.dark.xpCyan} />
                    </Pressable>
                    <Pressable 
                      style={[styles.courtActionButton, styles.courtDeleteButton]} 
                      onPress={() => handleDeleteCourt(court)}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Focus Mode" icon="eye-outline" />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="eye-outline" size={20} color={Colors.dark.xpCyan} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Focus Mode now</Text>
                <Text style={styles.settingDescription}>Hide distractions during lessons</Text>
              </View>
            </View>
            <GlowSwitch value={focusMode} onValueChange={setFocusMode} />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="flash-outline" size={20} color={Colors.dark.gold} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Auto Focus Mode</Text>
                <Text style={styles.settingDescription}>Automatically enable at lesson start</Text>
              </View>
            </View>
            <GlowSwitch 
              value={settings.focusModeAutoOn} 
              onValueChange={(value) => updateSetting("focusModeAutoOn", value)} 
            />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Notifications" icon="notifications-outline" />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="notifications-outline" size={20} color={Colors.dark.xpCyan} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Notifications</Text>
                <Text style={styles.settingDescription}>All notifications</Text>
              </View>
            </View>
            <GlowSwitch 
              value={settings.notificationsEnabled} 
              onValueChange={(value) => updateSetting("notificationsEnabled", value)} 
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="alarm-outline" size={20} color={Colors.dark.orange} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Lesson reminder</Text>
                <Text style={styles.settingDescription}>{settings.lessonReminderMinutes} min before lesson</Text>
              </View>
            </View>
            <GlowSwitch 
              value={settings.lessonReminder} 
              onValueChange={(value) => updateSetting("lessonReminder", value)} 
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="warning-outline" size={20} color={Colors.dark.gold} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Travel time warning</Text>
                <Text style={styles.settingDescription}>Alert for short travel time</Text>
              </View>
            </View>
            <GlowSwitch 
              value={settings.travelTimeWarning} 
              onValueChange={(value) => updateSetting("travelTimeWarning", value)} 
            />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Offline & Sync" icon="cloud-outline" />

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="cloud-outline" size={20} color={Colors.dark.xpCyan} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Auto sync</Text>
                <Text style={styles.settingDescription}>Sync when online</Text>
              </View>
            </View>
            <GlowSwitch 
              value={settings.offlineSyncAuto} 
              onValueChange={(value) => updateSetting("offlineSyncAuto", value)} 
            />
          </View>

          <View style={styles.syncButtonContainer}>
            <GradientButton
              onPress={() => {}}
              label="Sync manually"
              icon="sync-outline"
            />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Feedback & Reputation" icon="star-outline" />
          <Pressable 
            style={styles.linkRow}
            onPress={() => (navigation.getParent() as any)?.navigate("MyReviews")}
          >
            <View style={styles.settingInfo}>
              <View style={[styles.settingIconWrapper, { backgroundColor: Colors.dark.gold + "20" }]}>
                <Ionicons name="star" size={20} color={Colors.dark.gold} />
              </View>
              <View>
                <Text style={styles.settingLabel}>My Reviews</Text>
                <Text style={styles.settingDescription}>View and respond to player feedback</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.xpCyan} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Team & Invitations" icon="people-outline" />
          <Pressable 
            style={styles.linkRow}
            onPress={() => (navigation.getParent() as any)?.navigate("CoachInvitations")}
          >
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="mail-outline" size={20} color={Colors.dark.xpCyan} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Coach Invitations</Text>
                <Text style={styles.settingDescription}>Manage invitations to/from academies</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.xpCyan} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <SectionHeader title="App Info" icon="information-circle-outline" />
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Version</Text>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>
            <View style={styles.infoRowDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Build</Text>
              <Text style={styles.infoValue}>2024.12.26</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.devToolsHeader}>
            <Ionicons name="code-slash" size={16} color="#E67E22" />
            <Text style={styles.devToolsTitle}>DEVELOPER TOOLS</Text>
          </View>
          <View style={styles.devToolsCard}>
            <Text style={styles.devToolsNote}>
              Test push notifications and simulate events. Requires Expo Go with notifications enabled.
            </Text>
            
            <GradientButton
              onPress={handleTestPushNotification}
              label="Test Push Notification"
              icon="notifications"
              colors={["#E67E22", "#D35400"]}
              loading={testPushLoading}
            />

            <GradientButton
              onPress={handleTestBookingRequest}
              label="Simulate Booking Request"
              icon="calendar"
              colors={["#E67E22", "#D35400"]}
              loading={testBookingLoading}
            />
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
            <LinearGradient
              colors={[Colors.dark.error, "#C0392B"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.logoutButtonGradient}
            >
              <Ionicons name="log-out-outline" size={22} color={Colors.dark.text} />
              <Text style={styles.logoutText}>Sign Out</Text>
            </LinearGradient>
            <View style={styles.logoutGlow} />
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
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalAccent}
            />
            <Text style={styles.modalTitle}>{editingCourt ? "EDIT COURT" : "ADD COURT"}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Court name"
              placeholderTextColor={Colors.dark.textMuted}
              value={newCourtName}
              onChangeText={setNewCourtName}
              autoFocus
            />
            <Text style={styles.colorPickerLabel}>COURT COLOR</Text>
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
                style={[styles.modalSaveButtonWrapper, !newCourtName.trim() && { opacity: 0.5 }]} 
                onPress={handleSaveCourt}
                disabled={!newCourtName.trim()}
              >
                <LinearGradient
                  colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalSaveButton}
                >
                  <Text style={styles.modalSaveText}>{editingCourt ? "Save" : "Add"}</Text>
                </LinearGradient>
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
    marginBottom: Spacing.md,
  },
  headerAccentLine: {
    height: 3,
    width: "100%",
  },
  headerGradientBg: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 3,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  profileCard: {
    marginBottom: Spacing.xl,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    backgroundColor: "rgba(20, 20, 20, 0.9)",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  profileTopAccent: {
    height: 3,
  },
  profileContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.dark.primary + "60",
  },
  profileInitial: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  profileEmail: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeaderContainer: {
    marginBottom: Spacing.md,
  },
  sectionHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  sectionIcon: {
    marginRight: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  sectionUnderline: {
    height: 2,
    width: "60%",
    borderRadius: 1,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(20, 20, 20, 0.85)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(20, 20, 20, 0.85)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  settingInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  settingIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(0, 212, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  settingDescription: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  switchContainer: {
    position: "relative",
  },
  switchGlow: {
    position: "absolute",
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
      },
    }),
  },
  durationButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  optionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(60, 60, 60, 0.5)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  optionButtonActive: {
    backgroundColor: Colors.dark.primary + "30",
    borderColor: Colors.dark.primary,
  },
  optionButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  optionButtonTextActive: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  weekButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  circleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(60, 60, 60, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  circleButtonActive: {
    backgroundColor: Colors.dark.primary + "30",
    borderColor: Colors.dark.primary,
  },
  circleButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  circleButtonTextActive: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  travelButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  smallCircleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(60, 60, 60, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  smallCircleButtonActive: {
    backgroundColor: Colors.dark.primary + "30",
    borderColor: Colors.dark.primary,
  },
  smallCircleButtonText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
  },
  smallCircleButtonTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  addCourtButton: {
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  addCourtButtonGradient: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    backgroundColor: "rgba(20, 20, 20, 0.85)",
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderStyle: "dashed",
  },
  emptyStateText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    marginTop: Spacing.md,
    fontWeight: "600",
  },
  emptyStateSubtext: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  courtCard: {
    flexDirection: "row",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(20, 20, 20, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  courtColorBar: {
    width: 4,
  },
  courtCardContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  courtInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  courtColorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  courtColorDotGlow: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    opacity: 0.3,
  },
  courtName: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  courtActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  courtActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 212, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  courtDeleteButton: {
    backgroundColor: "rgba(255, 68, 68, 0.12)",
  },
  syncButtonContainer: {
    marginTop: Spacing.sm,
  },
  gradientButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  gradientButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  infoCard: {
    backgroundColor: "rgba(20, 20, 20, 0.85)",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  infoRowDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  infoLabel: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
  },
  infoValue: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  devToolsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  devToolsTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E67E22",
    letterSpacing: 2,
  },
  devToolsCard: {
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(230, 126, 34, 0.3)",
    backgroundColor: "rgba(230, 126, 34, 0.05)",
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  devToolsNote: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    lineHeight: 18,
  },
  logoutButton: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    position: "relative",
  },
  logoutButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  logoutGlow: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: BorderRadius.lg + 2,
    borderWidth: 2,
    borderColor: Colors.dark.error + "40",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.error,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
    }),
  },
  logoutText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    width: "100%",
    maxWidth: 340,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  modalAccent: {
    height: 3,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    textAlign: "center",
    letterSpacing: 2,
  },
  modalInput: {
    backgroundColor: "rgba(60, 60, 60, 0.5)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  colorPickerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    letterSpacing: 1,
  },
  colorPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorOptionSelected: {
    borderColor: Colors.dark.text,
    transform: [{ scale: 1.1 }],
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  modalCancelButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(60, 60, 60, 0.5)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  modalCancelText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  modalSaveButtonWrapper: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  modalSaveButton: {
    padding: Spacing.md,
    alignItems: "center",
  },
  modalSaveText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
});
