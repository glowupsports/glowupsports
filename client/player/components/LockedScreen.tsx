import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayerLevelContext } from "../context/PlayerLevelContext";

interface LockedScreenProps {
  featureKey: string;
  children: React.ReactNode;
}

export function LockedScreen({ featureKey, children }: LockedScreenProps) {
  const { isFeatureUnlocked, level, getFeatureInfo } = usePlayerLevelContext();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const isUnlocked = isFeatureUnlocked(featureKey);
  const featureInfo = getFeatureInfo(featureKey);

  // If the feature key is not in the DB config at all, treat it as unlocked
  // to prevent regressions when new keys are added to the frontend before seeding
  if (isUnlocked || !featureInfo) {
    return <>{children}</>;
  }
  const requiredLevel = featureInfo?.requiredLevel || 1;
  const featureName = featureInfo?.featureName || featureKey.replace(/_/g, " ");
  const featureIcon = featureInfo?.featureIcon || "lock-closed";
  const levelsToGo = requiredLevel - level;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["#1A1A1A", "#0D0D0D"]}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.content}>
        <View style={styles.lockIconContainer}>
          <LinearGradient
            colors={["#2A2A2A", "#1A1A1A"]}
            style={styles.iconGradient}
          >
            <Ionicons 
              name="lock-closed" 
              size={48} 
              color={Colors.dark.primary} 
            />
          </LinearGradient>
        </View>

        <Text style={styles.title}>Feature Locked</Text>
        
        <View style={styles.featureCard}>
          <View style={styles.featureIconWrapper}>
            <Ionicons 
              name={featureIcon as any} 
              size={24} 
              color={Colors.dark.primary} 
            />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureName}>{featureName}</Text>
            {featureInfo?.featureDescription && (
              <Text style={styles.featureDescription}>
                {featureInfo.featureDescription}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.requirementCard}>
          <Text style={styles.requirementLabel}>Unlocks at</Text>
          <View style={styles.levelBadge}>
            <Ionicons name="star" size={16} color={Colors.dark.gold} />
            <Text style={styles.levelText}>Level {requiredLevel}</Text>
          </View>
        </View>

        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>
            You are Level {level}
          </Text>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${Math.min((level / requiredLevel) * 100, 100)}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressHint}>
            {levelsToGo > 0 
              ? `${levelsToGo} more level${levelsToGo > 1 ? 's' : ''} to unlock`
              : 'Almost there!'
            }
          </Text>
        </View>

        <Text style={styles.tipText}>
          Keep training and completing quests to earn XP and level up!
        </Text>

        <Pressable 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface LockedSectionProps {
  featureKey: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function LockedSection({ featureKey, children, fallback }: LockedSectionProps) {
  const { isFeatureUnlocked, getFeatureInfo } = usePlayerLevelContext();

  const isUnlocked = isFeatureUnlocked(featureKey);

  if (isUnlocked) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const featureInfo = getFeatureInfo(featureKey);
  const requiredLevel = featureInfo?.requiredLevel || 1;
  const featureName = featureInfo?.featureName || featureKey.replace(/_/g, " ");

  return (
    <View style={styles.lockedSection}>
      <View style={styles.lockedSectionIcon}>
        <Ionicons name="lock-closed" size={20} color={Colors.dark.primary} />
      </View>
      <View style={styles.lockedSectionInfo}>
        <Text style={styles.lockedSectionTitle}>{featureName}</Text>
        <Text style={styles.lockedSectionHint}>
          Unlocks at Level {requiredLevel}
        </Text>
      </View>
      <View style={styles.lockedSectionBadge}>
        <Ionicons name="star" size={12} color={Colors.dark.gold} />
        <Text style={styles.lockedSectionLevel}>L{requiredLevel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  lockIconContainer: {
    marginBottom: Spacing.xl,
  },
  iconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.primary + "40",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    width: "100%",
    marginBottom: Spacing.lg,
  },
  featureIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  featureInfo: {
    flex: 1,
  },
  featureName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  featureDescription: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  requirementCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    width: "100%",
    marginBottom: Spacing.lg,
  },
  requirementLabel: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  levelText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  progressSection: {
    width: "100%",
    marginBottom: Spacing.xl,
  },
  progressLabel: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 4,
  },
  progressHint: {
    fontSize: 13,
    color: Colors.dark.primary,
    textAlign: "center",
  },
  tipText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  lockedSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
    borderStyle: "dashed",
  },
  lockedSectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  lockedSectionInfo: {
    flex: 1,
  },
  lockedSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  lockedSectionHint: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  lockedSectionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  lockedSectionLevel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
});
