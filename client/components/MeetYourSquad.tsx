import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  useSharedValue,
  withDelay,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import {
  Colors,
  Spacing,
  Typography,
  BorderRadius,
  GlowColors,
  BallLevelColors,
} from "@/constants/theme";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PLAYER_CARD_WIDTH = 100;

interface Player {
  id: string;
  displayName: string;
  profilePhotoUrl?: string;
  currentLevel?: string;
  ageGroup?: string;
}

interface MeetYourSquadProps {
  academyId: string;
  ballLevel: string;
  playerName: string;
  ageGroup: "kid" | "teen" | "adult";
  onContinue: () => void;
  onSkip?: () => void;
}

function getBallLevelColor(level: string): string {
  const normalized = level.toLowerCase();
  if (normalized.includes("red")) return BallLevelColors.red;
  if (normalized.includes("orange")) return BallLevelColors.orange;
  if (normalized.includes("green")) return BallLevelColors.green;
  return BallLevelColors.yellow;
}

function PlayerCard({ player, index }: { player: Player; index: number }) {
  const floatOffset = useSharedValue(0);

  useEffect(() => {
    floatOffset.value = withDelay(
      index * 100,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 1500 }),
          withTiming(5, { duration: 1500 })
        ),
        -1,
        true
      )
    );
  }, []);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatOffset.value }],
  }));

  const firstName = player.displayName?.split(" ")[0] || "Player";
  const levelColor = getBallLevelColor(player.currentLevel || "yellow");

  return (
    <Animated.View
      entering={ZoomIn.delay(index * 100).springify()}
      style={[styles.playerCard, floatStyle]}
    >
      <View style={[styles.playerPhotoContainer, { borderColor: levelColor }]}>
        {player.profilePhotoUrl ? (
          <Image
            source={{ uri: player.profilePhotoUrl }}
            style={styles.playerPhoto}
            contentFit="cover"
          />
        ) : (
          <LinearGradient
            colors={[levelColor, `${levelColor}80`]}
            style={styles.playerPhotoPlaceholder}
          >
            <Text style={styles.playerInitial}>
              {firstName.charAt(0).toUpperCase()}
            </Text>
          </LinearGradient>
        )}
        <View style={[styles.levelBadge, { backgroundColor: levelColor }]}>
          <Ionicons name="tennisball" size={10} color={Colors.dark.buttonText} />
        </View>
      </View>
      <Text style={styles.playerName} numberOfLines={1}>
        {firstName}
      </Text>
      {player.ageGroup && (
        <Text style={styles.playerAge}>{player.ageGroup}</Text>
      )}
    </Animated.View>
  );
}

