import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors, TextColors, FunctionColors } from "@/constants/theme";
import { getStaticAssetsUrl } from "@/lib/query-client";
import { EmptyStateCard } from "@/components/EmptyStateCard";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface VideoAnnotation {
  timestamp: number;
  text: string;
}

interface VideoFeedback {
  id: string;
  coachId: string;
  playerId: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  annotations: VideoAnnotation[];
  createdAt: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function VideoFeedbackCard({
  item,
  onPress,
}: {
  item: VideoFeedback;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.feedbackCard} onPress={onPress}>
      <View style={styles.cardIconArea}>
        <Ionicons name="videocam" size={28} color={FunctionColors.planning} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
        {item.annotations && item.annotations.length > 0 ? (
          <View style={styles.cardAnnotationsBadge}>
            <Ionicons name="bookmark" size={11} color={Colors.dark.accentText} />
            <Text style={styles.cardAnnotationsText}>
              {item.annotations.length} note{item.annotations.length !== 1 ? "s" : ""}
            </Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={TextColors.muted} />
    </Pressable>
  );
}

function VideoPlayerView({ feedback }: { feedback: VideoFeedback }) {
  const insets = useSafeAreaInsets();
  const [activeAnnotation, setActiveAnnotation] = useState<VideoAnnotation | null>(null);

  const sortedAnnotations = [...(feedback.annotations || [])].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  const videoUrl = feedback.videoUrl.startsWith("http")
    ? feedback.videoUrl
    : `${getStaticAssetsUrl()}${feedback.videoUrl}`;

  const player = useVideoPlayer(videoUrl, (p) => { p.loop = false; });
  const { currentTime } = useEvent(player, "timeUpdate", { currentTime: player.currentTime });

  React.useEffect(() => {
    const posSeconds = currentTime ?? 0;
    const current = sortedAnnotations
      .filter((a) => a.timestamp <= posSeconds && a.timestamp >= posSeconds - 3)
      .pop();
    setActiveAnnotation(current || null);
  }, [currentTime]);

  const seekTo = (timestamp: number) => {
    player.currentTime = timestamp;
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Backgrounds.root }}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Video player */}
      <View style={styles.videoContainer}>
        <VideoView
          player={player}
          style={styles.videoPlayer}
          contentFit="contain"
          nativeControls
        />
        {/* Annotation overlay */}
        {activeAnnotation ? (
          <View style={styles.annotationOverlay}>
            <View style={styles.annotationOverlayBubble}>
              <Ionicons name="bookmark" size={12} color={Colors.dark.accentText} />
              <Text style={styles.annotationOverlayText}>{activeAnnotation.text}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Feedback info */}
      <View style={styles.infoContainer}>
        <Text style={styles.feedbackTitle}>{feedback.title}</Text>
        <Text style={styles.feedbackDate}>{formatDate(feedback.createdAt)}</Text>

        {/* Timeline with annotations */}
        {sortedAnnotations.length > 0 ? (
          <View style={styles.annotationsSection}>
            <Text style={styles.annotationsSectionTitle}>Coach Notes</Text>
            {sortedAnnotations.map((ann, index) => (
              <Pressable
                key={index}
                style={styles.annotationRow}
                onPress={() => seekTo(ann.timestamp)}
              >
                <View style={styles.annotationTimestampBtn}>
                  <Ionicons name="play-circle" size={14} color={Colors.dark.accentText} />
                  <Text style={styles.annotationTimestampText}>{formatTimestamp(ann.timestamp)}</Text>
                </View>
                <Text style={styles.annotationNoteText}>{ann.text}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.noAnnotationsBox}>
            <Text style={styles.noAnnotationsText}>No annotations on this video</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

export default function VideoFeedbackPlayerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const feedbackId = route.params?.feedbackId as string | undefined;

  const { data: allFeedback = [], isLoading } = useQuery<VideoFeedback[]>({
    queryKey: ["/api/player/me/video-feedback"],
  });

  const [selectedId, setSelectedId] = useState<string | null>(feedbackId || null);
  const selectedFeedback = allFeedback.find((f) => f.id === selectedId);

  useEffect(() => {
    if (feedbackId) setSelectedId(feedbackId);
  }, [feedbackId]);

  if (selectedFeedback) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => setSelectedId(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={TextColors.primary} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{selectedFeedback.title}</Text>
          <View style={{ width: 40 }} />
        </View>
        <VideoPlayerView feedback={selectedFeedback} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={TextColors.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Coach Feedback Videos</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.dark.accentText} style={{ marginTop: 60 }} />
      ) : allFeedback.length === 0 ? (
        <EmptyStateCard
          icon="videocam-outline"
          title="No video feedback yet"
          message="Your coach will send video feedback when they have technique tips or clips to share"
        />
      ) : (
        <FlatList
          data={allFeedback}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <VideoFeedbackCard item={item} onPress={() => setSelectedId(item.id)} />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: TextColors.primary,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  feedbackCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
    gap: Spacing.md,
  },
  cardIconArea: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: FunctionColors.planning + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: TextColors.primary,
  },
  cardDate: {
    fontSize: 12,
    color: TextColors.muted,
    marginTop: 2,
  },
  cardAnnotationsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  cardAnnotationsText: {
    fontSize: 11,
    color: Colors.dark.accentText,
    fontWeight: "600",
  },
  // Player view
  videoContainer: {
    width: SCREEN_WIDTH,
    backgroundColor: "#000",
    position: "relative",
  },
  videoPlayer: {
    width: SCREEN_WIDTH,
    height: Math.round(SCREEN_WIDTH * 9 / 16),
  },
  annotationOverlay: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
  },
  annotationOverlayBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: GlowColors.primary,
  },
  annotationOverlayText: {
    flex: 1,
    fontSize: 13,
    color: TextColors.primary,
    fontWeight: "500",
  },
  infoContainer: {
    padding: Spacing.lg,
  },
  feedbackTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TextColors.primary,
  },
  feedbackDate: {
    fontSize: 13,
    color: TextColors.muted,
    marginTop: 4,
    marginBottom: Spacing.lg,
  },
  annotationsSection: {
    gap: Spacing.sm,
  },
  annotationsSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: TextColors.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  annotationRow: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
  },
  annotationTimestampBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  annotationTimestampText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.accentText,
    fontFamily: "monospace",
  },
  annotationNoteText: {
    fontSize: 14,
    color: TextColors.secondary,
    lineHeight: 20,
  },
  noAnnotationsBox: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  noAnnotationsText: {
    fontSize: 14,
    color: TextColors.muted,
    fontStyle: "italic",
  },
}));
