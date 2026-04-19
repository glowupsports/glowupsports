import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ProTennisColors, Backgrounds, Spacing, BorderRadius, GlowColors, Colors } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface TileConfig {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route: string;
  requiredLevel?: number;
}

const PERFORMANCE_TILES: TileConfig[] = [
  {
    id: "swing-lab",
    title: "SWING LAB",
    subtitle: "Analyze your strokes",
    icon: "play-circle-outline",
    color: ProTennisColors.electricGreen,
    route: "SkillEvidence",
    requiredLevel: 3,
  },
  {
    id: "my-data",
    title: "MY DATA",
    subtitle: "Track progress",
    icon: "analytics-outline",
    color: ProTennisColors.neonCyan,
    route: "PlayerProgress",
    requiredLevel: 1,
  },
  {
    id: "pro-shop",
    title: "PRO SHOP",
    subtitle: "Upgrade equipment",
    icon: "bag-handle-outline",
    color: ProTennisColors.electricGreen,
    route: "Shop",
    requiredLevel: 9,
  },
  {
    id: "academy-hub",
    title: "ACADEMY HUB",
    subtitle: "News & Rankings",
    icon: "trophy-outline",
    color: ProTennisColors.neonCyan,
    route: "GlowLeaderboard",
    requiredLevel: 5,
  },
];

interface PerformanceTileProps {
  tile: TileConfig;
  playerLevel: number;
  index: number;
}

function PerformanceTile({ tile, playerLevel, index }: PerformanceTileProps) {
  const navigation = useNavigation<any>();
  const isLocked = tile.requiredLevel ? playerLevel < tile.requiredLevel : false;
  
  const handlePress = () => {
    if (isLocked) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate(tile.route);
  };

  return (
    <Animated.View 
      entering={FadeInUp.delay(index * 100).duration(400)}
      style={styles.tileWrapper}
    >
      <Pressable 
        style={[styles.tile, isLocked && styles.tileLocked]} 
        onPress={handlePress}
      >
        {Platform.OS === "ios" ? (
          <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={[ProTennisColors.surfaceCard + "95", ProTennisColors.surfaceDark + "98"]}
              style={StyleSheet.absoluteFill}
            />
          </BlurView>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: ProTennisColors.surfaceCard }]} />
        )}
        
        <View style={styles.tileContent}>
          <View style={[styles.iconWrapper, { borderColor: isLocked ? ProTennisColors.textMuted : tile.color }]}>
            <Ionicons 
              name={isLocked ? "lock-closed" : tile.icon} 
              size={24} 
              color={isLocked ? ProTennisColors.textMuted : tile.color} 
            />
          </View>
          <Text style={[styles.tileTitle, isLocked && styles.lockedText]}>{tile.title}</Text>
          <Text style={[styles.tileSubtitle, isLocked && styles.lockedText]}>
            {isLocked ? `Unlock at LVL ${tile.requiredLevel}` : tile.subtitle}
          </Text>
        </View>
        
        {!isLocked && (
          <View style={[styles.accentLine, { backgroundColor: tile.color }]} />
        )}
      </Pressable>
    </Animated.View>
  );
}

interface PerformanceCenterGridProps {
  playerLevel: number;
}

export function PerformanceCenterGrid({ playerLevel }: PerformanceCenterGridProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>PERFORMANCE CENTER</Text>
      <View style={styles.grid}>
        {PERFORMANCE_TILES.map((tile, index) => (
          <PerformanceTile 
            key={tile.id} 
            tile={tile} 
            playerLevel={playerLevel}
            index={index}
          />
        ))}
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: ProTennisColors.textMuted,
    letterSpacing: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  tileWrapper: {
    width: "48%",
    flexGrow: 1,
  },
  tile: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
    minHeight: 120,
  },
  tileLocked: {
    opacity: 0.7,
  },
  tileContent: {
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Backgrounds.card + "60",
  },
  tileTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 1,
  },
  tileSubtitle: {
    fontSize: 10,
    color: ProTennisColors.textMuted,
    textAlign: "center",
  },
  lockedText: {
    color: ProTennisColors.textMuted,
  },
  accentLine: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.5,
  },
}));
