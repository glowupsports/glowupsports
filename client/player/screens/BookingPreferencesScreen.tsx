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
import { useHeaderHeight } from "@react-navigation/elements";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { Colors, Spacing, FontSizes, BorderRadius, Backgrounds, GlowColors, TextColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const ProTennisColors = new Proxy({} as Record<string, string>, {
  get(_t, prop: string) {
    switch (prop) {
      case 'midnightBlue':
      case 'backgroundPrimary':
        return Backgrounds.root;
      case 'surfaceCard':
      case 'cardBackground':
        return Backgrounds.card;
      case 'surfaceElevated':
      case 'backgroundSecondary':
        return Backgrounds.elevated;
      case 'border':
        return Backgrounds.surface;
      case 'neonGreen':
      case 'electricGreen':
        return GlowColors.primary;
      case 'neonCyan': return '#00E5FF';
      case 'neonPurple': return '#E040FB';
      case 'neonOrange': return '#FF8A00';
      case 'gold': return '#FFD700';
      case 'vacationBlue': return '#4DA3FF';
      case 'error': return '#FF4D4D';
      case 'success': return '#00E676';
      case 'white':
      case 'textPrimary':
        return TextColors.primary;
      case 'textSecondary': return TextColors.secondary;
      case 'textMuted': return TextColors.muted;
      default:
        if (typeof console !== 'undefined') console.warn('ProTennisColors: missing key', prop);
        return undefined;
    }
  },
});

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
  { label: "Morning", value: "morning", start: "06:00", end: "12:00", icon: "sunny" as const },
  { label: "Afternoon", value: "afternoon", start: "12:00", end: "17:00", icon: "partly-sunny" as const },
  { label: "Evening", value: "evening", start: "17:00", end: "22:00", icon: "moon" as const },
];
const SURFACES = ["hard", "clay", "grass", "indoor"];
const MATCH_TYPES = ["singles", "doubles", "any"];

