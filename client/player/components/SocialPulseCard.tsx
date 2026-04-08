import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, useAnimatedStyle, withRepeat, withTiming, withSequence } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";

interface SocialPulseCardProps {
  newMoments: number;
  openToPlay: number;
  onMomentsPress?: () => void;
  onOpenToPlayPress?: () => void;
}

function PulseIndicator({ active }: { active: boolean }) {
  const pulseStyle = useAnimatedStyle(() => {
    if (!active) return { opacity: 0 };
    return {
      opacity: withRepeat(
        withSequence(
          withTiming(1, { duration: 500 }),
          withTiming(0.3, { duration: 500 })
        ),
        -1,
        true
      ),
    };
  });
  
  if (!active) return null;
  
  return (
    <Animated.View style={[styles.pulse, pulseStyle]}>
      <View style={styles.pulseInner} />
    </Animated.View>
  );
}

export function SocialPulseCard({ 
  newMoments, 
  openToPlay, 
  onMomentsPress, 
  onOpenToPlayPress 
}: SocialPulseCardProps) {
  const hasActivity = newMoments > 0 || openToPlay > 0;
  
  return (
    <Card style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="pulse" size={18} color={Colors.dark.primary} />
          <ThemedText style={styles.title}>Community Pulse</ThemedText>
        </View>
        <PulseIndicator active={hasActivity} />
      </View>
      
      <View style={styles.statsRow}>
        <Pressable style={styles.statCard} onPress={onMomentsPress}>
          <View style={[styles.statIcon, { backgroundColor: Colors.dark.primary + "20" }]}>
            <Ionicons name="sparkles" size={22} color={Colors.dark.primary} />
          </View>
          <View style={styles.statContent}>
            <ThemedText style={styles.statValue}>
              {newMoments > 0 ? newMoments : "-"}
            </ThemedText>
            <ThemedText style={styles.statLabel}>New Moments</ThemedText>
          </View>
          {newMoments > 0 ? (
            <View style={styles.newBadge}>
              <ThemedText style={styles.newBadgeText}>NEW</ThemedText>
            </View>
          ) : null}
        </Pressable>
        
        <Pressable style={styles.statCard} onPress={onOpenToPlayPress}>
          <View style={[styles.statIcon, { backgroundColor: "#4ECDC4" + "20" }]}>
            <Ionicons name="tennisball" size={22} color="#4ECDC4" />
          </View>
          <View style={styles.statContent}>
            <ThemedText style={styles.statValue}>
              {openToPlay > 0 ? openToPlay : "-"}
            </ThemedText>
            <ThemedText style={styles.statLabel}>Open to Play</ThemedText>
          </View>
          {openToPlay > 0 ? (
            <View style={[styles.newBadge, { backgroundColor: "#4ECDC4" }]}>
              <ThemedText style={styles.newBadgeText}>LIVE</ThemedText>
            </View>
          ) : null}
        </Pressable>
      </View>
      
      {!hasActivity ? (
        <View style={styles.quietState}>
          <ThemedText style={styles.quietText}>
            All quiet - be the first to share a Moment!
          </ThemedText>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  pulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.primary + "40",
    justifyContent: "center",
    alignItems: "center",
  },
  pulseInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    position: "relative",
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  statContent: {
    gap: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  newBadge: {
    position: "absolute",
    top: Spacing.xs,
    right: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  quietState: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  quietText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
});
