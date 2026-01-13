import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
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
        <Text style={styles.title}>COMMUNITY</Text>
        <Pressable onPress={handleSeeAll}>
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={[ProTennisColors.surfaceCard + "90", ProTennisColors.surfaceDark + "95"]}
              style={StyleSheet.absoluteFill}
            />
          </BlurView>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: ProTennisColors.surfaceCard }]} />
        )}

        <View style={styles.eventsContainer}>
          {events.map((event, index) => {
            const config = eventTypeConfig[event.type] || eventTypeConfig.new_member;
            return (
              <React.Fragment key={event.id}>
                <Pressable style={styles.eventItem} onPress={handlePress}>
                  <View style={[styles.eventIcon, { backgroundColor: config.color + "20" }]}>
                    <Ionicons name={config.icon} size={14} color={config.color} />
                  </View>
                  <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                  <Text style={styles.eventTime}>{event.time}</Text>
                </Pressable>
                {index < events.length - 1 ? <View style={styles.divider} /> : null}
              </React.Fragment>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: ProTennisColors.textMuted,
    letterSpacing: 2,
  },
  seeAll: {
    fontSize: 11,
    fontWeight: "600",
    color: ProTennisColors.electricGreen,
  },
  card: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: ProTennisColors.surfaceElevated,
  },
  eventsContainer: {
    padding: Spacing.md,
  },
  eventItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  eventIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  eventTitle: {
    flex: 1,
    fontSize: 12,
    color: ProTennisColors.white,
  },
  eventTime: {
    fontSize: 10,
    color: ProTennisColors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: ProTennisColors.surfaceElevated,
    marginVertical: Spacing.xs,
  },
});
