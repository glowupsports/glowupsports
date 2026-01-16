import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes, BorderRadius, Backgrounds, GlowColors } from "@/constants/theme";
import { Card } from "@/components/Card";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface BookingPreferences {
  id: string;
  playerId: string;
  preferredDays: string[] | null;
  preferredTimeWindows: { start: string; end: string }[] | null;
  preferredSurfaces: string[] | null;
  preferredCourts: string[] | null;
  autoAcceptFriendInvites: boolean;
  openToOpenMatches: boolean;
  preferredMatchType: string | null;
  notifyOnOpenMatches: boolean;
  notifyOnFriendBookings: boolean;
}

interface SmartSuggestions {
  preferredDays: string[];
  preferredTimes: string[];
  favoriteCourtIds: string[];
  totalBookings: number;
  suggestions: string[];
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_WINDOWS = [
  { label: "Morning", value: "morning", start: "06:00", end: "12:00" },
  { label: "Afternoon", value: "afternoon", start: "12:00", end: "17:00" },
  { label: "Evening", value: "evening", start: "17:00", end: "22:00" },
];
const SURFACES = ["hard", "clay", "grass", "indoor"];
const MATCH_TYPES = ["singles", "doubles", "any"];

export default function BookingPreferencesScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [selectedSurfaces, setSelectedSurfaces] = useState<string[]>([]);
  const [preferredMatchType, setPreferredMatchType] = useState<string>("any");
  const [autoAcceptInvites, setAutoAcceptInvites] = useState(false);
  const [openToMatches, setOpenToMatches] = useState(true);
  const [notifyOpenMatches, setNotifyOpenMatches] = useState(true);
  const [notifyFriendBookings, setNotifyFriendBookings] = useState(true);

  const { data: preferences, isLoading: prefsLoading } = useQuery<BookingPreferences | null>({
    queryKey: ["/api/player/booking-preferences"],
  });

  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<SmartSuggestions>({
    queryKey: ["/api/player/booking-suggestions"],
  });

  useEffect(() => {
    if (preferences) {
      setSelectedDays(preferences.preferredDays || []);
      setSelectedTimes(
        preferences.preferredTimeWindows?.map((tw) => {
          if (tw.start === "06:00") return "morning";
          if (tw.start === "12:00") return "afternoon";
          return "evening";
        }) || []
      );
      setSelectedSurfaces(preferences.preferredSurfaces || []);
      setPreferredMatchType(preferences.preferredMatchType || "any");
      setAutoAcceptInvites(preferences.autoAcceptFriendInvites);
      setOpenToMatches(preferences.openToOpenMatches);
      setNotifyOpenMatches(preferences.notifyOnOpenMatches);
      setNotifyFriendBookings(preferences.notifyOnFriendBookings);
    }
  }, [preferences]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const timeWindows = selectedTimes.map((t) => {
        const tw = TIME_WINDOWS.find((w) => w.value === t);
        return { start: tw?.start || "06:00", end: tw?.end || "12:00" };
      });

      return apiRequest(`${getApiUrl()}/api/player/booking-preferences`, {
        method: "PUT",
        body: JSON.stringify({
          preferredDays: selectedDays,
          preferredTimeWindows: timeWindows,
          preferredSurfaces: selectedSurfaces,
          preferredMatchType,
          autoAcceptFriendInvites: autoAcceptInvites,
          openToOpenMatches: openToMatches,
          notifyOnOpenMatches: notifyOpenMatches,
          notifyOnFriendBookings: notifyFriendBookings,
        }),
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/booking-preferences"] });
      Alert.alert("Saved", "Your booking preferences have been updated.");
    },
    onError: () => {
      Alert.alert("Error", "Could not save preferences. Please try again.");
    },
  });

  const toggleDay = (day: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const toggleTime = (time: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTimes((prev) =>
      prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time]
    );
  };

  const toggleSurface = (surface: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSurfaces((prev) =>
      prev.includes(surface) ? prev.filter((s) => s !== surface) : [...prev, surface]
    );
  };