export default function MeetYourSquad({
  academyId,
  ballLevel,
  playerName,
  ageGroup,
  onContinue,
  onSkip,
}: MeetYourSquadProps) {
  const insets = useSafeAreaInsets();

  const { data: squadPlayers = [], isLoading } = useQuery<Player[]>({
    queryKey: ["/api/player/squad-preview", academyId, ballLevel],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/player/squad-preview`, baseUrl);
      url.searchParams.set("academyId", academyId);
      url.searchParams.set("ballLevel", ballLevel);
      url.searchParams.set("limit", "8");

      const response = await fetch(url.toString(), {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        return [];
      }

      return response.json();
    },
    enabled: !!academyId && !!ballLevel,
  });

  const handleContinue = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onContinue();
  };

  const handleSkip = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (onSkip) {
      onSkip();
    } else {
      onContinue();
    }
  };

  const levelColor = getBallLevelColor(ballLevel);
  const firstName = playerName.split(" ")[0];

  const getMessage = () => {
    if (squadPlayers.length === 0) {
      if (ageGroup === "kid") {
        return "You'll be one of the first! How exciting!";
      }
      return "Be among the first to join this level!";
    }
    if (ageGroup === "kid") {
      return `${squadPlayers.length} friends are waiting to play with you!`;
    }
    return `${squadPlayers.length} players at your level are ready to rally!`;
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0a0a0a", "#1a1a2e", "#0a0a0a"]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        {onSkip && (
          <Animated.View entering={FadeIn.delay(300)} style={styles.skipContainer}>
            <Pressable style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipText}>Skip</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
            </Pressable>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(200)} style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: `${levelColor}20` }]}>
            <Ionicons name="people" size={40} color={levelColor} />
          </View>
          <Text style={styles.title}>
            {ageGroup === "kid" ? "Meet Your Tennis Friends!" : "Meet Your Squad"}
          </Text>
          <Text style={styles.subtitle}>
            {ageGroup === "kid"
              ? `Hey ${firstName}! These kids play at the same level as you!`
              : `${firstName}, here are players training at ${ballLevel} Ball level`}
          </Text>
        </Animated.View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Animated.View
              entering={FadeIn}
              style={styles.loadingDots}
            >
              {[0, 1, 2].map((i) => (
                <LoadingDot key={i} index={i} color={levelColor} />
              ))}
            </Animated.View>
            <Text style={styles.loadingText}>Finding your squad...</Text>
          </View>
        ) : squadPlayers.length > 0 ? (
          <Animated.View entering={FadeInUp.delay(400)} style={styles.squadContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.squadScroll}
            >
              {squadPlayers.map((player, index) => (
                <PlayerCard key={player.id} player={player} index={index} />
              ))}
            </ScrollView>
            <Text style={styles.squadMessage}>{getMessage()}</Text>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInUp.delay(400)} style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: `${levelColor}20` }]}>
              <Ionicons name="sparkles" size={48} color={levelColor} />
            </View>
            <Text style={styles.emptyTitle}>
              {ageGroup === "kid" ? "Be a Trailblazer!" : "Pioneer Status!"}
            </Text>
            <Text style={styles.emptyText}>{getMessage()}</Text>
          </Animated.View>
        )}

        <Animated.View
          entering={FadeInUp.delay(600)}
          style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}
        >
          <Pressable style={styles.continueButton} onPress={handleContinue}>
            <LinearGradient
              colors={[GlowColors.neonGreen, GlowColors.neonCyan]}
              style={styles.continueGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.continueText}>
                {ageGroup === "kid" ? "Let's Go!" : "Continue"}
              </Text>
              <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

function LoadingDot({ index, color }: { index: number; color: string }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withDelay(
      index * 200,
      withRepeat(
        withSequence(
          withTiming(1.4, { duration: 400 }),
          withTiming(1, { duration: 400 })
        ),
        -1,
        true
      )
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.loadingDot,
        { backgroundColor: color },
        animStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  skipContainer: {
    alignItems: "flex-end",
    marginBottom: Spacing.md,
  },
  skipButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  skipText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: "500",
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: -0.5,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
  },
  loadingDots: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  loadingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  squadContainer: {
    flex: 1,
    justifyContent: "center",
  },
  squadScroll: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  squadMessage: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    marginTop: Spacing.lg,
  },
  playerCard: {
    alignItems: "center",
    width: PLAYER_CARD_WIDTH,
    marginHorizontal: Spacing.xs,
  },
  playerPhotoContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    overflow: "hidden",
    marginBottom: Spacing.xs,
    position: "relative",
  },
  playerPhoto: {
    width: "100%",
    height: "100%",
  },
  playerPhotoPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  playerInitial: {
    color: Colors.dark.buttonText,
    fontSize: 28,
    fontWeight: "bold",
  },
  levelBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0a0a0a",
  },
  playerName: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  playerAge: {
    color: Colors.textSecondary,
    fontSize: 11,
    textAlign: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: "bold",
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
    textAlign: "center",
    maxWidth: 280,
  },
  footer: {
    paddingTop: Spacing.lg,
  },
  continueButton: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  continueGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  continueText: {
    color: Colors.dark.buttonText,
    fontSize: 18,
    fontWeight: "bold",
  },
});
