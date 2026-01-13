import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { 
  FadeInUp, 
  FadeInRight,
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withSequence, 
  withTiming,
  withSpring,
  cancelAnimation 
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ProTennisColors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

const eventTypeConfig: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  new_member: { icon: "person-add-outline", color: ProTennisColors.neonCyan },
  new_group: { icon: "people-outline", color: ProTennisColors.electricGreen },
  tournament: { icon: "trophy-outline", color: "#FFD93D" },
  challenge: { icon: "flash-outline", color: "#FF6B6B" },
};

function AnimatedEventCard({ 
  event, 
  config, 
  onPress, 
  delay 
}: { 
  event: { id: string; title: string; time: string; type: string }; 
  config: { icon: keyof typeof Ionicons.glyphMap; color: string }; 
  onPress: () => void; 
  delay: number 
}) {
  const glowPulse = useSharedValue(0.2);
  const scaleValue = useSharedValue(1);
  
  useEffect(() => {
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 2000 }),
        withTiming(0.2, { duration: 2000 })
      ),
      -1,
      true
    );
    return () => cancelAnimation(glowPulse);
  }, [glowPulse]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glowPulse.value,
  }));

  const handlePressIn = () => {
    scaleValue.value = withSpring(0.98, { damping: 15, stiffness: 150 });
  };

  const handlePressOut = () => {
    scaleValue.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  return (
    <Animated.View 
      entering={FadeInRight.delay(delay).duration(350)} 
      style={[scaleStyle]}
    >
      <Pressable 
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View style={[styles.eventCard, { shadowColor: config.color }, glowStyle]}>
          <LinearGradient
            colors={[`${config.color}12`, "rgba(21, 27, 41, 0.9)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.eventCardGradient}
          >
            <View style={[styles.eventIconGaming, { backgroundColor: `${config.color}25`, borderColor: `${config.color}40` }]}>
              <Ionicons name={config.icon} size={16} color={config.color} />
            </View>
            <View style={styles.eventContent}>
              <Text style={styles.eventTitleGaming} numberOfLines={1}>{event.title}</Text>
              <Text style={[styles.eventTimeGaming, { color: config.color }]}>{event.time}</Text>
            </View>
            <View style={[styles.eventArrow, { backgroundColor: `${config.color}15` }]}>
              <Ionicons name="chevron-forward" size={14} color={config.color} />
            </View>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export function MiniFeed() {
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("CommunityFeed");
  };

  const handleSeeAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("CommunityFeed");
  };

  const events = state.communityEvents.slice(0, 3);

  if (events.length === 0) return null;

  return (
    <Animated.View entering={FadeInUp.delay(150).duration(400)} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.titleGaming}>COMMUNITY</Text>
          <View style={styles.titleGlow} />
        </View>
        <Pressable onPress={handleSeeAll} style={styles.seeAllButton}>
          <Text style={styles.seeAllGaming}>See all</Text>
          <Ionicons name="chevron-forward" size={12} color={ProTennisColors.electricGreen} />
        </Pressable>
      </View>

      <View style={styles.eventsContainer}>
        {events.map((event, index) => {
          const config = eventTypeConfig[event.type] || eventTypeConfig.new_member;
          return (
            <AnimatedEventCard
              key={event.id}
              event={event}
              config={config}
              onPress={handlePress}
              delay={index * 80}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: Spacing.sm,
    marginRight: Spacing.md,
  },
  titleGaming: {
    fontSize: 12,
    fontWeight: "800",
    color: ProTennisColors.textSecondary,
    letterSpacing: 3,
  },
  titleGlow: {
    flex: 1,
    height: 1,
    backgroundColor: `${ProTennisColors.electricGreen}30`,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(204, 255, 0, 0.08)",
  },
  seeAllGaming: {
    fontSize: 11,
    fontWeight: "700",
    color: ProTennisColors.electricGreen,
    letterSpacing: 0.5,
  },
  eventsContainer: {
    gap: Spacing.sm,
  },
  eventCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    elevation: 4,
  },
  eventCardGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  eventIconGaming: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  eventContent: {
    flex: 1,
    gap: 2,
  },
  eventTitleGaming: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  eventTimeGaming: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  eventArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
