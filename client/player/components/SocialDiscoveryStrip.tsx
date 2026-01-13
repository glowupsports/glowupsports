import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInRight } from "react-native-reanimated";
import { ProTennisColors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

interface DiscoveryCard {
  id: string;
  type: "players" | "challenge" | "sessions" | "events";
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route: string;
  preview?: string;
}

export function SocialDiscoveryStrip() {
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();

  const availablePlayers = state.nearbyPlayers.filter(p => p.status === "available");
  const topPlayer = availablePlayers[0];

  const discoveryCards: DiscoveryCard[] = [
    {
      id: "players",
      type: "players",
      title: "Players Near You",
      subtitle: `${availablePlayers.length} available`,
      icon: "people-outline",
      color: ProTennisColors.neonCyan,
      route: "PlayerFinder",
      preview: topPlayer ? `${topPlayer.name} (${topPlayer.level})` : undefined,
    },
    {
      id: "challenge",
      type: "challenge",
      title: "Challenge",
      subtitle: "1v1 match",
      icon: "flash-outline",
      color: "#FF6B6B",
      route: "OpenMatches",
    },
    {
      id: "sessions",
      type: "sessions",
      title: "Open Sessions",
      subtitle: `${state.openSessions.length} today`,
      icon: "calendar-outline",
      color: ProTennisColors.electricGreen,
      route: "LessonBooking",
      preview: state.openSessions[0] ? `${state.openSessions[0].time} - ${state.openSessions[0].spotsLeft} spots` : undefined,
    },
    {
      id: "events",
      type: "events",
      title: "Events",
      subtitle: "Upcoming",
      icon: "trophy-outline",
      color: "#FFD93D",
      route: "Events",
    },
  ];

  const handlePress = (card: DiscoveryCard) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate(card.route);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PLAY & MEET</Text>
        <View style={styles.badge}>
          <Ionicons name="pulse" size={12} color={ProTennisColors.electricGreen} />
          <Text style={styles.badgeText}>LIVE</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {discoveryCards.map((card, index) => (
          <Animated.View
            key={card.id}
            entering={FadeInRight.delay(index * 80).duration(400)}
          >
            <Pressable style={styles.card} onPress={() => handlePress(card)}>
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

              <View style={styles.cardContent}>
                <View style={[styles.iconContainer, { borderColor: card.color + "50" }]}>
                  <Ionicons name={card.icon} size={20} color={card.color} />
                </View>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
                {card.preview ? (
                  <View style={styles.previewContainer}>
                    <View style={styles.previewDot} />
                    <Text style={styles.previewText} numberOfLines={1}>{card.preview}</Text>
                  </View>
                ) : null}
              </View>

              <View style={[styles.accentLine, { backgroundColor: card.color }]} />
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: ProTennisColors.textMuted,
    letterSpacing: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: ProTennisColors.electricGreen + "20",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: ProTennisColors.electricGreen,
    letterSpacing: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  card: {
    width: 140,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: ProTennisColors.surfaceElevated,
  },
  cardContent: {
    padding: Spacing.md,
    gap: Spacing.xs,
    minHeight: 120,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: ProTennisColors.midnightBlue + "60",
    marginBottom: Spacing.xs,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: ProTennisColors.white,
  },
  cardSubtitle: {
    fontSize: 10,
    color: ProTennisColors.textMuted,
  },
  previewContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  previewDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ProTennisColors.electricGreen,
  },
  previewText: {
    fontSize: 9,
    color: ProTennisColors.electricGreen,
    flex: 1,
  },
  accentLine: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.5,
  },
});
