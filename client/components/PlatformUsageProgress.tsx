import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { getApiUrl } from "@/lib/query-client";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import {
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
  FunctionColors,
Backgrounds, } from "@/constants/theme";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STORAGE_KEY = "@glow_platform_usage_dismissed";

export interface FeatureUsage {
  id: string;
  name: string;
  icon: string;
  isUsed: boolean;
}

export interface PlatformUsageProgressProps {
  role: string;
  features: FeatureUsage[];
  onExploreFeature?: (featureId: string) => void;
}

function CircularProgress({
  percentage,
  size = 64,
  strokeWidth = 5,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={"rgba(255, 255, 255, 0.04)"}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={GlowColors.primary}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90, ${size / 2}, ${size / 2})`}
        />
      </Svg>
      <Text style={styles.progressPercentage}>{Math.round(percentage)}%</Text>
    </View>
  );
}

export function PlatformUsageProgress({
  role,
  features,
  onExploreFeature,
}: PlatformUsageProgressProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const usedCount = features.filter((f) => f.isUsed).length;
  const totalCount = features.length;
  const percentage = totalCount > 0 ? (usedCount / totalCount) * 100 : 0;
  const unusedFeatures = features.filter((f) => !f.isUsed);

  const localStorageKey = `${STORAGE_KEY}_${role}`;
  const serverStateKey = `platform_usage_dismissed_${role}`;

  const persistDismissedToServer = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;
      const apiUrl = getApiUrl();
      await fetch(new URL("/api/user/onboarding-state", apiUrl).toString(), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: serverStateKey, value: true }),
      });
    } catch (error) {
      console.warn("Failed to save platform usage dismissal to server:", error);
    }
  }, [serverStateKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let localDismissed = false;
      try {
        const dismissed = await AsyncStorage.getItem(localStorageKey);
        if (dismissed === "true") {
          localDismissed = true;
          if (!cancelled) setIsDismissed(true);
        }
      } catch {}

      try {
        const token = await AsyncStorage.getItem("authToken");
        if (!token) return;
        const apiUrl = getApiUrl();
        const response = await fetch(
          new URL("/api/user/onboarding-state", apiUrl).toString(),
          { headers: { "Authorization": `Bearer ${token}` } },
        );
        if (!response.ok) return;
        const data = await response.json();
        const serverDismissed = data?.state?.[serverStateKey] === true;
        if (serverDismissed) {
          if (!cancelled) setIsDismissed(true);
          AsyncStorage.setItem(localStorageKey, "true").catch(() => {});
        } else if (localDismissed) {
          persistDismissedToServer();
        }
      } catch (error) {
        console.warn("Failed to load platform usage dismissal from server:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, localStorageKey, serverStateKey, persistDismissedToServer]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    AsyncStorage.setItem(localStorageKey, "true").catch(() => {});
    setIsDismissed(true);
    persistDismissedToServer();
  }, [localStorageKey, persistDismissedToServer]);

  const toggleExpand = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((prev) => !prev);
  }, []);

  const handleTryFeature = useCallback(
    (featureId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onExploreFeature?.(featureId);
    },
    [onExploreFeature]
  );

  if (isDismissed || totalCount === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.card}>
      <View style={styles.cardHeader}>
        <CircularProgress percentage={percentage} />
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Platform Usage</Text>
          <Text style={styles.headerSubtitle}>
            You're using {usedCount} of {totalCount} features
          </Text>
          {percentage === 100 ? (
            <Text style={styles.completeText}>You're a power user!</Text>
          ) : null}
        </View>
        <Pressable style={styles.dismissButton} onPress={handleDismiss} hitSlop={8}>
          <Ionicons name="close" size={18} color={TextColors.muted} />
        </Pressable>
      </View>

      {unusedFeatures.length > 0 ? (
        <>
          <Pressable style={styles.expandToggle} onPress={toggleExpand}>
            <Text style={styles.expandText}>
              {isExpanded ? "Hide" : "Show"} unused features ({unusedFeatures.length})
            </Text>
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={GlowColors.primary}
            />
          </Pressable>

          {isExpanded ? (
            <View style={styles.unusedList}>
              {unusedFeatures.map((feature, index) => (
                <Animated.View
                  key={feature.id}
                  entering={FadeInDown.delay(index * 50).duration(200)}
                  style={styles.unusedItem}
                >
                  <View style={styles.unusedItemLeft}>
                    <View style={styles.unusedIconContainer}>
                      <Ionicons
                        name={feature.icon as keyof typeof Ionicons.glyphMap}
                        size={18}
                        color={TextColors.muted}
                      />
                    </View>
                    <Text style={styles.unusedName}>{feature.name}</Text>
                  </View>
                  {onExploreFeature ? (
                    <Pressable
                      style={styles.tryItButton}
                      onPress={() => handleTryFeature(feature.id)}
                    >
                      <Text style={styles.tryItText}>Try it</Text>
                    </Pressable>
                  ) : null}
                </Animated.View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  card: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    padding: Spacing.lg,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.sm,
  },
  headerTitle: {
    ...Typography.h4,
    color: TextColors.primary,
  },
  headerSubtitle: {
    ...Typography.caption,
    color: TextColors.secondary,
    marginTop: 2,
  },
  completeText: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontWeight: "600",
    marginTop: 4,
  },
  progressPercentage: {
    position: "absolute",
    ...Typography.caption,
    fontWeight: "700",
    color: GlowColors.primary,
    fontSize: 14,
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Backgrounds.surface,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  expandToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  expandText: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontWeight: "500",
  },
  unusedList: {
    marginTop: Spacing.sm,
  },
  unusedItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.xs,
    backgroundColor: Backgrounds.surface,
  },
  unusedItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  unusedIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  unusedName: {
    ...Typography.small,
    color: TextColors.secondary,
    flex: 1,
  },
  tryItButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    backgroundColor: `${GlowColors.primary}20`,
    borderWidth: 1,
    borderColor: `${GlowColors.primary}40`,
  },
  tryItText: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontWeight: "600",
    fontSize: 11,
  },
}));

export default PlatformUsageProgress;
