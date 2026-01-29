import React, { useEffect } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  FadeInLeft,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

export interface ActivityEvent {
  id: string;
  type: "check_in" | "session_start" | "session_end" | "payment" | "level_up" | "new_player" | "booking";
  title: string;
  subtitle?: string;
  timestamp: Date;
  playerName?: string;
  coachName?: string;
  amount?: number;
  currency?: string;
}

interface LiveActivityFeedProps {
  events: ActivityEvent[];
  maxEvents?: number;
}

function ActivityItem({ event, index }: { event: ActivityEvent; index: number }) {
  const getEventConfig = () => {
    switch (event.type) {
      case "check_in":
        return { icon: "checkmark-circle" as const, color: Colors.dark.primary, bgColor: Colors.dark.primary + "15" };
      case "session_start":
        return { icon: "play-circle" as const, color: Colors.dark.xpCyan, bgColor: Colors.dark.xpCyan + "15" };
      case "session_end":
        return { icon: "stop-circle" as const, color: Colors.dark.orange, bgColor: Colors.dark.orange + "15" };
      case "payment":
        return { icon: "card" as const, color: Colors.dark.gold, bgColor: Colors.dark.gold + "15" };
      case "level_up":
        return { icon: "arrow-up-circle" as const, color: Colors.dark.xpCyan, bgColor: Colors.dark.xpCyan + "15" };
      case "new_player":
        return { icon: "person-add" as const, color: Colors.dark.primary, bgColor: Colors.dark.primary + "15" };
      case "booking":
        return { icon: "calendar" as const, color: Colors.dark.orange, bgColor: Colors.dark.orange + "15" };
      default:
        return { icon: "ellipse" as const, color: Colors.dark.textMuted, bgColor: Colors.dark.textMuted + "15" };
    }
  };

  const config = getEventConfig();
  
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Animated.View 
      entering={FadeInLeft.delay(index * 50).springify()}
      style={styles.activityItem}
    >
      <View style={styles.timelineContainer}>
        <View style={[styles.timelineDot, { backgroundColor: config.color }]} />
        {index < 4 && <View style={styles.timelineLine} />}
      </View>
      
      <View style={[styles.activityIcon, { backgroundColor: config.bgColor }]}>
        <Ionicons name={config.icon} size={18} color={config.color} />
      </View>
      
      <View style={styles.activityContent}>
        <Text style={styles.activityTitle}>{event.title}</Text>
        {event.subtitle && (
          <Text style={styles.activitySubtitle}>{event.subtitle}</Text>
        )}
      </View>
      
      <Text style={styles.activityTime}>{formatTime(event.timestamp)}</Text>
    </Animated.View>
  );
}

export function LiveActivityFeed({ events, maxEvents = 5 }: LiveActivityFeedProps) {
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 500 }),
        withTiming(1, { duration: 500 })
      ),
      -1,
      false
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const displayEvents = events.slice(0, maxEvents);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Animated.View style={[styles.liveDot, pulseStyle]} />
            <Text style={styles.title}>LIVE ACTIVITY</Text>
          </View>
          <Text style={styles.eventCount}>{events.length} events today</Text>
        </View>

        {displayEvents.length > 0 ? (
          <View style={styles.eventsList}>
            {displayEvents.map((event, index) => (
              <ActivityItem key={event.id} event={event} index={index} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="pulse-outline" size={32} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No activity yet today</Text>
            <Text style={styles.emptySubtext}>Events will appear here in real-time</Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.error,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.error,
    letterSpacing: 1.5,
  },
  eventCount: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  eventsList: {
    gap: 0,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  timelineContainer: {
    width: 12,
    alignItems: "center",
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineLine: {
    position: "absolute",
    top: 12,
    width: 1,
    height: 40,
    backgroundColor: Colors.dark.border,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  activitySubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  activityTime: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
});