function NeonBorderCard({ children, accentColor = ProTennisColors.neonCyan, style }: { children: React.ReactNode; accentColor?: string; style?: any }) {
  return (
    <View style={[styles.neonCard, style]}>
      <View style={[styles.neonCardGlow, { shadowColor: accentColor }]} />
      <LinearGradient
        colors={[accentColor + "15", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.neonCardGradient}
      />
      <View style={[styles.neonCardBorder, { borderColor: accentColor + "40" }]}>
        {children}
      </View>
    </View>
  );
}

export default function BookingPreferencesScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
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

  const { data: suggestions } = useQuery<SmartSuggestions>({
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

      return apiRequest("PUT", "/api/player/booking-preferences", {
        preferredDays: selectedDays,
        preferredTimeWindows: timeWindows,
        preferredSurfaces: selectedSurfaces,
        preferredMatchType,
        autoAcceptFriendInvites: autoAcceptInvites,
        openToOpenMatches: openToMatches,
        notifyOnOpenMatches: notifyOpenMatches,
        notifyOnFriendBookings: notifyFriendBookings,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/booking-preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/play/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/play/open-matches"] });
      Alert.alert("Saved", "Your preferences have been updated. Open matches will now show filtered results.");
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

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          style={styles.headerSaveButton}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color={ProTennisColors.midnightBlue} size="small" />
          ) : (
            <Text style={styles.headerSaveText}>Save</Text>
          )}
        </Pressable>
      ),
    });
  }, [navigation, saveMutation.isPending, selectedDays, selectedTimes, selectedSurfaces, preferredMatchType, autoAcceptInvites, openToMatches, notifyOpenMatches, notifyFriendBookings]);

  if (prefsLoading) {
    return (
      <View style={[styles.container, styles.loading, { paddingTop: headerHeight }]}>
        <ActivityIndicator color={ProTennisColors.neonCyan} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {suggestions && suggestions.suggestions.length > 0 && (
          <Animated.View entering={FadeInDown.delay(100).duration(400)}>
            <NeonBorderCard accentColor={ProTennisColors.gold}>
              <View style={styles.insightsContent}>
                <View style={styles.insightsHeader}>
                  <View style={styles.insightsIcon}>
                    <Ionicons name="bulb" size={20} color={ProTennisColors.gold} />
                  </View>
                  <Text style={styles.insightsTitle}>Smart Insights</Text>
                </View>
                {suggestions.suggestions.map((suggestion, index) => (
                  <View key={index} style={styles.insightRow}>
                    <Feather name="zap" size={12} color={ProTennisColors.gold} />
                    <Text style={styles.insightText}>{suggestion}</Text>
                  </View>
                ))}
                <Text style={styles.bookingsCount}>
                  Based on {suggestions.totalBookings} past bookings
                </Text>
              </View>
            </NeonBorderCard>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: ProTennisColors.neonCyan + "20" }]}>
              <Feather name="calendar" size={16} color={ProTennisColors.neonCyan} />
            </View>
            <Text style={styles.sectionTitle}>Preferred Days</Text>
          </View>
          <View style={styles.chipGrid}>
            {DAYS.map((day, index) => {
              const selected = selectedDays.includes(day);
              return (
                <Pressable
                  key={day}
                  style={[
                    styles.chip,
                    selected && styles.chipSelected,
                    selected && { borderColor: ProTennisColors.neonCyan }
                  ]}
                  onPress={() => toggleDay(day)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {DAY_LABELS[index]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: ProTennisColors.neonPurple + "20" }]}>
              <Feather name="clock" size={16} color={ProTennisColors.neonPurple} />
            </View>
            <Text style={styles.sectionTitle}>Preferred Times</Text>
          </View>
          <View style={styles.chipGrid}>
            {TIME_WINDOWS.map((tw) => {
              const selected = selectedTimes.includes(tw.value);
              return (
                <Pressable
                  key={tw.value}
                  style={[
                    styles.chipWide,
                    selected && styles.chipSelected,
                    selected && { borderColor: ProTennisColors.neonPurple }
                  ]}
                  onPress={() => toggleTime(tw.value)}
                >
                  <Ionicons
                    name={tw.icon}
                    size={18}
                    color={selected ? ProTennisColors.neonPurple : ProTennisColors.textMuted}
                  />
                  <Text style={[styles.chipText, selected && { color: ProTennisColors.neonPurple }]}>
                    {tw.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).duration(400)}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: ProTennisColors.neonGreen + "20" }]}>
              <Feather name="layers" size={16} color={ProTennisColors.neonGreen} />
            </View>
            <Text style={styles.sectionTitle}>Preferred Surfaces</Text>
          </View>
          <View style={styles.chipGrid}>
            {SURFACES.map((surface) => {
              const selected = selectedSurfaces.includes(surface);
              return (
                <Pressable
                  key={surface}
                  style={[
                    styles.chip,
                    selected && styles.chipSelected,
                    selected && { borderColor: ProTennisColors.neonGreen }
                  ]}
                  onPress={() => toggleSurface(surface)}
                >
                  <Text style={[styles.chipText, selected && { color: ProTennisColors.neonGreen }]}>
                    {surface.charAt(0).toUpperCase() + surface.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(500).duration(400)}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: ProTennisColors.neonCyan + "20" }]}>
              <Feather name="users" size={16} color={ProTennisColors.neonCyan} />
            </View>
            <Text style={styles.sectionTitle}>Match Type</Text>
          </View>
          <View style={styles.chipGrid}>
            {MATCH_TYPES.map((type) => {
              const selected = preferredMatchType === type;
              return (
                <Pressable
                  key={type}
                  style={[
                    styles.chipWide,
                    selected && styles.chipSelected,
                    selected && { borderColor: ProTennisColors.neonCyan }
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setPreferredMatchType(type);
                  }}
                >
                  <Ionicons
                    name={type === "singles" ? "person" : type === "doubles" ? "people" : "apps"}
                    size={18}
                    color={selected ? ProTennisColors.neonCyan : ProTennisColors.textMuted}
                  />
                  <Text style={[styles.chipText, selected && { color: ProTennisColors.neonCyan }]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(600).duration(400)}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: ProTennisColors.neonPurple + "20" }]}>
              <Feather name="heart" size={16} color={ProTennisColors.neonPurple} />
            </View>
            <Text style={styles.sectionTitle}>Social Settings</Text>
          </View>
          <NeonBorderCard accentColor={ProTennisColors.neonPurple}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Auto-accept friend invites</Text>
                <Text style={styles.settingDescription}>Automatically join when friends invite you</Text>
              </View>
              <Switch
                value={autoAcceptInvites}
                onValueChange={(val) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAutoAcceptInvites(val);
                }}
                trackColor={{ false: ProTennisColors.surfaceElevated, true: ProTennisColors.neonPurple + "60" }}
                thumbColor={autoAcceptInvites ? ProTennisColors.neonPurple : ProTennisColors.textSecondary}
              />
            </View>
            <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Open to matches</Text>
                <Text style={styles.settingDescription}>Show you're available to join games</Text>
              </View>
              <Switch
                value={openToMatches}
                onValueChange={(val) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setOpenToMatches(val);
                }}
                trackColor={{ false: ProTennisColors.surfaceElevated, true: ProTennisColors.neonPurple + "60" }}
                thumbColor={openToMatches ? ProTennisColors.neonPurple : ProTennisColors.textSecondary}
              />
            </View>
          </NeonBorderCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(700).duration(400)}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: ProTennisColors.neonCyan + "20" }]}>
              <Feather name="bell" size={16} color={ProTennisColors.neonCyan} />
            </View>
            <Text style={styles.sectionTitle}>Notifications</Text>
          </View>
          <NeonBorderCard accentColor={ProTennisColors.neonCyan}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Open match alerts</Text>
                <Text style={styles.settingDescription}>Get notified about new open matches</Text>
              </View>
              <Switch
                value={notifyOpenMatches}
                onValueChange={(val) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setNotifyOpenMatches(val);
                }}
                trackColor={{ false: ProTennisColors.surfaceElevated, true: ProTennisColors.neonCyan + "60" }}
                thumbColor={notifyOpenMatches ? ProTennisColors.neonCyan : ProTennisColors.textSecondary}
              />
            </View>
            <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Friend booking alerts</Text>
                <Text style={styles.settingDescription}>Know when friends book courts</Text>
              </View>
              <Switch
                value={notifyFriendBookings}
                onValueChange={(val) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setNotifyFriendBookings(val);
                }}
                trackColor={{ false: ProTennisColors.surfaceElevated, true: ProTennisColors.neonCyan + "60" }}
                thumbColor={notifyFriendBookings ? ProTennisColors.neonCyan : ProTennisColors.textSecondary}
              />
            </View>
          </NeonBorderCard>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(800).duration(300)}>
          <View style={styles.filterNote}>
            <Feather name="info" size={14} color={ProTennisColors.textMuted} />
            <Text style={styles.filterNoteText}>
              Your preferences filter Open Matches and sessions to show only matches that fit your schedule.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ProTennisColors.midnightBlue,
  },
  loading: {
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  headerSaveButton: {
    backgroundColor: ProTennisColors.neonGreen,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.sm,
  },
  headerSaveText: {
    fontSize: 14,
    fontWeight: "700",
    color: ProTennisColors.midnightBlue,
  },
  neonCard: {
    marginBottom: Spacing.lg,
    position: "relative",
  },
  neonCardGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  neonCardGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
  },
  neonCardBorder: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    backgroundColor: ProTennisColors.surfaceCard,
    overflow: "hidden",
  },
  insightsContent: {
    padding: Spacing.md,
  },
  insightsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  insightsIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ProTennisColors.gold + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  insightsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: ProTennisColors.gold,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: 4,
  },
  insightText: {
    fontSize: 14,
    color: ProTennisColors.white,
    flex: 1,
  },
  bookingsCount: {
    fontSize: 12,
    color: ProTennisColors.textMuted,
    marginTop: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: ProTennisColors.white,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.md,
    backgroundColor: ProTennisColors.surfaceCard,
    borderWidth: 1,
    borderColor: ProTennisColors.border,
  },
  chipWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: BorderRadius.md,
    backgroundColor: ProTennisColors.surfaceCard,
    borderWidth: 1,
    borderColor: ProTennisColors.border,
  },
  chipSelected: {
    backgroundColor: ProTennisColors.surfaceElevated,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
  },
  chipTextSelected: {
    color: ProTennisColors.neonCyan,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: ProTennisColors.border,
  },
  settingInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  settingDescription: {
    fontSize: 12,
    color: ProTennisColors.textMuted,
    marginTop: 2,
  },
  filterNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: ProTennisColors.surfaceCard,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xl,
  },
  filterNoteText: {
    fontSize: 13,
    color: ProTennisColors.textMuted,
    flex: 1,
    lineHeight: 18,
  },
}));