  if (prefsLoading) {
    return (
      <View style={[styles.container, styles.loading, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.dark.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Booking Preferences</Text>
        <Pressable
          onPress={() => saveMutation.mutate()}
          style={styles.saveButton}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color={Colors.dark.text} size="small" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {suggestions && suggestions.suggestions.length > 0 && (
          <Card style={styles.suggestionsCard}>
            <View style={styles.suggestionsHeader}>
              <Ionicons name="bulb" size={20} color={Colors.dark.gold} />
              <Text style={styles.suggestionsTitle}>Smart Insights</Text>
            </View>
            {suggestions.suggestions.map((suggestion, index) => (
              <Text key={index} style={styles.suggestionText}>
                {suggestion}
              </Text>
            ))}
            <Text style={styles.bookingsCount}>
              Based on {suggestions.totalBookings} past bookings
            </Text>
          </Card>
        )}

        <Text style={styles.sectionTitle}>Preferred Days</Text>
        <View style={styles.chipGrid}>
          {DAYS.map((day, index) => (
            <Pressable
              key={day}
              style={[styles.chip, selectedDays.includes(day) && styles.chipSelected]}
              onPress={() => toggleDay(day)}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedDays.includes(day) && styles.chipTextSelected,
                ]}
              >
                {DAY_LABELS[index]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Preferred Times</Text>
        <View style={styles.chipGrid}>
          {TIME_WINDOWS.map((tw) => (
            <Pressable
              key={tw.value}
              style={[styles.chip, styles.chipWide, selectedTimes.includes(tw.value) && styles.chipSelected]}
              onPress={() => toggleTime(tw.value)}
            >
              <Ionicons
                name={tw.value === "morning" ? "sunny" : tw.value === "afternoon" ? "partly-sunny" : "moon"}
                size={16}
                color={selectedTimes.includes(tw.value) ? Colors.dark.text : Colors.dark.textMuted}
              />
              <Text
                style={[
                  styles.chipText,
                  selectedTimes.includes(tw.value) && styles.chipTextSelected,
                ]}
              >
                {tw.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Preferred Surfaces</Text>
        <View style={styles.chipGrid}>
          {SURFACES.map((surface) => (
            <Pressable
              key={surface}
              style={[styles.chip, selectedSurfaces.includes(surface) && styles.chipSelected]}
              onPress={() => toggleSurface(surface)}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedSurfaces.includes(surface) && styles.chipTextSelected,
                ]}
              >
                {surface.charAt(0).toUpperCase() + surface.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Match Type Preference</Text>
        <View style={styles.chipGrid}>
          {MATCH_TYPES.map((type) => (
            <Pressable
              key={type}
              style={[styles.chip, styles.chipWide, preferredMatchType === type && styles.chipSelected]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setPreferredMatchType(type);
              }}
            >
              <Ionicons
                name={type === "singles" ? "person" : type === "doubles" ? "people" : "apps"}
                size={16}
                color={preferredMatchType === type ? Colors.dark.text : Colors.dark.textMuted}
              />
              <Text
                style={[
                  styles.chipText,
                  preferredMatchType === type && styles.chipTextSelected,
                ]}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Social Settings</Text>
        <Card style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto-accept friend invites</Text>
              <Text style={styles.settingDescription}>
                Automatically join when friends invite you
              </Text>
            </View>
            <Switch
              value={autoAcceptInvites}
              onValueChange={setAutoAcceptInvites}
              trackColor={{ false: Colors.dark.backgroundSecondary, true: Colors.dark.primary }}
              thumbColor={Colors.dark.text}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Open to open matches</Text>
              <Text style={styles.settingDescription}>
                Show you're available to join games
              </Text>
            </View>
            <Switch
              value={openToMatches}
              onValueChange={setOpenToMatches}
              trackColor={{ false: Colors.dark.backgroundSecondary, true: Colors.dark.primary }}
              thumbColor={Colors.dark.text}
            />
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Notifications</Text>
        <Card style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Open match alerts</Text>
              <Text style={styles.settingDescription}>
                Get notified about new open matches
              </Text>
            </View>
            <Switch
              value={notifyOpenMatches}
              onValueChange={setNotifyOpenMatches}
              trackColor={{ false: Colors.dark.backgroundSecondary, true: Colors.dark.xpCyan }}
              thumbColor={Colors.dark.text}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Friend booking alerts</Text>
              <Text style={styles.settingDescription}>
                Know when friends book courts
              </Text>
            </View>
            <Switch
              value={notifyFriendBookings}
              onValueChange={setNotifyFriendBookings}
              trackColor={{ false: Colors.dark.backgroundSecondary, true: Colors.dark.xpCyan }}
              thumbColor={Colors.dark.text}
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loading: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  saveButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  saveText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  suggestionsCard: {
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.dark.gold + "15",
    borderColor: Colors.dark.gold + "30",
  },
  suggestionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  suggestionsTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  suggestionText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  bookingsCount: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  chipWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  chipSelected: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  chipText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  chipTextSelected: {
    color: Colors.dark.text,
  },
  settingsCard: {
    padding: 0,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  settingInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingLabel: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  settingDescription: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
});
