import React, { useRef, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, Modal, ActivityIndicator, Text, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { getStaticAssetsUrl } from "@/lib/query-client";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface VideoPlayerModalProps {
  visible: boolean;
  videoUrl: string;
  title?: string;
  onClose: () => void;
}

export function VideoPlayerModal({ visible, videoUrl, title, onClose }: VideoPlayerModalProps) {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fullVideoUrl = videoUrl.startsWith("http") 
    ? videoUrl 
    : `${getStaticAssetsUrl()}${videoUrl}`;

  const player = useVideoPlayer(fullVideoUrl, (p) => {
    p.loop = false;
    p.play();
  });

  const { status } = useEvent(player, "statusChange", { status: player.status });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });

  React.useEffect(() => {
    if (status === "readyToPlay") {
      setIsLoading(false);
      setError(null);
    } else if (status === "error") {
      setIsLoading(false);
      setError("Failed to load video");
    } else if (status === "loading") {
      setIsLoading(true);
    }
  }, [status]);

  const handleClose = () => {
    player.pause();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleReplay = () => {
    player.currentTime = 0;
    player.play();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { paddingTop: insets.top + Spacing.md }]}>
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
            </View>
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          <View style={styles.videoContainer}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.dark.primary} />
                <Text style={styles.loadingText}>Loading video...</Text>
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
                <Text style={styles.errorText}>{error}</Text>
                <Pressable style={styles.retryButton} onPress={() => player.play()}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {!error ? (
              <VideoView
                player={player}
                style={styles.video}
                contentFit="contain"
                nativeControls={false}
              />
            ) : null}
          </View>

          <View style={styles.controls}>
            <Pressable style={styles.controlButton} onPress={handleReplay}>
              <Ionicons name="refresh" size={28} color={Colors.dark.text} />
            </Pressable>
            
            <Pressable 
              style={[styles.playButton, isPlaying && styles.playButtonActive]} 
              onPress={togglePlayPause}
            >
              <Ionicons 
                name={isPlaying ? "pause" : "play"} 
                size={32} 
                color={Colors.dark.buttonText} 
              />
            </Pressable>
            
            <View style={styles.controlButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
    width: "100%",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  titleContainer: {
    flex: 1,
    marginRight: Spacing.md,
  },
  title: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Backgrounds.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  videoContainer: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  loadingContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.sm,
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.error,
    marginTop: Spacing.md,
    textAlign: "center",
  },
  retryButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    ...Typography.button,
    color: Colors.dark.buttonText,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.lg,
    gap: Spacing.xl,
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Backgrounds.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: GlowColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonActive: {
    backgroundColor: Colors.dark.xpCyan,
  },
}));
