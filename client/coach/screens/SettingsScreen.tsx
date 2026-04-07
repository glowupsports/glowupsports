import logger from "@/lib/logger";
import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  TextInput,
  Modal,
  Platform,
  ActivityIndicator,
  Dimensions,
  Linking,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

const TAB_BAR_HEIGHT = 80;
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
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors, FunctionColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { CoachStackParamList } from "@/coach/navigation/CoachNavigator";
import { useNetwork } from "@/context/NetworkContext";
import { showOfflineAlert } from "@/hooks/useOfflineGuard";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, setStoredLanguage, type LanguageCode } from "@/i18n";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Court {
  id: string;
  name: string;
  color: string | null;
  locationId: string | null;
  isActive: boolean;
  position: number;
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

interface Location {
  id: string;
  name: string;
  academyId: string | null;
}

interface TravelTimeConfig {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  travelTimeMinutes: number;
}

interface PushPreferences {
  sessionReminders: boolean;
  feedbackRequests: boolean;
  packageExpiry: boolean;
  loadWarnings: boolean;
  chatMessages: boolean;
  reminderMinutesBefore: number;
}

const TRAVEL_TIME_OPTIONS = [15, 30, 45, 60, 90, 120];

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
  const translateX = useSharedValue(value ? 20 : 0);
  const bgColor = useSharedValue(value ? 1 : 0);

  React.useEffect(() => {
    translateX.value = withSpring(value ? 20 : 0, { damping: 15 });
    bgColor.value = withTiming(value ? 1 : 0, { duration: 200 });
  }, [value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: bgColor.value > 0.5 ? Colors.dark.primary : 'rgba(255,255,255,0.15)',
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => onValueChange(!value)}
      style={[{ width: 50, height: 30, borderRadius: 15, justifyContent: 'center', paddingHorizontal: 3 }, trackStyle]}
    >
      <Animated.View style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }, thumbStyle]} />
    </AnimatedPressable>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 }}>
      <Ionicons name={icon as any} size={18} color={Colors.dark.xpCyan} />
      <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>{title}</Text>
    </View>
  );
}

