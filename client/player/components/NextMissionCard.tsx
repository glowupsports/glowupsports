import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

interface NextMission {
  type: "session" | "quest" | "event";
  title: string;
  time: string;
  location?: string;
  coachName?: string;
}

interface NextMissionCardProps {
  mission: NextMission | null;
  onPress?: () => void;
}

function formatMissionTime(timeString: string): { time: string; label: string; isNow: boolean } {
  const missionDate = new Date(timeString);
  const now = new Date();
  const diffMs = missionDate.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffMins < 0) {
    return { time: "NOW", label: "In Progress", isNow: true };
  }
  if (diffMins < 60) {
    return { time: `${diffMins}m`, label: "Starting in", isNow: diffMins <= 15 };
  }
  if (diffHours < 24) {
    return { time: `${diffHours}h`, label: "Starting in", isNow: false };
  }
  
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (missionDate.toDateString() === tomorrow.toDateString()) {
    return { 
      time: missionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
      label: "Tomorrow", 
      isNow: false 
    };
  }
  
  return { 
    time: missionDate.toLocaleDateString([], { weekday: 'short' }), 
    label: missionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
    isNow: false 
  };
}

function LiveIndicator() {
  const opacity = useSharedValue(1);
  
  React.useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 600 }),
        withTiming(1, { duration: 600 })
      ),
      -1,
      true
    );
  }, []);
  
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
  
  return (
    <Animated.View style={[styles.liveIndicator, animatedStyle]}>
      <View style={styles.liveDot} />
      <ThemedText style={styles.liveText}>LIVE</ThemedText>
    </Animated.View>
  );
}

export function NextMissionCard({ mission, onPress }: NextMissionCardProps) {
  if (!mission) {
    return (
      <Pressable style={styles.emptyContainer} onPress={onPress}>
        <LinearGradient
          colors={[Colors.dark.cardLight, Colors.dark.card]}
          style={styles.emptyGradient}
        >
          <View style={styles.emptyIconContainer}>
            <Ionicons name="calendar-outline" size={32} color={Colors.dark.textSecondary} />
          </View>
          <View style={styles.emptyContent}>
            <ThemedText style={styles.emptyTitle}>No Upcoming Sessions</ThemedText>
            <ThemedText style={styles.emptySubtitle}>Book a lesson or check the schedule</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.dark.textSecondary} />
        </LinearGradient>
      </Pressable>
    );
  }
  
  const timeInfo = formatMissionTime(mission.time);
  const iconName = mission.type === "session" ? "tennisball" : mission.type === "event" ? "trophy" : "flash";
  
  return (
    <Pressable onPress={onPress}>
      <LinearGradient
        colors={timeInfo.isNow 
          ? [Colors.dark.primary + "30", Colors.dark.primary + "10"]
          : [Colors.dark.cardLight, Colors.dark.card]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.container, timeInfo.isNow && styles.containerActive]}
      >
        <View style={styles.timeSection}>
          <ThemedText style={styles.timeLabel}>{timeInfo.label}</ThemedText>
          <ThemedText style={[styles.timeValue, timeInfo.isNow && styles.timeValueActive]}>
            {timeInfo.time}
          </ThemedText>
        </View>
        
        <View style={styles.divider} />
        
        <View style={styles.missionContent}>
          <View style={styles.missionHeader}>
            <View style={[styles.missionIcon, { backgroundColor: Colors.dark.primary + "20" }]}>
              <Ionicons name={iconName as any} size={20} color={Colors.dark.primary} />
            </View>
            {timeInfo.isNow ? <LiveIndicator /> : null}
          </View>
          
          <ThemedText style={styles.missionTitle} numberOfLines={1}>
            {mission.title}
          </ThemedText>
          
          {mission.location || mission.coachName ? (
            <View style={styles.missionMeta}>
              {mission.location ? (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={12} color={Colors.dark.textSecondary} />
                  <ThemedText style={styles.metaText}>{mission.location}</ThemedText>
                </View>
              ) : null}
              {mission.coachName ? (
                <View style={styles.metaItem}>
                  <Ionicons name="person-outline" size={12} color={Colors.dark.textSecondary} />
                  <ThemedText style={styles.metaText}>{mission.coachName}</ThemedText>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        
        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textSecondary} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  containerActive: {
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  timeSection: {
    alignItems: "center",
    minWidth: 60,
  },
  timeLabel: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timeValue: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  timeValueActive: {
    color: Colors.dark.primary,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.dark.border,
  },
  missionContent: {
    flex: 1,
  },
  missionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 4,
  },
  missionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.error + "20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.error,
  },
  liveText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.error,
  },
  missionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  missionMeta: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  emptyContainer: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  emptyGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  emptyIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContent: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
});
