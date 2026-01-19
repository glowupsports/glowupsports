import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import { Colors, Spacing, BorderRadius, Typography, Backgrounds, GlowColors, FunctionColors } from "@/constants/theme";
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
  const glowOpacity = useSharedValue(value ? 1 : 0);

  React.useEffect(() => {
    glowOpacity.value = withTiming(value ? 1 : 0, { duration: 200 });
  }, [value]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowOpacity.value, [0, 1], [0, 0.4]),
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
        trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: "rgba(200, 255, 61, 0.2)" }}
        thumbColor={value ? GlowColors.primary : Colors.dark.tabIconDefault}
        ios_backgroundColor="rgba(255, 255, 255, 0.08)"
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
  const [newCourtLocationId, setNewCourtLocationId] = useState<string | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationAddress, setNewLocationAddress] = useState("");
  const [locationsCollapsed, setLocationsCollapsed] = useState(false);
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testBookingLoading, setTestBookingLoading] = useState(false);
  const [showTravelTimeModal, setShowTravelTimeModal] = useState(false);
  const [fromLocationId, setFromLocationId] = useState<string>("");
  const [toLocationId, setToLocationId] = useState<string>("");
  const [fromCourtId, setFromCourtId] = useState<string>("");
  const [toCourtId, setToCourtId] = useState<string>("");
  const [selectedTravelTime, setSelectedTravelTime] = useState(30);

  const { data: courts = [], isLoading: courtsLoading } = useQuery<Court[]>({
    queryKey: ["/api/courts"],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: travelTimes = [] } = useQuery<TravelTimeConfig[]>({
    queryKey: ["/api/coach/travel-times"],
  });

  const defaultPushPrefs: PushPreferences = {
    sessionReminders: true,
    feedbackRequests: true,
    packageExpiry: true,
    loadWarnings: true,
    chatMessages: true,
    reminderMinutesBefore: 30,
  };

  const { data: pushPreferences = defaultPushPrefs } = useQuery<PushPreferences>({
    queryKey: ["/api/push/preferences"],
    enabled: !!coach?.id,
  });

  const updatePushPrefsMutation = useMutation({
    mutationFn: async (prefs: Partial<PushPreferences>) => {
      return apiRequest("PATCH", "/api/push/preferences", prefs);
    },
    onMutate: async (newPrefs) => {
      await queryClient.cancelQueries({ queryKey: ["/api/push/preferences"] });
      const previousPrefs = queryClient.getQueryData<PushPreferences>(["/api/push/preferences"]);
      queryClient.setQueryData<PushPreferences>(["/api/push/preferences"], (old) => ({
        ...defaultPushPrefs,
        ...old,
        ...newPrefs,
      }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return { previousPrefs };
    },
    onError: (_err, _newPrefs, context) => {
      if (context?.previousPrefs) {
        queryClient.setQueryData(["/api/push/preferences"], context.previousPrefs);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push/preferences"] });
    },
  });

  const updatePushPref = (key: keyof PushPreferences, value: boolean | number) => {
    updatePushPrefsMutation.mutate({ [key]: value });
  };

  const createTravelTimeMutation = useMutation({
    mutationFn: async (data: { fromLocationId: string; toLocationId: string; travelTimeMinutes: number }) => {
      return apiRequest("POST", "/api/coach/travel-times", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/travel-times"] });
      setShowTravelTimeModal(false);
      setFromLocationId("");
      setToLocationId("");
      setSelectedTravelTime(30);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteTravelTimeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/coach/travel-times/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/travel-times"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const createCourtMutation = useMutation({
    mutationFn: async ({ name, color, locationId }: { name: string; color: string; locationId: string | null }) => {
      return apiRequest("POST", "/api/courts", { name, color, locationId, isActive: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      setShowCourtModal(false);
      setNewCourtName("");
      setNewCourtColor(COURT_COLORS[0]);
      setNewCourtLocationId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error?.message || "Failed to create court");
    },
  });

  const updateCourtMutation = useMutation({
    mutationFn: async ({ id, name, color, locationId }: { id: string; name: string; color: string; locationId: string | null }) => {
      return apiRequest("PATCH", `/api/courts/${id}`, { name, color, locationId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      setEditingCourt(null);
      setNewCourtName("");
      setNewCourtColor(COURT_COLORS[0]);
      setNewCourtLocationId(null);
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
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Cannot Delete Court", error?.message || "Failed to delete court. It may have sessions associated with it.");
    },
  });

  const createLocationMutation = useMutation({
    mutationFn: async ({ name, address }: { name: string; address?: string }) => {
      return apiRequest("POST", "/api/locations", { name, address });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setShowLocationModal(false);
      setNewLocationName("");
      setNewLocationAddress("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error?.message || "Failed to create location");
    },
  });

  const updateLocationMutation = useMutation({
    mutationFn: async ({ id, name, address }: { id: string; name: string; address?: string }) => {
      return apiRequest("PATCH", `/api/locations/${id}`, { name, address });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setShowLocationModal(false);
      setEditingLocation(null);
      setNewLocationName("");
      setNewLocationAddress("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Cannot Delete Location", error?.message || "Failed to delete location. It may have courts associated with it.");
    },
  });

  const reorderCourtsMutation = useMutation({
    mutationFn: async (courtIds: string[]) => {
      return apiRequest("POST", "/api/courts/reorder", { courtIds });
    },
    onMutate: async (courtIds: string[]) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/courts"] });
      
      // Snapshot the previous value
      const previousCourts = queryClient.getQueryData<Court[]>(["/api/courts"]);
      
      // Optimistically update positions while preserving all courts
      if (previousCourts) {
        const updatedCourts = previousCourts.map(court => {
          const newPosition = courtIds.indexOf(court.id);
          if (newPosition !== -1) {
            return { ...court, position: newPosition };
          }
          return court;
        });
        queryClient.setQueryData(["/api/courts"], updatedCourts);
      }
      
      return { previousCourts };
    },
    onError: (err, courtIds, context) => {
      // Rollback on error
      if (context?.previousCourts) {
        queryClient.setQueryData(["/api/courts"], context.previousCourts);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
    },
  });

  const [courtsCollapsed, setCourtsCollapsed] = useState(false);

  // Sort courts by position and group by location
  const sortedCourts = [...courts].sort((a, b) => (a.position || 0) - (b.position || 0));
  
  // Group courts by location
  const courtsGroupedByLocation = useMemo(() => {
    const groups: { location: Location | null; courts: Court[] }[] = [];
    const unassigned: Court[] = [];
    const locationMap = new Map<string, Court[]>();
    
    for (const court of sortedCourts) {
      if (court.locationId) {
        const existing = locationMap.get(court.locationId) || [];
        existing.push(court);
        locationMap.set(court.locationId, existing);
      } else {
        unassigned.push(court);
      }
    }
    
    // Add locations with courts in order
    for (const location of locations) {
      const courtsAtLocation = locationMap.get(location.id);
      if (courtsAtLocation && courtsAtLocation.length > 0) {
        groups.push({ location, courts: courtsAtLocation });
      }
    }
    
    // Add unassigned courts at the end
    if (unassigned.length > 0) {
      groups.push({ location: null, courts: unassigned });
    }
    
    return groups;
  }, [sortedCourts, locations]);

  const moveCourt = (courtId: string, direction: "up" | "down") => {
    const currentIndex = sortedCourts.findIndex(c => c.id === courtId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= sortedCourts.length) return;
    
    const newOrder = [...sortedCourts];
    const [moved] = newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, moved);
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    reorderCourtsMutation.mutate(newOrder.map(c => c.id));
  };

  const handleAddCourt = () => {
    setEditingCourt(null);
    setNewCourtName("");
    setNewCourtColor(COURT_COLORS[0]);
    setNewCourtLocationId(null);
    setShowCourtModal(true);
  };

  const handleEditCourt = (court: Court) => {
    setEditingCourt(court);
    setNewCourtName(court.name);
    setNewCourtColor(court.color || COURT_COLORS[0]);
    setNewCourtLocationId(court.locationId || null);
    setShowCourtModal(true);
  };

  const handleDeleteCourt = async (court: Court) => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "SettingsScreen", action: "delete_court" });
      showOfflineAlert();
      return;
    }
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Are you sure you want to delete "${court.name}"?`);
      if (confirmed) {
        deleteCourtMutation.mutate(court.id);
      }
    } else {
      Alert.alert(
        "Delete Court",
        `Are you sure you want to delete "${court.name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteCourtMutation.mutate(court.id) },
        ]
      );
    }
  };

  const handleSaveCourt = async () => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "SettingsScreen", action: editingCourt ? "update_court" : "create_court" });
      showOfflineAlert();
      return;
    }
    if (!newCourtName.trim()) return;
    if (editingCourt) {
      updateCourtMutation.mutate({ id: editingCourt.id, name: newCourtName.trim(), color: newCourtColor, locationId: newCourtLocationId });
    } else {
      createCourtMutation.mutate({ name: newCourtName.trim(), color: newCourtColor, locationId: newCourtLocationId });
    }
  };

  const handleAddLocation = () => {
    setEditingLocation(null);
    setNewLocationName("");
    setNewLocationAddress("");
    setShowLocationModal(true);
  };

  const handleEditLocation = (location: Location) => {
    setEditingLocation(location);
    setNewLocationName(location.name);
    setNewLocationAddress("");
    setShowLocationModal(true);
  };

  const handleDeleteLocation = async (location: Location) => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "SettingsScreen", action: "delete_location" });
      showOfflineAlert();
      return;
    }
    const courtsAtLocation = courts.filter(c => c.locationId === location.id);
    if (courtsAtLocation.length > 0) {
      if (Platform.OS === "web") {
        window.alert(`Cannot Delete Location: This location has ${courtsAtLocation.length} court(s) assigned. Please reassign or remove them first.`);
      } else {
        Alert.alert(
          "Cannot Delete Location",
          `This location has ${courtsAtLocation.length} court(s) assigned. Please reassign or remove them first.`
        );
      }
      return;
    }
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Are you sure you want to delete "${location.name}"?`);
      if (confirmed) {
        deleteLocationMutation.mutate(location.id);
      }
    } else {
      Alert.alert(
        "Delete Location",
        `Are you sure you want to delete "${location.name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteLocationMutation.mutate(location.id) },
        ]
      );
    }
  };

  const handleSaveLocation = async () => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "SettingsScreen", action: editingLocation ? "update_location" : "create_location" });
      showOfflineAlert();
      return;
    }
    if (!newLocationName.trim()) return;
    if (editingLocation) {
      updateLocationMutation.mutate({ id: editingLocation.id, name: newLocationName.trim(), address: newLocationAddress.trim() || undefined });
    } else {
      createLocationMutation.mutate({ name: newLocationName.trim(), address: newLocationAddress.trim() || undefined });
    }
  };

  const handleAddTravelTime = () => {
    const courtsWithLocation = courts.filter(c => c.locationId);
    const uniqueLocationIds = [...new Set(courtsWithLocation.map(c => c.locationId))];
    
    if (uniqueLocationIds.length >= 2) {
      const firstCourt = courtsWithLocation.find(c => c.locationId === uniqueLocationIds[0]);
      const secondCourt = courtsWithLocation.find(c => c.locationId === uniqueLocationIds[1]);
      
      if (firstCourt && secondCourt) {
        setFromCourtId(firstCourt.id);
        setToCourtId(secondCourt.id);
        setFromLocationId(firstCourt.locationId || "");
        setToLocationId(secondCourt.locationId || "");
      }
    } else {
      setFromCourtId("");
      setToCourtId("");
      setFromLocationId("");
      setToLocationId("");
    }
    setSelectedTravelTime(30);
    setShowTravelTimeModal(true);
  };

  const handleSelectFromCourt = (court: Court) => {
    const newFromLocationId = court.locationId || "";
    setFromCourtId(court.id);
    setFromLocationId(newFromLocationId);
    
    const toCourt = courts.find(c => c.id === toCourtId);
    if (toCourt && toCourt.locationId === newFromLocationId) {
      const courtsWithLocation = courts.filter(c => c.locationId && c.locationId !== newFromLocationId);
      if (courtsWithLocation.length > 0) {
        setToCourtId(courtsWithLocation[0].id);
        setToLocationId(courtsWithLocation[0].locationId || "");
      } else {
        setToCourtId("");
        setToLocationId("");
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSelectToCourt = (court: Court) => {
    setToCourtId(court.id);
    setToLocationId(court.locationId || "");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveTravelTime = async () => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "SettingsScreen", action: "create_travel_time" });
      showOfflineAlert();
      return;
    }
    if (!fromLocationId || !toLocationId || fromLocationId === toLocationId) {
      Alert.alert("Error", "Please select courts at different locations");
      return;
    }
    createTravelTimeMutation.mutate({
      fromLocationId,
      toLocationId,
      travelTimeMinutes: selectedTravelTime,
    });
  };

  const handleDeleteTravelTime = (id: string, fromName: string, toName: string) => {
    Alert.alert(
      "Delete Travel Time",
      `Remove travel time between ${fromName} and ${toName}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteTravelTimeMutation.mutate(id) },
      ]
    );
  };

  const getLocationName = (id: string) => {
    return locations.find(l => l.id === id)?.name || "Unknown";
  };

  const getCourtsByLocation = (locationId: string) => {
    return courts.filter(c => c.locationId === locationId);
  };

  const getCourtLabel = (court: Court) => {
    const location = locations.find(l => l.id === court.locationId);
    return location ? `${court.name} @ ${location.name}` : court.name;
  };

  const getCourtsForTravelTimeDisplay = (locationId: string) => {
    const locationCourts = getCourtsByLocation(locationId);
    if (locationCourts.length > 0) {
      return locationCourts.map(c => c.name).join(", ");
    }
    return getLocationName(locationId);
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
        </View>

        <View style={styles.section}>
          <SectionHeader title="Court Travel Times" icon="car-outline" />
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
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            handleDeleteTravelTime(tt.id, getLocationName(tt.fromLocationId), getLocationName(tt.toLocationId));
                          }}
                          style={styles.travelTimeDeleteBtn}
                        >
                          <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                        </Pressable>
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
              <Text style={styles.infoValue}>{require("../../../../app.json").expo.version}</Text>
            </View>
            <View style={styles.infoRowDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Build</Text>
              <Text style={styles.infoValue}>{new Date().toISOString().split("T")[0]}</Text>
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
        animationType="fade"
        onRequestClose={() => setShowTravelTimeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient
              colors={[Colors.dark.gold, Colors.dark.orange]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalAccent}
            />
            <Text style={styles.modalTitle}>ADD TRAVEL TIME</Text>
            
            <Text style={styles.colorPickerLabel}>FROM COURT</Text>
            <ScrollView style={styles.courtPickerScroll} nestedScrollEnabled>
              <View style={styles.locationPicker}>
                {courts.filter(c => c.locationId).map((court) => (
                  <Pressable
                    key={court.id}
                    style={[
                      styles.locationOption,
                      fromCourtId === court.id && styles.locationOptionSelected,
                    ]}
                    onPress={() => handleSelectFromCourt(court)}
                  >
                    <View style={[styles.courtColorDot, { backgroundColor: court.color || Colors.dark.primary }]} />
                    <Text style={[
                      styles.locationOptionText,
                      fromCourtId === court.id && styles.locationOptionTextSelected,
                    ]}>
                      {getCourtLabel(court)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.colorPickerLabel}>TO COURT</Text>
            <ScrollView style={styles.courtPickerScroll} nestedScrollEnabled>
              <View style={styles.locationPicker}>
                {courts.filter(c => c.locationId && c.locationId !== fromLocationId).map((court) => (
                  <Pressable
                    key={court.id}
                    style={[
                      styles.locationOption,
                      toCourtId === court.id && styles.locationOptionSelected,
                    ]}
                    onPress={() => handleSelectToCourt(court)}
                  >
                    <View style={[styles.courtColorDot, { backgroundColor: court.color || Colors.dark.primary }]} />
                    <Text style={[
                      styles.locationOptionText,
                      toCourtId === court.id && styles.locationOptionTextSelected,
                    ]}>
                      {getCourtLabel(court)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.colorPickerLabel}>TRAVEL TIME</Text>
            <View style={styles.locationPicker}>
              {TRAVEL_TIME_OPTIONS.map((mins) => (
                <Pressable
                  key={mins}
                  style={[
                    styles.travelTimeOption,
                    selectedTravelTime === mins && styles.travelTimeOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedTravelTime(mins);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[
                    styles.travelTimeOptionText,
                    selectedTravelTime === mins && styles.travelTimeOptionTextSelected,
                  ]}>
                    {mins} min
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <Pressable style={styles.modalCancelButton} onPress={() => setShowTravelTimeModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.modalSaveButtonWrapper, (!fromCourtId || !toCourtId || fromLocationId === toLocationId) && { opacity: 0.5 }]} 
                onPress={handleSaveTravelTime}
                disabled={!fromCourtId || !toCourtId || fromLocationId === toLocationId}
              >
                <LinearGradient
                  colors={[Colors.dark.gold, Colors.dark.orange]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalSaveButton}
                >
                  <Text style={styles.modalSaveText}>Add</Text>
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
    backgroundColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: "rgba(255, 255, 255, 0.06)",
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
    padding: Spacing.sm,
    marginLeft: Spacing.sm,
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
});