function GradientButton({ onPress, title, label, icon }: { onPress: () => void; title?: string; label?: string; icon?: string }) {
  const displayText = title || label || '';
  return (
    <Pressable onPress={onPress}>
      <LinearGradient
        colors={[Colors.dark.xpCyan, Colors.dark.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, gap: 8 }}
      >
        {icon ? <Ionicons name={icon as any} size={18} color={Colors.dark.backgroundRoot} /> : null}
        <Text style={{ color: Colors.dark.backgroundRoot, fontSize: 14, fontWeight: '700' }}>{displayText}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { coach, academy, calendarData } = useCoach();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<CoachStackParamList>>();
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [settings, setSettings] = useState<CoachSettings>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testBookingLoading, setTestBookingLoading] = useState(false);
  const [showCourtModal, setShowCourtModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showTravelTimeModal, setShowTravelTimeModal] = useState(false);
  const [showDeleteTravelTimeModal, setShowDeleteTravelTimeModal] = useState(false);
  const [newCourtName, setNewCourtName] = useState('');
  const [newCourtColor, setNewCourtColor] = useState('');
  const [newCourtLocationId, setNewCourtLocationId] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [courtsCollapsed, setCourtsCollapsed] = useState(true);
  const [locationsCollapsed, setLocationsCollapsed] = useState(true);
  const [travelTimesExpanded, setTravelTimesExpanded] = useState(false);
  const [defaultSettingsCollapsed, setDefaultSettingsCollapsed] = useState(true);
  const [focusModeCollapsed, setFocusModeCollapsed] = useState(true);
  const [notificationsCollapsed, setNotificationsCollapsed] = useState(true);
  const [feedbackCollapsed, setFeedbackCollapsed] = useState(true);
  const [teamCollapsed, setTeamCollapsed] = useState(true);
  const [languageCollapsed, setLanguageCollapsed] = useState(true);
  const [appInfoCollapsed, setAppInfoCollapsed] = useState(true);
  const [legalCollapsed, setLegalCollapsed] = useState(true);
  const [appleSignInCollapsed, setAppleSignInCollapsed] = useState(true);
  const [selectedTravelTime, setSelectedTravelTime] = useState<any>(null);
  const [travelTimeToDelete, setTravelTimeToDelete] = useState<any>(null);
  const [storedLanguage, setStoredLanguage] = useState('en');
  const [editingCourt, setEditingCourt] = useState<any>(null);
  const [editingLocation, setEditingLocation] = useState<any>(null);
  const [pushPreferences, setPushPreferences] = useState({ sessionReminders: true, feedbackRequests: true, packageExpiry: true, loadWarnings: true, chatMessages: true });
  const [appleLinked, setAppleLinked] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [fromCourtId, setFromCourtId] = useState<string>('');
  const [toCourtId, setToCourtId] = useState<string>('');
  const [fromLocationId, setFromLocationId] = useState<string>('');
  const [toLocationId, setToLocationId] = useState<string>('');

  const queryClient = useQueryClient();
  const tabBarHeight = insets.bottom + 60;

  const courts = calendarData?.courts || [];
  const locations = calendarData?.locations || [];

  const sortedCourts = useMemo(() => {
    return [...courts].sort((a: any, b: any) => (a.position ?? 999) - (b.position ?? 999));
  }, [courts]);

  const { data: travelTimes = [] } = useQuery<any[]>({
    queryKey: ['/api/coach/travel-times'],
  });

  const reorderCourtsMutation = useMutation({
    mutationFn: async (data: { courtId: string; direction: string }) => {
      const response = await fetch('/api/coach/courts/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/coach/courts'] }); },
  });

  const courtsGroupedByLocation = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const court of sortedCourts) {
      const locId = court.locationId || 'unassigned';
      if (!groups[locId]) groups[locId] = [];
      groups[locId].push(court);
    }
    return Object.entries(groups).map(([locId, groupCourts]) => ({
      location: locId === 'unassigned' ? null : locations.find((l: any) => l.id === locId) || null,
      courts: groupCourts,
    }));
  }, [sortedCourts, locations]);

  const getLocationName = (locationId: string) => {
    const loc = locations.find((l: any) => l.id === locationId);
    return loc?.name || 'Unknown Location';
  };

  const getCourtsForTravelTimeDisplay = (locationId: string) => {
    return courts.filter((c: any) => c.locationId === locationId).map((c: any) => c.name).join(', ');
  };

  const getCourtLabel = (courtOrId: any) => {
    if (typeof courtOrId === 'object') return courtOrId?.name || 'Unknown Court';
    const court = courts.find((c: any) => c.id === courtOrId);
    return court?.name || 'Unknown Court';
  };

  const moveCourt = (courtId: string, direction: string) => {
    reorderCourtsMutation.mutate({ courtId, direction });
  };

  const updatePushPref = (key: string, value: boolean) => {
    setPushPreferences(prev => ({ ...prev, [key]: value }));
  };

  const handleLanguageChange = async (lang: string) => {
    try {
      i18n.changeLanguage(lang);
      await AsyncStorage.setItem('language', lang);
      setStoredLanguage(lang);
    } catch (e) {}
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account?\n\nThis will immediately erase all your data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "This is your last chance. Your account and all data will be permanently deleted right now. Are you absolutely sure?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete My Account",
                  style: "destructive",
                  onPress: async () => {
                    setDeleteAccountLoading(true);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    try {
                      await apiRequest("DELETE", "/api/player/me/account", undefined);
                      Alert.alert(
                        "Account Deleted",
                        "Your account has been permanently deleted. A confirmation has been sent to your email address.",
                        [{ text: "OK", onPress: () => { setTimeout(() => { logout(); }, 350); } }]
                      );
                    } catch (error: any) {
                      Alert.alert("Error", error?.message || "Failed to delete account. Please contact support@glowupsports.com");
                    } finally {
                      setDeleteAccountLoading(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleAddCourt = () => { setEditingCourt(null); setNewCourtName(''); setNewCourtColor(''); setNewCourtLocationId(''); setShowCourtModal(true); };
  const handleEditCourt = (court: any) => { setEditingCourt(court); setNewCourtName(court.name || ''); setNewCourtColor(court.color || ''); setNewCourtLocationId(court.locationId || ''); setShowCourtModal(true); };
  const handleDeleteCourt = (court: any) => { Alert.alert('Delete Court', `Delete "${court.name}"?`, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { fetch(`/api/coach/courts/${court.id}`, { method: 'DELETE' }).then(() => queryClient.invalidateQueries({ queryKey: ['/api/coach/courts'] })); } }]); };
  const handleSaveCourt = async () => { /* stub */ setShowCourtModal(false); };
  const handleAddLocation = () => { setEditingLocation(null); setNewLocationName(''); setShowLocationModal(true); };
  const handleEditLocation = (location: any) => { setEditingLocation(location); setNewLocationName(location.name || ''); setShowLocationModal(true); };
  const handleDeleteLocation = (location: any) => { Alert.alert('Delete Location', `Delete "${location.name}"?`, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { fetch(`/api/coach/locations/${location.id}`, { method: 'DELETE' }).then(() => queryClient.invalidateQueries({ queryKey: ['/api/coach/locations'] })); } }]); };
  const handleSaveLocation = async () => { /* stub */ setShowLocationModal(false); };
  const handleAddTravelTime = () => { setFromCourtId(''); setToCourtId(''); setFromLocationId(''); setToLocationId(''); setShowTravelTimeModal(true); };
  const handleDeleteTravelTime = (id: any, fromName?: string, toName?: string) => { setTravelTimeToDelete({ id, fromName, toName }); setShowDeleteTravelTimeModal(true); };
  const confirmDeleteTravelTime = async () => { if (travelTimeToDelete) { await fetch(`/api/coach/travel-times/${travelTimeToDelete.id}`, { method: 'DELETE' }); queryClient.invalidateQueries({ queryKey: ['/api/coach/travel-times'] }); } setShowDeleteTravelTimeModal(false); setTravelTimeToDelete(null); };
  const handleSelectFromCourt = (court: any) => { setFromCourtId(court.id || court); setFromLocationId(court.locationId || ''); };
  const handleSelectToCourt = (court: any) => { setToCourtId(court.id || court); setToLocationId(court.locationId || ''); };
  const handleSaveTravelTime = async () => { setShowTravelTimeModal(false); };
  const handleLinkApple = async () => { setAppleLoading(true); try { /* stub */ } finally { setAppleLoading(false); } };
  const handleUnlinkApple = async () => { setAppleLoading(true); try { setAppleLinked(false); } finally { setAppleLoading(false); } };

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
      const data = await response.json();
      const deviceCount = data.devicesNotified ?? 1;
      const message = `Test notification sent to ${deviceCount} device(s). Check your phone!`;
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
      const data = await response.json() as { success: boolean; simulation: { playerName: string; sessionType: string; notificationSent: boolean } };
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
            <Text style={styles.title}>{t('coach.settings.title').toUpperCase()}</Text>
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
          <Pressable
            style={styles.sectionHeaderRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setDefaultSettingsCollapsed(!defaultSettingsCollapsed);
            }}
          >
            <View style={styles.sectionHeaderWithChevron}>
              <SectionHeader title="Default Settings" icon="options-outline" />
              <Ionicons
                name={defaultSettingsCollapsed ? "chevron-down" : "chevron-up"}
                size={20}
                color={Colors.dark.tabIconDefault}
                style={{ marginLeft: Spacing.sm }}
              />
            </View>
          </Pressable>

          {!defaultSettingsCollapsed ? <>
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
          </> : null}
        </View>
        

        
        <View style={styles.section}>
          <Pressable 
            style={styles.sectionHeaderRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setLocationsCollapsed(!locationsCollapsed);
            }}
          >
            <View style={styles.sectionHeaderWithChevron}>
              <SectionHeader title="Locations" icon="location-outline" />
              <Ionicons 
                name={locationsCollapsed ? "chevron-down" : "chevron-up"} 
                size={20} 
                color={Colors.dark.tabIconDefault} 
                style={{ marginLeft: Spacing.sm }}
              />
              <Text style={styles.courtCount}>({locations.length})</Text>
            </View>
            <Pressable 
              style={styles.addCourtButton} 
              onPress={(e) => {
                e.stopPropagation?.();
                handleAddLocation();
              }}
            >
              <LinearGradient
                colors={[Colors.dark.gold, Colors.dark.orange]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addCourtButtonGradient}
              >
                <Ionicons name="add" size={18} color={Colors.dark.backgroundRoot} />
              </LinearGradient>
            </Pressable>
          </Pressable>

          {!locationsCollapsed ? (
            locations.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="location-outline" size={32} color={Colors.dark.tabIconDefault} />
                <Text style={styles.emptyStateText}>No locations yet</Text>
                <Text style={styles.emptyStateSubtext}>Add locations to group your courts</Text>
              </View>
            ) : (
              locations.map((location) => {
                const courtsAtLocation = courts.filter(c => c.locationId === location.id);
                return (
                  <View key={location.id} style={styles.courtCard}>
                    <View style={[styles.courtColorBar, { backgroundColor: Colors.dark.gold }]} />
                    <View style={styles.courtCardContent}>
                      <View style={styles.courtInfo}>
                        <View style={[styles.courtColorDot, { backgroundColor: Colors.dark.gold }]}>
                          <Ionicons name="location" size={14} color={Colors.dark.backgroundRoot} />
                        </View>
                        <View>
                          <Text style={styles.courtName}>{location.name}</Text>
                        </View>
                      </View>
                      <View style={styles.courtActions}>
                        <View style={styles.locationCourtBadge}>
                          <Text style={styles.locationCourtBadgeText}>{courtsAtLocation.length} courts</Text>
                        </View>
                        <Pressable 
                          style={styles.courtActionButton} 
                          onPress={() => handleEditLocation(location)}
                        >
                          <Ionicons name="pencil" size={16} color={Colors.dark.xpCyan} />
                        </Pressable>
                        <Pressable 
                          style={[styles.courtActionButton, styles.courtDeleteButton]} 
                          onPress={() => handleDeleteLocation(location)}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })
            )
          ) : null}
        </View>
        

        <View style={styles.section}>
          <Pressable 
            style={styles.sectionHeaderRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setCourtsCollapsed(!courtsCollapsed);
            }}
          >
            <View style={styles.sectionHeaderWithChevron}>
              <SectionHeader title="Courts" icon="tennisball-outline" />
              <Ionicons 
                name={courtsCollapsed ? "chevron-down" : "chevron-up"} 
                size={20} 
                color={Colors.dark.tabIconDefault} 
                style={{ marginLeft: Spacing.sm }}
              />
              <Text style={styles.courtCount}>({sortedCourts.length})</Text>
            </View>
            <Pressable 
              style={styles.addCourtButton} 
              onPress={(e) => {
                e.stopPropagation?.();
                handleAddCourt();
              }}
            >
              <LinearGradient
                colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addCourtButtonGradient}
              >
                <Ionicons name="add" size={18} color={Colors.dark.backgroundRoot} />
              </LinearGradient>
            </Pressable>
          </Pressable>

          {!courtsCollapsed ? (
            sortedCourts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="tennisball-outline" size={32} color={Colors.dark.tabIconDefault} />
                <Text style={styles.emptyStateText}>No courts yet</Text>
                <Text style={styles.emptyStateSubtext}>Add your first court to get started</Text>
              </View>
            ) : (
              courtsGroupedByLocation.map((group, groupIndex) => (
                <View key={group.location?.id || "unassigned"} style={styles.locationGroup}>
                  <View style={styles.locationGroupHeader}>
                    <Ionicons 
                      name="location-outline" 
                      size={14} 
                      color={group.location ? Colors.dark.gold : Colors.dark.tabIconDefault} 
                    />
                    <Text style={[
                      styles.locationGroupName,
                      !group.location && { color: Colors.dark.tabIconDefault, fontStyle: "italic" }
                    ]}>
                      {group.location?.name || "No Location"}
                    </Text>
                    <Text style={styles.locationGroupCount}>({group.courts.length})</Text>
                  </View>
                  {group.courts.map((court, index) => {
                    const globalIndex = sortedCourts.findIndex(c => c.id === court.id);
                    return (
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
                              style={[styles.courtMoveButton, globalIndex === 0 && styles.courtMoveButtonDisabled]} 
                              onPress={() => moveCourt(court.id, "up")}
                              disabled={globalIndex === 0 || reorderCourtsMutation.isPending}
                            >
                              <Ionicons name="chevron-up" size={16} color={globalIndex === 0 ? Colors.dark.tabIconDefault : Colors.dark.text} />
                            </Pressable>
                            <Pressable 
                              style={[styles.courtMoveButton, globalIndex === sortedCourts.length - 1 && styles.courtMoveButtonDisabled]} 
                              onPress={() => moveCourt(court.id, "down")}
                              disabled={globalIndex === sortedCourts.length - 1 || reorderCourtsMutation.isPending}
                            >
                              <Ionicons name="chevron-down" size={16} color={globalIndex === sortedCourts.length - 1 ? Colors.dark.tabIconDefault : Colors.dark.text} />
                            </Pressable>
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
                    );
                  })}
                </View>
              ))
            )
          ) : null}
        </View>

        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeaderRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFocusModeCollapsed(!focusModeCollapsed);
            }}
          >
            <View style={styles.sectionHeaderWithChevron}>
              <SectionHeader title="Focus Mode" icon="eye-outline" />
              <Ionicons
                name={focusModeCollapsed ? "chevron-down" : "chevron-up"}
                size={20}
                color={Colors.dark.tabIconDefault}
                style={{ marginLeft: Spacing.sm }}
              />
            </View>
          </Pressable>

          {!focusModeCollapsed ? <>
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
          </> : null}
        </View>

        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeaderRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setNotificationsCollapsed(!notificationsCollapsed);
            }}
          >
            <View style={styles.sectionHeaderWithChevron}>
              <SectionHeader title="Notifications" icon="notifications-outline" />
              <Ionicons
                name={notificationsCollapsed ? "chevron-down" : "chevron-up"}
                size={20}
                color={Colors.dark.tabIconDefault}
                style={{ marginLeft: Spacing.sm }}
              />
            </View>
          </Pressable>
          {!notificationsCollapsed ? <>

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

          <View style={styles.settingRowDivider} />
          <Text style={styles.subsectionLabel}>Push Notification Types</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="calendar-outline" size={20} color={Colors.dark.xpCyan} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Session reminders</Text>
                <Text style={styles.settingDescription}>Get notified before sessions</Text>
              </View>
            </View>
            <GlowSwitch 
              value={pushPreferences.sessionReminders} 
              onValueChange={(value) => updatePushPref("sessionReminders", value)} 
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="star-outline" size={20} color={Colors.dark.gold} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Feedback requests</Text>
                <Text style={styles.settingDescription}>Reminders to submit player feedback</Text>
              </View>
            </View>
            <GlowSwitch 
              value={pushPreferences.feedbackRequests} 
              onValueChange={(value) => updatePushPref("feedbackRequests", value)} 
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="card-outline" size={20} color={Colors.dark.orange} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Package expiry</Text>
                <Text style={styles.settingDescription}>Alerts when player packages expire</Text>
              </View>
            </View>
            <GlowSwitch 
              value={pushPreferences.packageExpiry} 
              onValueChange={(value) => updatePushPref("packageExpiry", value)} 
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="speedometer-outline" size={20} color={Colors.dark.error} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Load warnings</Text>
                <Text style={styles.settingDescription}>High workload alerts</Text>
              </View>
            </View>
            <GlowSwitch 
              value={pushPreferences.loadWarnings} 
              onValueChange={(value) => updatePushPref("loadWarnings", value)} 
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="chatbubble-outline" size={20} color={Colors.dark.primary} />
              </View>
              <View>
                <Text style={styles.settingLabel}>Chat messages</Text>
                <Text style={styles.settingDescription}>New messages from players/parents</Text>
              </View>
            </View>
            <GlowSwitch 
              value={pushPreferences.chatMessages} 
              onValueChange={(value) => updatePushPref("chatMessages", value)} 
            />
          </View>
          </> : null}
        </View>

        <View style={styles.section}>
          <Pressable 
            style={styles.collapsibleHeader}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTravelTimesExpanded(!travelTimesExpanded);
            }}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Ionicons name="car-outline" size={18} color={Colors.dark.xpCyan} />
              <Text style={styles.collapsibleHeaderTitle}>Court Travel Times</Text>
              {travelTimes.length > 0 && (
                <View style={styles.collapsibleBadge}>
                  <Text style={styles.collapsibleBadgeText}>{travelTimes.length}</Text>
                </View>
              )}
            </View>
            <Ionicons 
              name={travelTimesExpanded ? "chevron-up" : "chevron-down"} 
              size={20} 
              color={Colors.dark.textMuted} 
            />
          </Pressable>
          
          {travelTimesExpanded && (
            <>
              <Text style={styles.sectionDescription}>
                Set travel time between courts at different locations to prevent scheduling conflicts
              </Text>
          
          {(() => {
            const courtsWithLocation = courts.filter(c => c.locationId);
            const uniqueLocationIds = [...new Set(courtsWithLocation.map(c => c.locationId))];
            const hasMultipleLocations = uniqueLocationIds.length >= 2;
            
            if (!hasMultipleLocations) {
              return (
                <View style={styles.emptyState}>
                  <Ionicons name="location-outline" size={32} color={Colors.dark.tabIconDefault} />
                  <Text style={styles.emptyStateText}>Add courts at 2+ different locations to configure travel times</Text>
                </View>
              );
            }
            
            return (
              <>
                {travelTimes.length > 0 ? (
                  <View style={styles.travelTimesList}>
                    {travelTimes.map((tt) => (
                      <View key={tt.id} style={styles.travelTimeCard}>
                        <View style={styles.travelTimeInfo}>
                          <View style={styles.travelTimeRoute}>
                            <View style={styles.travelTimeLocationGroup}>
                              <Text style={styles.travelTimeLocationName}>{getLocationName(tt.fromLocationId)}</Text>
                              <Text style={styles.travelTimeCourts}>{getCourtsForTravelTimeDisplay(tt.fromLocationId)}</Text>
                            </View>
                            <Ionicons name="arrow-forward" size={16} color={Colors.dark.xpCyan} />
                            <View style={styles.travelTimeLocationGroup}>
                              <Text style={styles.travelTimeLocationName}>{getLocationName(tt.toLocationId)}</Text>
                              <Text style={styles.travelTimeCourts}>{getCourtsForTravelTimeDisplay(tt.toLocationId)}</Text>
                            </View>
                          </View>
                          <View style={styles.travelTimeBadge}>
                            <Ionicons name="time-outline" size={14} color={Colors.dark.gold} />
                            <Text style={styles.travelTimeValue}>{tt.travelTimeMinutes} min</Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.5}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            handleDeleteTravelTime(tt.id, getLocationName(tt.fromLocationId), getLocationName(tt.toLocationId));
                          }}
                          style={styles.travelTimeDeleteBtn}
                          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                        >
                          <Ionicons name="trash-outline" size={22} color={Colors.dark.error} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="swap-horizontal-outline" size={32} color={Colors.dark.tabIconDefault} />
                    <Text style={styles.emptyStateText}>No travel times configured yet</Text>
                  </View>
                )}
                
                <View style={styles.syncButtonContainer}>
                  <GradientButton
                    onPress={handleAddTravelTime}
                    label="Add Travel Time"
                    icon="add-outline"
                  />
                </View>
              </>
            );
          })()}
            </>
          )}
        </View>

        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeaderRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFeedbackCollapsed(!feedbackCollapsed);
            }}
          >
            <View style={styles.sectionHeaderWithChevron}>
              <SectionHeader title="Feedback & Reputation" icon="star-outline" />
              <Ionicons
                name={feedbackCollapsed ? "chevron-down" : "chevron-up"}
                size={20}
                color={Colors.dark.tabIconDefault}
                style={{ marginLeft: Spacing.sm }}
              />
            </View>
          </Pressable>
          {!feedbackCollapsed ? <>
          <Pressable 
            style={styles.linkRow}
            onPress={() => (navigation.getParent() as any)?.navigate("MyReviews")}
          >
            <View style={styles.settingInfo}>
              <View style={[styles.settingIconWrapper, { backgroundColor: Colors.dark.gold + "20" }]}>
                <Ionicons name="star" size={20} color={Colors.dark.gold} />
              </View>
              <View>
                <Text style={styles.settingLabel}>{t('coach.settings.reviews')}</Text>
                <Text style={styles.settingDescription}>View and respond to player feedback</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.xpCyan} />
          </Pressable>
          </> : null}
        </View>

        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeaderRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTeamCollapsed(!teamCollapsed);
            }}
          >
            <View style={styles.sectionHeaderWithChevron}>
              <SectionHeader title="Team & Invitations" icon="people-outline" />
              <Ionicons
                name={teamCollapsed ? "chevron-down" : "chevron-up"}
                size={20}
                color={Colors.dark.tabIconDefault}
                style={{ marginLeft: Spacing.sm }}
              />
            </View>
          </Pressable>
          {!teamCollapsed ? <>
          <Pressable 
            style={styles.linkRow}
            onPress={() => (navigation.getParent() as any)?.navigate("CoachInvitations")}
          >
            <View style={styles.settingInfo}>
              <View style={styles.settingIconWrapper}>
                <Ionicons name="mail-outline" size={20} color={Colors.dark.xpCyan} />
              </View>
              <View>
                <Text style={styles.settingLabel}>{t('coach.settings.invitations')}</Text>
                <Text style={styles.settingDescription}>Manage invitations to/from academies</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.xpCyan} />
          </Pressable>
          <Pressable 
            style={styles.linkRow}
            onPress={() => navigation.navigate("TournamentManagement")}
          >
            <View style={styles.settingInfo}>
              <View style={[styles.settingIconWrapper, { backgroundColor: "#FFB02020" }]}>
                <Ionicons name="trophy-outline" size={20} color="#FFB020" />
              </View>
              <View>
                <Text style={styles.settingLabel}>Tournaments</Text>
                <Text style={styles.settingDescription}>Create and manage academy tournaments</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.xpCyan} />
          </Pressable>
          <Pressable
            style={styles.linkRow}
            onPress={() => navigation.navigate("AiUsage")}
          >
            <View style={styles.settingInfo}>
              <View style={[styles.settingIconWrapper, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                <Ionicons name="analytics-outline" size={20} color={Colors.dark.xpCyan} />
              </View>
              <View>
                <Text style={styles.settingLabel}>AI Usage</Text>
                <Text style={styles.settingDescription}>View AI call usage and estimated costs</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.xpCyan} />
          </Pressable>
          </> : null}
        </View>

        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeaderRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setLanguageCollapsed(!languageCollapsed);
            }}
          >
            <View style={styles.sectionHeaderWithChevron}>
              <SectionHeader title={t('player.settings.language')} icon="language-outline" />
              <Ionicons
                name={languageCollapsed ? "chevron-down" : "chevron-up"}
                size={20}
                color={Colors.dark.tabIconDefault}
                style={{ marginLeft: Spacing.sm }}
              />
            </View>
          </Pressable>
          {!languageCollapsed ? <>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <Pressable
              key={lang.code}
              style={styles.settingRow}
              onPress={() => handleLanguageChange(lang.code as LanguageCode)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${lang.label} language`}
            >
              <View style={styles.settingInfo}>
                <View style={styles.settingIconWrapper}>
                  <Ionicons name="language" size={20} color={Colors.dark.xpCyan} />
                </View>
                <View style={styles.languageTextContainer}>
                  <Text style={styles.settingLabel}>{lang.nativeLabel}</Text>
                  <Text style={styles.settingDescription}>{lang.label}</Text>
                </View>
              </View>
              <View style={[
                styles.radioOuter,
                i18n.language === lang.code && styles.radioOuterSelected
              ]}>
                {i18n.language === lang.code ? <View style={styles.radioInner} /> : null}
              </View>
            </Pressable>
          ))}
          </> : null}
        </View>

        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeaderRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAppInfoCollapsed(!appInfoCollapsed);
            }}
          >
            <View style={styles.sectionHeaderWithChevron}>
              <SectionHeader title="App Info" icon="information-circle-outline" />
              <Ionicons
                name={appInfoCollapsed ? "chevron-down" : "chevron-up"}
                size={20}
                color={Colors.dark.tabIconDefault}
                style={{ marginLeft: Spacing.sm }}
              />
            </View>
          </Pressable>
          {!appInfoCollapsed ? <>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Version</Text>
              <Text style={styles.infoValue}>{require("../../../app.json").expo.version}</Text>
            </View>
            <View style={styles.infoRowDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Build</Text>
              <Text style={styles.infoValue}>{new Date().toISOString().split("T")[0]}</Text>
            </View>
          </View>
          </> : null}
        </View>

        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeaderRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setLegalCollapsed(!legalCollapsed);
            }}
          >
            <View style={styles.sectionHeaderWithChevron}>
              <SectionHeader title="Legal" icon="document-text-outline" />
              <Ionicons
                name={legalCollapsed ? "chevron-down" : "chevron-up"}
                size={20}
                color={Colors.dark.tabIconDefault}
                style={{ marginLeft: Spacing.sm }}
              />
            </View>
          </Pressable>
          {!legalCollapsed ? <>
          <View style={styles.card}>
            <Pressable
              style={styles.settingRow}
              onPress={() => Linking.openURL("https://glowupsports.com/privacy")}
            >
              <View style={styles.settingInfo}>
                <Ionicons name="shield-checkmark-outline" size={22} color={Colors.dark.xpCyan} />
                <View>
                  <Text style={styles.settingLabel}>Privacy Policy</Text>
                  <Text style={styles.settingDescription}>How we handle your data</Text>
                </View>
              </View>
              <Ionicons name="open-outline" size={20} color={Colors.dark.xpCyan} />
            </Pressable>
            <View style={styles.settingDivider} />
            <Pressable
              style={styles.settingRow}
              onPress={() => Linking.openURL("https://glowupsports.com/terms")}
            >
              <View style={styles.settingInfo}>
                <Ionicons name="document-text-outline" size={22} color={Colors.dark.xpCyan} />
                <View>
                  <Text style={styles.settingLabel}>Terms of Service</Text>
                  <Text style={styles.settingDescription}>Usage terms and conditions</Text>
                </View>
              </View>
              <Ionicons name="open-outline" size={20} color={Colors.dark.xpCyan} />
            </Pressable>
          </View>
          </> : null}
        </View>

        {Platform.OS === "ios" ? (
          <View style={styles.section}>
            <Pressable
              style={styles.sectionHeaderRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAppleSignInCollapsed(!appleSignInCollapsed);
              }}
            >
              <View style={styles.sectionHeaderWithChevron}>
                <SectionHeader title="Apple Sign-In" icon="logo-apple" />
                <Ionicons
                  name={appleSignInCollapsed ? "chevron-down" : "chevron-up"}
                  size={20}
                  color={Colors.dark.tabIconDefault}
                  style={{ marginLeft: Spacing.sm }}
                />
              </View>
            </Pressable>
            {!appleSignInCollapsed ? <>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Ionicons name="logo-apple" size={22} color={Colors.dark.xpCyan} />
                  <View>
                    <Text style={styles.settingLabel}>
                      {appleLinked ? "Apple ID Linked" : "Link Apple ID"}
                    </Text>
                    <Text style={styles.settingDescription}>
                      {appleLinked ? "Your Apple ID is connected" : "Connect your Apple ID for quick sign-in"}
                    </Text>
                  </View>
                </View>
                {appleLoading ? (
                  <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
                ) : (
                  <Pressable
                    onPress={appleLinked ? handleUnlinkApple : handleLinkApple}
                    style={{
                      paddingHorizontal: Spacing.md,
                      paddingVertical: Spacing.xs,
                      borderRadius: BorderRadius.sm,
                      backgroundColor: appleLinked ? "rgba(255,76,77,0.15)" : "rgba(0,230,118,0.15)",
                    }}
                  >
                    <Text style={{
                      ...Typography.small,
                      fontWeight: "600",
                      color: appleLinked ? Colors.dark.error : "#00E676",
                    }}>
                      {appleLinked ? "Unlink" : "Link"}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
            </> : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <Pressable
            style={styles.logoutButton}
            onPress={() => {
              logger.log("[SettingsScreen] Logout button pressed");
              Alert.alert(
                "Sign Out",
                "Are you sure you want to sign out?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Sign Out",
                    style: "destructive",
                    onPress: () => {
                      logger.log("[SettingsScreen] Confirmed logout");
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      logout();
                    },
                  },
                ]
              );
            }}
          >
            <LinearGradient
              colors={[Colors.dark.error, "#C0392B"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.logoutButtonGradient}
            >
              <Ionicons name="log-out-outline" size={22} color={Colors.dark.text} />
              <Text style={styles.logoutText}>{t('common.logOut')}</Text>
            </LinearGradient>
            <View style={styles.logoutGlow} />
          </Pressable>
          <Pressable
            style={styles.deleteAccountButton}
            onPress={handleDeleteAccount}
            disabled={deleteAccountLoading}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
          >
            {deleteAccountLoading ? (
              <ActivityIndicator size="small" color={Colors.dark.error} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                <Text style={styles.deleteAccountText}>Delete Account</Text>
              </>
            )}
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
            <Text style={styles.colorPickerLabel}>LOCATION</Text>
            <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <View style={styles.locationPicker}>
                <Pressable
                  style={[
                    styles.locationOption,
                    !newCourtLocationId && styles.locationOptionSelected,
                  ]}
                  onPress={() => {
                    setNewCourtLocationId(null);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[
                    styles.locationOptionText,
                    !newCourtLocationId && styles.locationOptionTextSelected,
                  ]}>
                    No Location
                  </Text>
                </Pressable>
                {locations.map((location) => (
                  <Pressable
                    key={location.id}
                    style={[
                      styles.locationOption,
                      newCourtLocationId === location.id && styles.locationOptionSelected,
                    ]}
                    onPress={() => {
                      setNewCourtLocationId(location.id);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[
                      styles.locationOptionText,
                      newCourtLocationId === location.id && styles.locationOptionTextSelected,
                    ]}>
                      {location.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
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

      <Modal
        visible={showLocationModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLocationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient
              colors={[Colors.dark.gold, Colors.dark.orange]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalAccent}
            />
            <Text style={styles.modalTitle}>{editingLocation ? "EDIT LOCATION" : "ADD LOCATION"}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Location name (e.g., Safa Park Tennis)"
              placeholderTextColor={Colors.dark.textMuted}
              value={newLocationName}
              onChangeText={setNewLocationName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalCancelButton} onPress={() => setShowLocationModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.modalSaveButtonWrapper, !newLocationName.trim() && { opacity: 0.5 }]} 
                onPress={handleSaveLocation}
                disabled={!newLocationName.trim()}
              >
                <LinearGradient
                  colors={[Colors.dark.gold, Colors.dark.orange]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalSaveButton}
                >
                  <Text style={styles.modalSaveText}>{editingLocation ? "Save" : "Add"}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showTravelTimeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTravelTimeModal(false)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setShowTravelTimeModal(false)} />
          <View style={styles.drawerContent}>
            <View style={styles.drawerHandle} />
            <View style={styles.drawerHeader}>
              <View style={styles.drawerTitleRow}>
                <View style={styles.drawerIconWrapper}>
                  <Ionicons name="time-outline" size={20} color={Colors.dark.gold} />
                </View>
                <Text style={styles.drawerTitle}>Add Travel Time</Text>
              </View>
              <Pressable style={styles.drawerCloseButton} onPress={() => setShowTravelTimeModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.drawerBody} showsVerticalScrollIndicator={false}>
              <View style={styles.drawerSection}>
                <Text style={styles.drawerSectionLabel}>From Location</Text>
                <View style={styles.drawerOptionsGrid}>
                  {courts.filter(c => c.locationId).map((court) => (
                    <Pressable
                      key={court.id}
                      style={[
                        styles.drawerOptionCard,
                        fromCourtId === court.id && styles.drawerOptionCardSelected,
                      ]}
                      onPress={() => handleSelectFromCourt(court)}
                    >
                      <View style={[styles.drawerOptionDot, { backgroundColor: court.color || Colors.dark.primary }]} />
                      <Text style={[
                        styles.drawerOptionText,
                        fromCourtId === court.id && styles.drawerOptionTextSelected,
                      ]} numberOfLines={1}>
                        {getCourtLabel(court)}
                      </Text>
                      {fromCourtId === court.id && (
                        <Ionicons name="checkmark-circle" size={16} color={Colors.dark.gold} />
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.drawerArrowContainer}>
                <View style={styles.drawerArrowLine} />
                <View style={styles.drawerArrowIcon}>
                  <Ionicons name="arrow-down" size={20} color={Colors.dark.gold} />
                </View>
                <View style={styles.drawerArrowLine} />
              </View>

              <View style={styles.drawerSection}>
                <Text style={styles.drawerSectionLabel}>To Location</Text>
                <View style={styles.drawerOptionsGrid}>
                  {courts.filter(c => {
                    if (!c.locationId || c.locationId === fromLocationId) return false;
                    const alreadyExists = travelTimes.some(tt => 
                      tt.fromLocationId === fromLocationId && tt.toLocationId === c.locationId
                    );
                    return !alreadyExists;
                  }).map((court) => (
                    <Pressable
                      key={court.id}
                      style={[
                        styles.drawerOptionCard,
                        toCourtId === court.id && styles.drawerOptionCardSelected,
                      ]}
                      onPress={() => handleSelectToCourt(court)}
                    >
                      <View style={[styles.drawerOptionDot, { backgroundColor: court.color || Colors.dark.primary }]} />
                      <Text style={[
                        styles.drawerOptionText,
                        toCourtId === court.id && styles.drawerOptionTextSelected,
                      ]} numberOfLines={1}>
                        {getCourtLabel(court)}
                      </Text>
                      {toCourtId === court.id && (
                        <Ionicons name="checkmark-circle" size={16} color={Colors.dark.gold} />
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.drawerSection}>
                <Text style={styles.drawerSectionLabel}>Travel Duration</Text>
                <View style={styles.drawerTimeGrid}>
                  {TRAVEL_TIME_OPTIONS.map((mins) => (
                    <Pressable
                      key={mins}
                      style={[
                        styles.drawerTimeCard,
                        selectedTravelTime === mins && styles.drawerTimeCardSelected,
                      ]}
                      onPress={() => {
                        setSelectedTravelTime(mins);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={[
                        styles.drawerTimeValue,
                        selectedTravelTime === mins && styles.drawerTimeValueSelected,
                      ]}>
                        {mins}
                      </Text>
                      <Text style={[
                        styles.drawerTimeUnit,
                        selectedTravelTime === mins && styles.drawerTimeUnitSelected,
                      ]}>
                        min
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.drawerFooter}>
              <Pressable 
                style={[styles.drawerSaveButton, (!fromCourtId || !toCourtId || fromLocationId === toLocationId) && { opacity: 0.5 }]} 
                onPress={handleSaveTravelTime}
                disabled={!fromCourtId || !toCourtId || fromLocationId === toLocationId}
              >
                <LinearGradient
                  colors={[Colors.dark.gold, Colors.dark.orange]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.drawerSaveGradient}
                >
                  <Ionicons name="add-circle" size={20} color={Colors.dark.backgroundRoot} />
                  <Text style={styles.drawerSaveText}>Add Travel Time</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Travel Time Confirmation Modal */}
      <Modal
        visible={showDeleteTravelTimeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteTravelTimeModal(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <View style={styles.deleteModalIconWrapper}>
              <Ionicons name="trash" size={32} color={Colors.dark.error} />
            </View>
            <Text style={styles.deleteModalTitle}>Delete Travel Time?</Text>
            <Text style={styles.deleteModalMessage}>
              Remove travel time between {travelTimeToDelete?.fromName} and {travelTimeToDelete?.toName}?
            </Text>
            <View style={styles.deleteModalButtons}>
              <Pressable
                style={styles.deleteModalCancelBtn}
                onPress={() => {
                  setShowDeleteTravelTimeModal(false);
                  setTravelTimeToDelete(null);
                }}
              >
                <Text style={styles.deleteModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.deleteModalConfirmBtn}
                onPress={confirmDeleteTravelTime}
              >
                <Text style={styles.deleteModalConfirmText}>Delete</Text>
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
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
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
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
    }),
    elevation: 3,
  },
  profileTopAccent: {
    height: 3,
    backgroundColor: GlowColors.primary,
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
    borderColor: GlowColors.primary + "40",
  },
  profileInitial: {
    fontSize: 22,
    fontWeight: "700",
    color: GlowColors.primary,
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
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
    }),
    elevation: 2,
  },
  settingRowDivider: {
    height: 1,
    backgroundColor: Backgrounds.card,
    marginVertical: Spacing.md,
  },
  subsectionLabel: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
    }),
    elevation: 2,
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
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
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
    backgroundColor: GlowColors.primary,
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
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
    backgroundColor: Backgrounds.surface,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  optionButtonActive: {
    backgroundColor: GlowColors.primary + "20",
    borderColor: GlowColors.primary,
  },
  optionButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  optionButtonTextActive: {
    color: GlowColors.primary,
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
    backgroundColor: Backgrounds.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  circleButtonActive: {
    backgroundColor: GlowColors.primary + "20",
    borderColor: GlowColors.primary,
  },
  circleButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  circleButtonTextActive: {
    color: GlowColors.primary,
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
    backgroundColor: Backgrounds.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  smallCircleButtonActive: {
    backgroundColor: GlowColors.primary + "20",
    borderColor: GlowColors.primary,
  },
  smallCircleButtonText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
  },
  smallCircleButtonTextActive: {
    color: GlowColors.primary,
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
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
  locationGroup: {
    marginBottom: Spacing.md,
  },
  locationGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  locationGroupName: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.gold,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  locationGroupCount: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  courtCard: {
    flexDirection: "row",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
  },
  courtDeleteButton: {
    backgroundColor: "rgba(255, 77, 77, 0.1)",
    borderColor: "rgba(255, 77, 77, 0.2)",
  },
  courtMoveButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  courtMoveButtonDisabled: {
    opacity: 0.3,
  },
  sectionHeaderWithChevron: {
    flexDirection: "row",
    alignItems: "center",
  },
  courtCount: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    marginLeft: Spacing.xs,
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
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  infoRowDivider: {
    height: 1,
    backgroundColor: Backgrounds.card,
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
  deleteAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: "transparent",
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  deleteAccountText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.error,
    fontWeight: "500",
    opacity: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    width: "100%",
    maxWidth: 340,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  modalCancelButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
  sectionDescription: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  collapsibleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  collapsibleHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  collapsibleHeaderTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  collapsibleBadge: {
    backgroundColor: Colors.dark.xpCyan + "25",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  collapsibleBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  travelTimesList: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  travelTimeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
    }),
    elevation: 2,
  },
  travelTimeInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  travelTimeRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  travelTimeLocation: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  travelTimeLocationGroup: {
    alignItems: "center",
  },
  travelTimeLocationName: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    marginBottom: 2,
  },
  travelTimeCourts: {
    fontSize: 11,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  travelTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
  },
  travelTimeValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  travelTimeDeleteBtn: {
    padding: Spacing.md,
    marginLeft: Spacing.sm,
    backgroundColor: "rgba(255, 59, 48, 0.12)",
    borderRadius: BorderRadius.sm,
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  deleteModalContent: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  deleteModalIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 59, 48, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  deleteModalMessage: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  deleteModalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  deleteModalCancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
  },
  deleteModalCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  deleteModalConfirmBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
  },
  deleteModalConfirmText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  locationPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  locationOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.surface,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  locationOptionSelected: {
    backgroundColor: Colors.dark.gold + "20",
    borderColor: Colors.dark.gold,
  },
  locationOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  locationOptionTextSelected: {
    color: Colors.dark.gold,
  },
  travelTimeOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.surface,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    minWidth: 60,
    alignItems: "center",
  },
  travelTimeOptionSelected: {
    backgroundColor: FunctionColors.info + "20",
    borderColor: FunctionColors.info,
  },
  travelTimeOptionText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  travelTimeOptionTextSelected: {
    color: FunctionColors.info,
  },
  courtPickerScroll: {
    maxHeight: 120,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  locationCourtBadge: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  locationCourtBadgeText: {
    fontSize: 11,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  drawerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.overlay,
  },
  drawerContent: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderBottomWidth: 0,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.md,
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  drawerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  drawerIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.gold + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  drawerCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerBody: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  drawerSection: {
    marginBottom: Spacing.md,
  },
  drawerSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  drawerOptionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  drawerOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.surface,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    minWidth: 100,
  },
  drawerOptionCardSelected: {
    backgroundColor: Colors.dark.gold + "15",
    borderColor: Colors.dark.gold,
  },
  drawerOptionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  drawerOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    flex: 1,
  },
  drawerOptionTextSelected: {
    color: Colors.dark.gold,
  },
  drawerArrowContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: Spacing.md,
    gap: Spacing.md,
  },
  drawerArrowLine: {
    height: 1,
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  drawerArrowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.gold + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerTimeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  drawerTimeCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.surface,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    minWidth: 56,
  },
  drawerTimeCardSelected: {
    backgroundColor: FunctionColors.info + "15",
    borderColor: FunctionColors.info,
  },
  drawerTimeValue: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  drawerTimeValueSelected: {
    color: FunctionColors.info,
  },
  drawerTimeUnit: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
  },
  drawerTimeUnitSelected: {
    color: FunctionColors.info,
  },
  drawerFooter: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  drawerSaveButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  drawerSaveGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  drawerSaveText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  languageTextContainer: {
    flex: 1,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.dark.tabIconDefault,
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
});
