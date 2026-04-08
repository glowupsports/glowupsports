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
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function GamingHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <LinearGradient
      colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
      style={styles.gamingHeader}
    >
      <LinearGradient
        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerTopLine}
      />
      <View style={styles.headerContent}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Feather name="arrow-left" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.gamingHeaderTitle}>{title}</Text>
          {subtitle ? <Text style={styles.gamingHeaderSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
    </LinearGradient>
  );
}

function AnimatedButton({ onPress, style, children, disabled }: any) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[animatedStyle, style]}
      disabled={disabled}
    >
      {children}
    </AnimatedPressable>
  );
}

export default function CourtPreferencesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { coach } = useCoach();
  const queryClient = useQueryClient();

  const [courts, setCourts] = useState<CourtPreference[]>([]);
  const [preferredType, setPreferredType] = useState("no_preference");
  const [daylightOnly, setDaylightOnly] = useState(false);
  const [maxPerCourt, setMaxPerCourt] = useState(8);
  const [maxTotal, setMaxTotal] = useState(10);
  const [fallbackBehavior, setFallbackBehavior] = useState("suggest");
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: courtsData, isLoading } = useQuery({
    queryKey: ["/api/courts"],
    enabled: true,
  });

  const { data: preferencesData, isLoading: isLoadingPrefs, isFetching: isFetchingPrefs } = useQuery({
    queryKey: ["/api/coaches", coach?.id, "court-preferences"],
    enabled: !!coach?.id,
  });

  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (isSaving || isFetchingPrefs) return;
    if (isHydrated && hasChanges) return;
    if (!courtsData || !Array.isArray(courtsData) || courtsData.length === 0) return;
    if (coach?.id && preferencesData === undefined) return;
    
    const apiCourts = courtsData as any[];
    const prefs = preferencesData as any;
    
    const hydratedCourts = apiCourts.map((court: any, index: number) => {
      const baseCourt = {
        id: court.id,
        name: court.name,
        type: (court.type === "indoor" ? "indoor" : "outdoor") as "indoor" | "outdoor",
        priority: index + 1,
        isSelected: true,
      };
      
      if (prefs?.courtPreferences && Array.isArray(prefs.courtPreferences)) {
        const pref = prefs.courtPreferences.find((p: any) => p.courtId === court.id);
        if (pref) {
          return {
            ...baseCourt,
            isSelected: true,
            priority: typeof pref.priority === "number" ? pref.priority : baseCourt.priority,
          };
        } else {
          return { ...baseCourt, isSelected: false };
        }
      }
      
      return baseCourt;
    });
    
    if (prefs?.courtPreferences?.length > 0) {
      hydratedCourts.sort((a, b) => a.priority - b.priority);
    }
    
    setCourts(hydratedCourts);
    setIsHydrated(true);
    
    if (prefs?.rules) {
      const rules = prefs.rules;
      if (rules.preferredType) setPreferredType(rules.preferredType);
      if (rules.daylightOnly !== undefined) setDaylightOnly(rules.daylightOnly);
      if (rules.maxSessionsPerCourtPerDay) setMaxPerCourt(rules.maxSessionsPerCourtPerDay);
      if (rules.maxTotalSessionsPerDay) setMaxTotal(rules.maxTotalSessionsPerDay);
      if (rules.fallbackBehavior) setFallbackBehavior(rules.fallbackBehavior);
    }
  }, [courtsData, preferencesData, hasChanges, isSaving, isFetchingPrefs, isHydrated, coach?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      setIsSaving(true);
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
      setTimeout(() => setIsSaving(false), 500);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert("Saved", "Your court preferences have been updated.");
    },
    onError: () => {
      setIsSaving(false);
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

  if (!isHydrated) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <Feather name="grid" size={48} color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading court preferences...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <GamingHeader
        title="COURT PREFERENCES"
        subtitle="Where do you prefer to coach?"
        onBack={() => navigation.goBack()}
      />

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
          <Text style={styles.sectionTitle}>COURT SELECTION</Text>
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
                    <Feather name="check" size={14} color={Colors.dark.buttonText} />
                  ) : null}
                </Pressable>
                <View style={styles.courtInfo}>
                  <Text style={[styles.courtName, !court.isSelected && styles.courtNameInactive]}>
                    {court.name}
                  </Text>
                  <View style={styles.courtTypeBadge}>
                    <View style={[
                      styles.courtTypeIndicator,
                      { backgroundColor: court.type === "indoor" ? Colors.dark.xpCyan : Colors.dark.gold }
                    ]} />
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
                      color={index === 0 ? Colors.dark.backgroundTertiary : Colors.dark.xpCyan}
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
                      color={index === courts.length - 1 ? Colors.dark.backgroundTertiary : Colors.dark.xpCyan}
                    />
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PREFERRED CONDITIONS</Text>

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
                    color={preferredType === type.value ? Colors.dark.backgroundRoot : Colors.dark.xpCyan}
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
          <Text style={styles.sectionTitle}>LOAD LIMITS</Text>

          <View style={styles.limitCard}>
            <View style={styles.limitRow}>
              <Feather name="layers" size={18} color={Colors.dark.xpCyan} />
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
              <Feather name="calendar" size={18} color={Colors.dark.xpCyan} />
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
          <Text style={styles.sectionTitle}>FALLBACK BEHAVIOR</Text>
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
                  color={fallbackBehavior === option.value ? Colors.dark.primary : Colors.dark.xpCyan}
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
          <AnimatedButton
            style={styles.saveButton}
            onPress={() => saveMutation.mutate()}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveButtonGradient}
            >
              <Text style={styles.saveButtonText}>Save Preferences</Text>
            </LinearGradient>
          </AnimatedButton>
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
  gamingHeader: {
    paddingBottom: Spacing.md,
  },
  headerTopLine: {
    height: 3,
    width: "100%",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  backButton: {
    padding: Spacing.sm,
    marginRight: Spacing.sm,
  },
  headerTitleContainer: {
    flex: 1,
  },
  gamingHeaderTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  gamingHeaderSubtitle: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
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
    borderColor: `${Colors.dark.xpCyan}30`,
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
    letterSpacing: 1.5,
    textTransform: "uppercase",
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
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
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
    borderColor: Colors.dark.xpCyan,
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
  courtTypeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
    color: Colors.dark.buttonText,
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
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
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
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}30`,
  },
  optionButtonActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  optionButtonText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
  optionButtonTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
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
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  limitLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  counterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.dark.xpCyan}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    ...Typography.h2,
    color: Colors.dark.xpCyan,
    minWidth: 40,
    textAlign: "center",
  },
  fallbackRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  fallbackCard: {
    flex: 1,
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}30`,
  },
  fallbackCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: `${Colors.dark.primary}15`,
  },
  fallbackLabel: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    textAlign: "center",
  },
  fallbackLabelActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
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
    borderTopColor: `${Colors.dark.primary}30`,
  },
  resetButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.tabIconDefault,
  },
  resetButtonText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  saveButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  saveButtonGradient: {
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
});
