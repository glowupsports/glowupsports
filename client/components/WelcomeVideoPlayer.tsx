import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { useVideoPlayer, VideoView } from "expo-video";
import { Colors, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface WelcomeVideoPlayerProps {
  videoUrl: string;
  title?: string;
  subtitle?: string;
  speakerName?: string;
  speakerRole?: string;
  speakerPhotoUrl?: string;
  onComplete: () => void;
  onSkip?: () => void;
  allowSkip?: boolean;
  autoPlay?: boolean;
}

export default function WelcomeVideoPlayer({
  videoUrl,
  title = "Welcome!",
  subtitle,
  speakerName,
  speakerRole,
  speakerPhotoUrl,
  onComplete,
  onSkip,
  allowSkip = true,
  autoPlay = true,
}: WelcomeVideoPlayerProps) {
  const insets = useSafeAreaInsets();
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const pulseScale = useSharedValue(1);

  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = false;
    if (autoPlay) {
      player.play();
      setIsPlaying(true);
    }
  });

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  useEffect(() => {
    if (!player) return;

    const subscription = player.addListener("playingChange", (event) => {
      setIsPlaying(event.isPlaying);
    });

    const statusSubscription = player.addListener("statusChange", (event) => {
      if (event.status === "readyToPlay") {
        setDuration(player.duration);
      }
    });

    const endSubscription = player.addListener("playToEnd", () => {
      setHasEnded(true);
      setShowControls(true);
    });

    return () => {
      subscription.remove();
      statusSubscription.remove();
      endSubscription.remove();
    };
  }, [player]);

  useEffect(() => {
    if (!player || !isPlaying) return;

    const interval = setInterval(() => {
      setProgress(player.currentTime / (player.duration || 1));
    }, 100);

    return () => clearInterval(interval);
  }, [player, isPlaying]);

  const handlePlayPause = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (isPlaying) {
      player.pause();
    } else {
      if (hasEnded) {
        player.replay();
        setHasEnded(false);
      } else {
        player.play();
      }
    }
  };

  const handleSkip = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    player.pause();
    if (onSkip) {
      onSkip();
    } else {
      onComplete();
    }
  };

  const handleContinue = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onComplete();
  };

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0a0a0a", "#1a1a2e", "#0a0a0a"]}
        style={StyleSheet.absoluteFillObject}
      />

      <VideoView
        style={styles.video}
        player={player}
        contentFit="cover"
        nativeControls={false}
      />

      <LinearGradient
        colors={["rgba(0,0,0,0.8)", "transparent", "transparent", "rgba(0,0,0,0.9)"]}
        locations={[0, 0.2, 0.7, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        {allowSkip && !hasEnded && (
          <Animated.View entering={FadeIn.delay(500)}>
            <Pressable style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipText}>Skip</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
            </Pressable>
          </Animated.View>
        )}
      </View>

      <Pressable 
        style={styles.videoTouchArea}
        onPress={() => setShowControls(!showControls)}
      >
        {showControls && (
          <Animated.View 
            entering={FadeIn} 
            exiting={FadeOut}
            style={styles.centerControls}
          >
            <Pressable onPress={handlePlayPause}>
              <Animated.View style={[styles.playButtonOuter, pulseStyle]}>
                <LinearGradient
                  colors={[GlowColors.neonGreen, GlowColors.neonCyan]}
                  style={styles.playButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons
                    name={isPlaying ? "pause" : hasEnded ? "refresh" : "play"}
                    size={40}
                    color={Colors.dark.buttonText}
                    style={isPlaying || hasEnded ? {} : { marginLeft: 4 }}
                  />
                </LinearGradient>
              </Animated.View>
            </Pressable>
          </Animated.View>
        )}
      </Pressable>

      <Animated.View
        entering={FadeInUp.delay(300)}
        style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}
      >
        {speakerName && (
          <View style={styles.speakerInfo}>
            {speakerPhotoUrl && (
              <View style={styles.speakerPhoto}>
                <Ionicons name="person" size={24} color={Colors.textSecondary} />
              </View>
            )}
            <View>
              <Text style={styles.speakerName}>{speakerName}</Text>
              {speakerRole && (
                <Text style={styles.speakerRole}>{speakerRole}</Text>
              )}
            </View>
          </View>
        )}

        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%` },
              ]}
            />
          </View>
          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>
              {formatTime((player?.currentTime || 0))}
            </Text>
            <Text style={styles.timeText}>
              {formatTime(duration)}
            </Text>
          </View>
        </View>

        {hasEnded && (
          <Animated.View entering={FadeInUp}>
            <Pressable style={styles.continueButton} onPress={handleContinue}>
              <LinearGradient
                colors={[GlowColors.neonGreen, GlowColors.neonCyan]}
                style={styles.continueGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.continueText}>Continue</Text>
                <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.lg,
    zIndex: 10,
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
  videoTouchArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centerControls: {
    justifyContent: "center",
    alignItems: "center",
  },
  playButtonOuter: {
    borderRadius: 50,
    padding: 4,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  speakerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  speakerPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: GlowColors.neonGreen,
  },
  speakerName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  speakerRole: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontWeight: "bold",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
  progressContainer: {
    marginTop: Spacing.sm,
  },
  progressTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: GlowColors.neonGreen,
    borderRadius: 2,
  },
  timeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  timeText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  continueButton: {
    marginTop: Spacing.md,
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
}));
