import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

type CourtPreference = {
  id: string;
  name: string;
  type: "indoor" | "outdoor";
  isSelected: boolean;
  priority: number;
};

const PREFERRED_TYPES = [
  { value: "no_preference", label: "No Preference", icon: "grid" },
  { value: "indoor", label: "Indoor", icon: "home" },
  { value: "outdoor", label: "Outdoor", icon: "sun" },
];

const FALLBACK_OPTIONS = [
  { value: "suggest", label: "Suggest alternatives", icon: "message-circle" },
  { value: "block", label: "Block booking", icon: "slash" },
];

export default function CourtPreferencesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { coach } = useCoach();
  const queryClient = useQueryClient();

  const [courts, setCourts] = useState<CourtPreference[]>([
    { id: "court-a", name: "Court A", type: "indoor", isSelected: true, priority: 1 },
    { id: "court-b", name: "Court B", type: "indoor", isSelected: true, priority: 2 },
    { id: "court-c", name: "Court C", type: "outdoor", isSelected: false, priority: 3 },
    { id: "court-d", name: "Court D", type: "outdoor", isSelected: true, priority: 4 },
  ]);
  const [preferredType, setPreferredType] = useState("no_preference");
  const [daylightOnly, setDaylightOnly] = useState(false);
  const [maxPerCourt, setMaxPerCourt] = useState(8);
  const [maxTotal, setMaxTotal] = useState(10);
  const [fallbackBehavior, setFallbackBehavior] = useState("suggest");
  const [hasChanges, setHasChanges] = useState(false);

  const { data: courtsData, isLoading } = useQuery({
    queryKey: ["/api/courts"],
    enabled: true,
  });

  const { data: preferencesData } = useQuery({
    queryKey: ["/api/coaches", coach?.id, "court-preferences"],
    enabled: !!coach?.id,
  });

  // Track if we've hydrated from API
  const [hasHydratedCourts, setHasHydratedCourts] = useState(false);
  const [hasHydratedPrefs, setHasHydratedPrefs] = useState(false);

  // Hydrate courts from API data - only once
  useEffect(() => {
    if (courtsData && Array.isArray(courtsData) && courtsData.length > 0 && !hasHydratedCourts) {
      const apiCourts = courtsData as any[];
      // Initialize all courts as unselected by default - preferences will mark selected ones
      const hydratedCourts = apiCourts.map((court: any, index: number) => ({
        id: court.id,
        name: court.name,
        type: (court.type === "indoor" ? "indoor" : "outdoor") as "indoor" | "outdoor",
        isSelected: false, // Start unselected, preferences will mark selected
        priority: index + 1,
      }));
      setCourts(hydratedCourts);
      setHasHydratedCourts(true);
    }
  }, [courtsData, hasHydratedCourts]);

  // Hydrate preferences from API data - only after courts are hydrated
  useEffect(() => {
    if (preferencesData && hasHydratedCourts && !hasHydratedPrefs) {
      const prefs = preferencesData as any;
      if (prefs.courtPreferences && Array.isArray(prefs.courtPreferences)) {
        setCourts((currentCourts) => {
          const updatedCourts = currentCourts.map((court) => {
            const pref = prefs.courtPreferences.find((p: any) => p.courtId === court.id);
            if (pref) {
              return {
                ...court,
                isSelected: true,
                priority: typeof pref.priority === "number" ? pref.priority : court.priority,
              };
            }
            return court; // Keep unselected if no preference found
          });
          // Sort by priority only if we have preferences
          if (prefs.courtPreferences.length > 0) {
            return updatedCourts.sort((a, b) => a.priority - b.priority);
          }
          return updatedCourts;
        });
      } else {
        // No preferences saved yet - select all courts by default for new users
        setCourts((currentCourts) => currentCourts.map((c) => ({ ...c, isSelected: true })));
      }
      if (prefs.rules) {
        const rules = prefs.rules;
        if (rules.preferredType) setPreferredType(rules.preferredType);
        if (rules.daylightOnly !== undefined) setDaylightOnly(rules.daylightOnly);
        if (rules.maxSessionsPerCourtPerDay) setMaxPerCourt(rules.maxSessionsPerCourtPerDay);
        if (rules.maxTotalSessionsPerDay) setMaxTotal(rules.maxTotalSessionsPerDay);
        if (rules.fallbackBehavior) setFallbackBehavior(rules.fallbackBehavior);
      }
      setHasHydratedPrefs(true);
    }
  }, [preferencesData, hasHydratedCourts, hasHydratedPrefs]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/coaches/${coach?.id}/court-preferences`, {
        courtPreferences: courts.filter((c) => c.isSelected).map((c, i) => ({
          courtId: c.id,
          priority: i,
        })),
        rules: {
          preferredType,
          daylightOnly,
          maxSessionsPerCourtPerDay: maxPerCourt,
          maxTotalSessionsPerDay: maxTotal,
          fallbackBehavior,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", coach?.id] });
      setHasChanges(false);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert("Saved", "Your court preferences have been updated.");
    },
    onError: () => {
      Alert.alert("Error", "Failed to save preferences. Please try again.");
    },
  });

  const toggleCourt = useCallback((courtId: string) => {
    setCourts((prev) =>
      prev.map((c) =>
        c.id === courtId ? { ...c, isSelected: !c.isSelected } : c
      )
    );
    setHasChanges(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const moveCourt = useCallback((courtId: string, direction: "up" | "down") => {
    setCourts((prev) => {
      const index = prev.findIndex((c) => c.id === courtId);
      if (
        (direction === "up" && index === 0) ||
        (direction === "down" && index === prev.length - 1)
      ) {
        return prev;
      }
      const newCourts = [...prev];
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      [newCourts[index], newCourts[swapIndex]] = [newCourts[swapIndex], newCourts[index]];
      return newCourts.map((c, i) => ({ ...c, priority: i + 1 }));
    });
    setHasChanges(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const selectedCount = courts.filter((c) => c.isSelected).length;

  // Show loading state while fetching data
  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <Feather name="grid" size={48} color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading court preferences...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Court Preferences</Text>
          <Text style={styles.headerSubtitle}>Where do you prefer to coach?</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoCard}>
          <Feather name="info" size={18} color={Colors.dark.xpCyan} />
          <Text style={styles.infoText}>
            These preferences affect session creation and auto-scheduling
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Court Selection</Text>
          <Text style={styles.sectionHint}>
            Select your preferred courts and drag to set priority
          </Text>

          {courts.map((court, index) => (
            <View key={court.id} style={styles.courtCard}>
              <View style={styles.courtCardLeft}>
                <Pressable
                  style={[
                    styles.courtCheckbox,
                    court.isSelected && styles.courtCheckboxActive,
                  ]}
                  onPress={() => toggleCourt(court.id)}
                >
                  {court.isSelected ? (
                    <Feather name="check" size={14} color={Colors.dark.backgroundRoot} />
                  ) : null}
                </Pressable>
                <View style={styles.courtInfo}>
                  <Text style={[styles.courtName, !court.isSelected && styles.courtNameInactive]}>
                    {court.name}
                  </Text>
                  <View style={styles.courtTypeBadge}>
                    <Feather
                      name={court.type === "indoor" ? "home" : "sun"}
                      size={12}
                      color={Colors.dark.tabIconDefault}
                    />
                    <Text style={styles.courtTypeText}>
                      {court.type === "indoor" ? "Indoor" : "Outdoor"}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.courtCardRight}>
                {court.isSelected ? (
                  <View style={styles.priorityBadge}>
                    <Text style={styles.priorityText}>
                      #{courts.filter((c) => c.isSelected).findIndex((c) => c.id === court.id) + 1}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.moveButtons}>
                  <Pressable
                    style={[styles.moveButton, index === 0 && styles.moveButtonDisabled]}
                    onPress={() => moveCourt(court.id, "up")}
                    disabled={index === 0}
                  >
                    <Feather
                      name="chevron-up"
                      size={18}
                      color={index === 0 ? Colors.dark.backgroundTertiary : Colors.dark.text}
                    />
                  </Pressable>
                  <Pressable
                    style={[styles.moveButton, index === courts.length - 1 && styles.moveButtonDisabled]}
                    onPress={() => moveCourt(court.id, "down")}
                    disabled={index === courts.length - 1}
                  >
                    <Feather
                      name="chevron-down"
                      size={18}
                      color={index === courts.length - 1 ? Colors.dark.backgroundTertiary : Colors.dark.text}
                    />
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferred Conditions</Text>

          <View style={styles.preferenceCard}>
            <Text style={styles.preferenceLabel}>Court Type</Text>
            <View style={styles.optionRow}>
              {PREFERRED_TYPES.map((type) => (
                <Pressable
                  key={type.value}
                  style={[
                    styles.optionButton,
                    preferredType === type.value && styles.optionButtonActive,
                  ]}
                  onPress={() => {
                    setPreferredType(type.value);
                    setHasChanges(true);
                  }}
                >
                  <Feather
                    name={type.icon as any}
                    size={16}
                    color={preferredType === type.value ? Colors.dark.backgroundRoot : Colors.dark.text}
                  />
                  <Text
                    style={[
                      styles.optionButtonText,
                      preferredType === type.value && styles.optionButtonTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.toggleCard}>
            <View style={styles.toggleInfo}>
              <Feather name="sunrise" size={18} color={Colors.dark.gold} />
              <View>
                <Text style={styles.toggleLabel}>Daylight Only</Text>
                <Text style={styles.toggleHint}>Prefer courts with natural light</Text>
              </View>
            </View>
            <Switch
              value={daylightOnly}
              onValueChange={(value) => {
                setDaylightOnly(value);
                setHasChanges(true);
              }}
              trackColor={{ false: Colors.dark.backgroundTertiary, true: Colors.dark.primary }}
              thumbColor={Colors.dark.text}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Load Limits</Text>

          <View style={styles.limitCard}>
            <View style={styles.limitRow}>
              <Feather name="layers" size={18} color={Colors.dark.primary} />
              <Text style={styles.limitLabel}>Max sessions per court per day</Text>
            </View>
            <View style={styles.counterRow}>
              <Pressable
                style={styles.counterButton}
                onPress={() => {
                  setMaxPerCourt(Math.max(1, maxPerCourt - 1));
                  setHasChanges(true);
                }}
              >
                <Feather name="minus" size={18} color={Colors.dark.text} />
              </Pressable>
              <Text style={styles.counterValue}>{maxPerCourt}</Text>
              <Pressable
                style={styles.counterButton}
                onPress={() => {
                  setMaxPerCourt(Math.min(15, maxPerCourt + 1));
                  setHasChanges(true);
                }}
              >
                <Feather name="plus" size={18} color={Colors.dark.text} />
              </Pressable>
            </View>
          </View>

          <View style={styles.limitCard}>
            <View style={styles.limitRow}>
              <Feather name="calendar" size={18} color={Colors.dark.primary} />
              <Text style={styles.limitLabel}>Max total sessions per day</Text>
            </View>
            <View style={styles.counterRow}>
              <Pressable
                style={styles.counterButton}
                onPress={() => {
                  setMaxTotal(Math.max(1, maxTotal - 1));
                  setHasChanges(true);
                }}
              >
                <Feather name="minus" size={18} color={Colors.dark.text} />
              </Pressable>
              <Text style={styles.counterValue}>{maxTotal}</Text>
              <Pressable
                style={styles.counterButton}
                onPress={() => {
                  setMaxTotal(Math.min(20, maxTotal + 1));
                  setHasChanges(true);
                }}
              >
                <Feather name="plus" size={18} color={Colors.dark.text} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fallback Behavior</Text>
          <Text style={styles.sectionHint}>What happens if preferred court is unavailable?</Text>

          <View style={styles.fallbackRow}>
            {FALLBACK_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.fallbackCard,
                  fallbackBehavior === option.value && styles.fallbackCardActive,
                ]}
                onPress={() => {
                  setFallbackBehavior(option.value);
                  setHasChanges(true);
                }}
              >
                <Feather
                  name={option.icon as any}
                  size={24}
                  color={fallbackBehavior === option.value ? Colors.dark.primary : Colors.dark.tabIconDefault}
                />
                <Text
                  style={[
                    styles.fallbackLabel,
                    fallbackBehavior === option.value && styles.fallbackLabelActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      {hasChanges ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Pressable
            style={styles.resetButton}
            onPress={() => {
              setCourts((prev) => prev.map((c) => ({ ...c, isSelected: true })));
              setPreferredType("no_preference");
              setDaylightOnly(false);
              setMaxPerCourt(8);
              setMaxTotal(10);
              setFallbackBehavior("suggest");
              setHasChanges(false);
            }}
          >
            <Text style={styles.resetButtonText}>Reset to Default</Text>
          </Pressable>
          <Pressable
            style={styles.saveButton}
            onPress={() => saveMutation.mutate()}
          >
            <Text style={styles.saveButtonText}>Save Preferences</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  backButton: {
    padding: Spacing.sm,
    marginRight: Spacing.sm,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  headerSubtitle: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  infoText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    flex: 1,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  sectionHint: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginTop: -Spacing.sm,
  },
  courtCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  courtCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  courtCheckbox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: Colors.dark.tabIconDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  courtCheckboxActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  courtInfo: {
    gap: Spacing.xs,
  },
  courtName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  courtNameInactive: {
    color: Colors.dark.tabIconDefault,
  },
  courtTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  courtTypeText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  courtCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  priorityBadge: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  priorityText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  moveButtons: {
    gap: Spacing.xs,
  },
  moveButton: {
    padding: Spacing.xs,
  },
  moveButtonDisabled: {
    opacity: 0.3,
  },
  preferenceCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  preferenceLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  optionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  optionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  optionButtonActive: {
    backgroundColor: Colors.dark.primary,
  },
  optionButtonText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  optionButtonTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  toggleInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  toggleLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  toggleHint: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  limitCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  limitLabel: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  counterButton: {
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  counterValue: {
    ...Typography.h2,
    color: Colors.dark.primary,
    minWidth: 50,
    textAlign: "center",
  },
  fallbackRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  fallbackCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  fallbackCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(46, 204, 64, 0.1)",
  },
  fallbackLabel: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
  fallbackLabelActive: {
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
  },
  resetButton: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  resetButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  saveButton: {
    flex: 2,
    backgroundColor: Colors.dark.primary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
});
