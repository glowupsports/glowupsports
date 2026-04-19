import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayerLevelContext } from "../context/PlayerLevelContext";

interface FeatureGateProps {
  featureKey: string;
  children: React.ReactNode;
  showTeaser?: boolean;
  onLockedPress?: () => void;
}

export function FeatureGate({
  featureKey,
  children,
  showTeaser = true,
  onLockedPress,
}: FeatureGateProps) {
  const { isFeatureUnlocked, getFeatureInfo } = usePlayerLevelContext();

  const isUnlocked = isFeatureUnlocked(featureKey);

  if (isUnlocked) {
    return <>{children}</>;
  }

  if (!showTeaser) {
    return null;
  }

  const featureInfo = getFeatureInfo(featureKey);
  const requiredLevel = featureInfo?.requiredLevel || 1;
  const featureName = featureInfo?.featureName || featureKey.replace(/_/g, " ");
  const featureIcon = featureInfo?.featureIcon || "lock-closed";

  return (
    <Pressable 
      style={styles.lockedContainer}
      onPress={onLockedPress}
    >
      <View style={styles.lockedOverlay}>
        <View style={styles.lockIconContainer}>
          <Ionicons name="lock-closed" size={24} color={Colors.dark.textMuted} />
        </View>
        <Text style={styles.lockedTitle}>{featureName}</Text>
        <View style={styles.unlockBadge}>
          <Ionicons name="star" size={12} color={Colors.dark.gold} />
          <Text style={styles.unlockText}>Unlock at Level {requiredLevel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

interface LockedFeatureCardProps {
  featureKey: string;
  requiredLevel: number;
  featureName: string;
  featureDescription?: string | null;
  featureIcon?: string;
  currentLevel: number;
  onPress?: () => void;
}

export function LockedFeatureCard({
  featureKey,
  requiredLevel,
  featureName,
  featureDescription,
  featureIcon = "lock-closed",
  currentLevel,
  onPress,
}: LockedFeatureCardProps) {
  const levelsAway = requiredLevel - currentLevel;
  const isClose = levelsAway <= 2;

  return (
    <Pressable 
      style={[
        styles.lockedCard,
        isClose && styles.lockedCardClose
      ]}
      onPress={onPress}
    >
      <View style={styles.lockedCardContent}>
        <View style={[
          styles.iconWrapper,
          isClose && styles.iconWrapperClose
        ]}>
          <Ionicons 
            name={featureIcon as any} 
            size={24} 
            color={isClose ? Colors.dark.primary : Colors.dark.textMuted} 
          />
        </View>
        
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{featureName}</Text>
          {featureDescription && (
            <Text style={styles.cardDescription} numberOfLines={2}>
              {featureDescription}
            </Text>
          )}
        </View>

        <View style={styles.levelBadge}>
          <Ionicons 
            name="lock-closed" 
            size={12} 
            color={isClose ? Colors.dark.gold : Colors.dark.textMuted} 
          />
          <Text style={[
            styles.levelText,
            isClose && styles.levelTextClose
          ]}>
            L{requiredLevel}
          </Text>
        </View>
      </View>

      {isClose && (
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill,
              { width: `${Math.max(0, 100 - (levelsAway * 50))}%` }
            ]} 
          />
        </View>
      )}
    </Pressable>
  );
}

interface UpcomingUnlocksListProps {
  maxItems?: number;
}

export function UpcomingUnlocksList({
  maxItems = 5,
}: UpcomingUnlocksListProps) {
  const { level, featureUnlockConfig } = usePlayerLevelContext();

  if (!featureUnlockConfig || featureUnlockConfig.length === 0) {
    return null;
  }

  const currentLevel = level;
  const lockedFeatures = featureUnlockConfig
    .filter(f => f.requiredLevel > currentLevel && f.requiredLevel <= currentLevel + 5)
    .sort((a, b) => a.requiredLevel - b.requiredLevel)
    .slice(0, maxItems);

  if (lockedFeatures.length === 0) {
    return null;
  }

  return (
    <View style={styles.upcomingContainer}>
      <View style={styles.upcomingHeader}>
        <Ionicons name="gift-outline" size={16} color={Colors.dark.primary} />
        <Text style={styles.upcomingTitle}>Upcoming Unlocks</Text>
      </View>
      
      <View style={styles.upcomingList}>
        {lockedFeatures.map((feature, idx) => (
          <LockedFeatureCard
            key={feature.featureKey}
            featureKey={feature.featureKey}
            requiredLevel={feature.requiredLevel}
            featureName={feature.featureName}
            featureDescription={feature.featureDescription}
            featureIcon={feature.featureIcon || "star-outline"}
            currentLevel={currentLevel}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockedContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
  },
  lockedOverlay: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  lockIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  unlockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${Colors.dark.gold}20`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  unlockText: {
    fontSize: 12,
    color: Colors.dark.gold,
    fontWeight: "500",
  },
  lockedCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.sm,
  },
  lockedCardClose: {
    borderColor: `${Colors.dark.primary}50`,
  },
  lockedCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapperClose: {
    backgroundColor: `${Colors.dark.primary}20`,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  cardDescription: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  levelText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  levelTextClose: {
    color: Colors.dark.gold,
  },
  progressBar: {
    height: 3,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
  },
  upcomingContainer: {
    gap: Spacing.md,
  },
  upcomingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  upcomingTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  upcomingList: {
    gap: Spacing.xs,
  },
});
