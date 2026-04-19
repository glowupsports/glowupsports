import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ProTennisColors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface TickerItem {
  id: string;
  type: "promo" | "streak" | "alert" | "info" | "rival";
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  color: string;
  priority: number;
}

interface LiveTickerProps {
  customItems?: TickerItem[];
  stats?: {
    earnedAchievements?: number;
    totalAchievements?: number;
    matchesWon?: number;
    totalMatches?: number;
  };
}

function generateBroadcastItems(
  state: ReturnType<typeof usePlayerState>["state"],
  stats?: LiveTickerProps["stats"]
): TickerItem[] {
  const items: TickerItem[] = [];

  if (state.isNearLevelUp && state.xpProgress >= 0.9) {
    items.push({
      id: "promo-imminent",
      type: "promo",
      icon: "trending-up",
      text: "LEVEL PROMOTION POSSIBLE THIS WEEK",
      color: ProTennisColors.electricGreen,
      priority: 10,
    });
  }

  if (state.isStreakAtRisk) {
    items.push({
      id: "streak-risk",
      type: "alert",
      icon: "flame",
      text: `STREAK AT RISK - ${state.streak} DAY RUN ON THE LINE`,
      color: ProTennisColors.danger,
      priority: 9,
    });
  }

  if (state.streak >= 5) {
    items.push({
      id: "hot-streak",
      type: "streak",
      icon: "flame",
      text: `${state.streak} SESSION STREAK - MOMENTUM IS BUILDING`,
      color: ProTennisColors.warning,
      priority: 7,
    });
  }

  if (state.broadcastMode === "on_air") {
    items.push({
      id: "live-session",
      type: "info",
      icon: "radio",
      text: "LIVE SESSION IN PROGRESS - ALL EYES ON CENTER COURT",
      color: ProTennisColors.live,
      priority: 10,
    });
  }

  if (state.broadcastMode === "pre_game" && state.minutesToNextSession) {
    const mins = state.minutesToNextSession;
    if (mins <= 30) {
      items.push({
        id: "warmup",
        type: "info",
        icon: "time",
        text: `${mins} MINUTES TO SESSION - TIME TO WARM UP`,
        color: ProTennisColors.neonCyan,
        priority: 8,
      });
    }
  }

  if (state.currentStoryline) {
    const storyMessages: Record<string, string> = {
      "PROMOTION PRESSURE": "THE ROAD TO NEXT LEVEL CONTINUES",
      "ON FIRE": "UNSTOPPABLE FORM - KEEP THE MOMENTUM",
      "ROAD TO ORANGE": "EVERY SESSION COUNTS ON THE JOURNEY",
      "CHASING GREEN": "EYES ON THE PRIZE - GREEN AWAITS",
      "YELLOW DREAM": "ELITE STATUS WITHIN REACH",
    };
    
    if (storyMessages[state.currentStoryline]) {
      items.push({
        id: "storyline",
        type: "info",
        icon: "tennisball",
        text: storyMessages[state.currentStoryline],
        color: ProTennisColors.electricGreen,
        priority: 5,
      });
    }
  }

  if (stats?.matchesWon && stats.totalMatches && stats.matchesWon > 0) {
    const winRate = Math.round((stats.matchesWon / stats.totalMatches) * 100);
    items.push({
      id: "win-rate",
      type: "info",
      icon: "trophy",
      text: `MATCH RECORD: ${stats.matchesWon}W - ${stats.totalMatches - stats.matchesWon}L (${winRate}%)`,
      color: ProTennisColors.neonCyan,
      priority: 4,
    });
  }

  if (items.length < 2) {
    const timeGreetings: Record<string, string> = {
      morning: "GOOD MORNING CHAMPION - TIME TO TRAIN",
      afternoon: "AFTERNOON SESSION WINDOW OPEN",
      evening: "EVENING PRACTICE - PERFECT YOUR GAME",
      night: "REST WELL - CHAMPIONS RECOVER SMART",
    };
    
    items.push({
      id: "greeting",
      type: "info",
      icon: "sunny",
      text: timeGreetings[state.timeOfDay] || "READY FOR THE COURT",
      color: ProTennisColors.textMuted,
      priority: 1,
    });
  }

  return items.sort((a, b) => b.priority - a.priority);
}

export function LiveTicker({ customItems, stats }: LiveTickerProps) {
  const { state } = usePlayerState();
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const items = customItems ?? generateBroadcastItems(state, stats);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (items.length <= 1) return;
    
    const interval = setInterval(() => {
      opacity.value = withTiming(0, { duration: 300 });
      
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % items.length);
        translateX.value = 20;
        opacity.value = withTiming(1, { duration: 300 });
        translateX.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });
      }, 300);
    }, 5000);

    return () => clearInterval(interval);
  }, [items.length]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  if (items.length === 0) return null;

  const currentItem = items[currentIndex];

  return (
    <View style={styles.container}>
      <View style={styles.liveIndicator}>
        <View style={styles.liveDot} />
        <Text style={styles.liveLabel}>LIVE</Text>
      </View>
      
      <View style={styles.tickerContent}>
        <Animated.View style={[styles.itemRow, animatedStyle]}>
          <Ionicons 
            name={currentItem.icon} 
            size={12} 
            color={currentItem.color} 
            style={styles.itemIcon}
          />
          <Text style={[styles.itemText, { color: currentItem.color }]}>
            {currentItem.text}
          </Text>
        </Animated.View>
      </View>

      {items.length > 1 && (
        <View style={styles.pagination}>
          {items.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ProTennisColors.surfaceDark,
    borderTopWidth: 1,
    borderTopColor: ProTennisColors.electricGreen + "15",
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ProTennisColors.live + "20",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ProTennisColors.live,
  },
  liveLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: ProTennisColors.live,
    letterSpacing: 0.5,
  },
  tickerContent: {
    flex: 1,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemIcon: {
    marginRight: 6,
  },
  itemText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    flex: 1,
  },
  pagination: {
    flexDirection: "row",
    gap: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ProTennisColors.textMuted + "40",
  },
  dotActive: {
    backgroundColor: ProTennisColors.electricGreen,
  },
}));
