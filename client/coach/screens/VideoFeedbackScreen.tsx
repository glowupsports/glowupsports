import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  FlatList,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors, TextColors, FunctionColors } from "@/constants/theme";
import { apiRequest, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { useCoach } from "@/coach/context/CoachContext";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { EmptyStateCard } from "@/components/EmptyStateCard";

interface VideoAnnotation {
  timestamp: number;
  text: string;
}

interface Player {
  id: string;
  name: string;
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
  playerName?: string;
}

type Tab = "send" | "sent";
type RouteParams = { playerId?: string };

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function VideoPreview({
  uri,
  onPositionChange,
  onRemove,
  onAnnotate,
  position,
  duration,
}: {
  uri: string;
  onPositionChange: (pos: number, dur: number) => void;
  onRemove: () => void;
  onAnnotate: () => void;
  position: number;
  duration: number;
}) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; });
  const { currentTime } = useEvent(player, "timeUpdate", { currentTime: player.currentTime });

  React.useEffect(() => {
    onPositionChange(currentTime ?? 0, player.duration ?? 0);
  }, [currentTime]);

  return (
    <View style={styles.videoPreviewContainer}>
      <VideoView
        player={player}
        style={styles.videoPreview}
        contentFit="contain"
        nativeControls
      />
      <View style={styles.videoActionsRow}>
        <Text style={styles.videoTimeText}>
          {formatTimestamp(position)} / {formatTimestamp(duration)}
        </Text>
        <Pressable style={styles.annotateBtn} onPress={onAnnotate}>
          <Ionicons name="add-circle-outline" size={18} color={GlowColors.primary} />
          <Text style={styles.annotateBtnText}>Add Note</Text>
        </Pressable>
        <Pressable onPress={onRemove}>
          <Ionicons name="close-circle" size={24} color={TextColors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

export default function VideoFeedbackScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const { coach } = useCoach();

  const [activeTab, setActiveTab] = useState<Tab>("send");

  // Send tab state
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    (route.params as RouteParams)?.playerId || null
  );
  const [title, setTitle] = useState("");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [annotations, setAnnotations] = useState<VideoAnnotation[]>([]);
  const [annotationText, setAnnotationText] = useState("");
  const [videoPosition, setVideoPosition] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [addingAnnotation, setAddingAnnotation] = useState(false);
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  // Players list
  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  // Sent feedback
  const { data: sentFeedback = [], isLoading: loadingSent } = useQuery<VideoFeedback[]>({
    queryKey: ["/api/coach/me/video-feedback"],
    enabled: activeTab === "sent",
  });

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Please grant access to your media library to select a video.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri);
      setVideoUrl(null);
    }
  };

  const recordVideo = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not Available", "Video recording is only available in the mobile app.");
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Please grant camera access to record a video.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      videoMaxDuration: 300,
    });
    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri);
      setVideoUrl(null);
    }
  };

  const uploadVideo = async (): Promise<string | null> => {
    if (!videoUri) return null;
    setUploading(true);
    try {
      const formData = new FormData();
      const filename = videoUri.split("/").pop() || "video.mp4";
      const ext = filename.split(".").pop() || "mp4";
      const mimeType = ext === "mov" ? "video/quicktime" : "video/mp4";

      if (Platform.OS === "web") {
        const response = await fetch(videoUri);
        const blob = await response.blob();
        formData.append("video", blob, filename);
      } else {
        formData.append("video", { uri: videoUri, name: filename, type: mimeType } as any);
      }

      const apiBase = getApiUrl();
      const uploadUrl = new URL("/api/video-feedback/upload", apiBase).toString();
      const headers = await getAuthHeaders();

      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: headers.Authorization },
        body: formData,
      });

      if (!res.ok) {
        const { parseUploadErrorResponse } = await import("@/lib/uploads");
        const { message } = await parseUploadErrorResponse(
          res,
          "Could not upload video. Please try again.",
        );
        throw new Error(message);
      }

      const data = await res.json();
      setThumbnailUrl(data.thumbnailUrl || null);
      return data.videoUrl as string;
    } catch (err: any) {
      Alert.alert("Upload Failed", err.message || "Could not upload video.");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlayerId) throw new Error("Please select a player");
      if (!title.trim()) throw new Error("Please add a title");
      if (!videoUri && !videoUrl) throw new Error("Please select or record a video");

      let finalVideoUrl = videoUrl;
      if (!finalVideoUrl) {
        finalVideoUrl = await uploadVideo();
        if (!finalVideoUrl) throw new Error("Video upload failed");
      }

      const sortedAnnotations = [...annotations].sort((a, b) => a.timestamp - b.timestamp);

      return apiRequest("POST", "/api/video-feedback", {
        playerId: selectedPlayerId,
        title: title.trim(),
        videoUrl: finalVideoUrl,
        thumbnailUrl: thumbnailUrl || undefined,
        annotations: sortedAnnotations,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/me/video-feedback"] });
      Alert.alert("Sent", "Video feedback has been sent to the player.", [
        {
          text: "OK",
          onPress: () => {
            setSelectedPlayerId(null);
            setTitle("");
            setVideoUri(null);
            setVideoUrl(null);
            setThumbnailUrl(null);
            setAnnotations([]);
            setActiveTab("sent");
          },
        },
      ]);
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to send video feedback");
    },
  });

  const addAnnotation = () => {
    if (!annotationText.trim()) return;
    const newAnnotation: VideoAnnotation = {
      timestamp: videoPosition,
      text: annotationText.trim(),
    };
    setAnnotations((prev) => [...prev, newAnnotation]);
    setAnnotationText("");
    setAddingAnnotation(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const removeAnnotation = (index: number) => {
    setAnnotations((prev) => prev.filter((_, i) => i !== index));
  };

  const pauseAndAnnotate = () => {
    setAddingAnnotation(true);
  };

  const renderSendTab = () => (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1 }}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Player selector */}
      <Text style={styles.sectionLabel}>Player</Text>
      <Pressable style={styles.selectorRow} onPress={() => setShowPlayerPicker(true)}>
        <Ionicons name="person-circle-outline" size={20} color={TextColors.secondary} />
        <Text style={[styles.selectorText, selectedPlayer ? styles.selectorSelected : {}]}>
          {selectedPlayer ? selectedPlayer.name : "Select player..."}
        </Text>
        <Ionicons name="chevron-down" size={16} color={TextColors.muted} />
      </Pressable>

      {/* Title */}
      <Text style={styles.sectionLabel}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Backhand technique review"
        placeholderTextColor={TextColors.muted}
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />

      {/* Video picker */}
      <Text style={styles.sectionLabel}>Video</Text>
      {!videoUri ? (
        <View style={styles.videoPicker}>
          <Pressable style={styles.videoPickerBtn} onPress={pickVideo}>
            <Ionicons name="folder-open-outline" size={24} color={GlowColors.primary} />
            <Text style={styles.videoPickerBtnText}>Choose from Library</Text>
          </Pressable>
          {Platform.OS !== "web" ? (
            <Pressable style={styles.videoPickerBtn} onPress={recordVideo}>
              <Ionicons name="videocam-outline" size={24} color={FunctionColors.planning} />
              <Text style={[styles.videoPickerBtnText, { color: FunctionColors.planning }]}>
                Record Video
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <VideoPreview
          uri={videoUri}
          onPositionChange={(pos, dur) => { setVideoPosition(pos); setVideoDuration(dur); }}
          onRemove={() => { setVideoUri(null); setThumbnailUrl(null); setAnnotations([]); }}
          onAnnotate={pauseAndAnnotate}
          position={videoPosition}
          duration={videoDuration}
        />
      )}

      {/* Annotations */}
      {annotations.length > 0 ? (
        <View style={styles.annotationsSection}>
          <Text style={styles.sectionLabel}>Annotations ({annotations.length})</Text>
          {[...annotations]
            .sort((a, b) => a.timestamp - b.timestamp)
            .map((ann, index) => (
              <View key={index} style={styles.annotationItem}>
                <View style={styles.annotationTimestamp}>
                  <Ionicons name="time-outline" size={12} color={GlowColors.primary} />
                  <Text style={styles.annotationTimestampText}>{formatTimestamp(ann.timestamp)}</Text>
                </View>
                <Text style={styles.annotationText} numberOfLines={2}>{ann.text}</Text>
                <Pressable onPress={() => removeAnnotation(index)}>
                  <Ionicons name="close" size={16} color={TextColors.muted} />
                </Pressable>
              </View>
            ))}
        </View>
      ) : null}

      {/* Send button */}
      <Pressable
        style={[
          styles.sendBtn,
          (!selectedPlayerId || !title.trim() || (!videoUri && !videoUrl) || sendMutation.isPending || uploading) &&
            styles.sendBtnDisabled,
        ]}
        onPress={() => sendMutation.mutate()}
        disabled={!selectedPlayerId || !title.trim() || (!videoUri && !videoUrl) || sendMutation.isPending || uploading}
      >
        {sendMutation.isPending || uploading ? (
          <ActivityIndicator size="small" color={Backgrounds.root} />
        ) : (
          <>
            <Ionicons name="send" size={18} color={Backgrounds.root} />
            <Text style={styles.sendBtnText}>
              {uploading ? "Uploading..." : "Send Feedback"}
            </Text>
          </>
        )}
      </Pressable>
    </KeyboardAwareScrollViewCompat>
  );

  const renderSentItem = ({ item }: { item: VideoFeedback }) => (
    <View style={styles.sentCard}>
      <View style={styles.sentCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sentTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.sentMeta}>{formatDate(item.createdAt)}</Text>
        </View>
        <View style={styles.annotationsBadge}>
          <Ionicons name="bookmark" size={12} color={GlowColors.primary} />
          <Text style={styles.annotationsBadgeText}>{item.annotations?.length || 0}</Text>
        </View>
      </View>
      {item.annotations && item.annotations.length > 0 ? (
        <View style={styles.sentAnnotationsPreview}>
          {item.annotations.slice(0, 2).map((ann, i) => (
            <Text key={i} style={styles.sentAnnotationPreviewText} numberOfLines={1}>
              {formatTimestamp(ann.timestamp)} — {ann.text}
            </Text>
          ))}
          {item.annotations.length > 2 ? (
            <Text style={styles.sentAnnotationMore}>+{item.annotations.length - 2} more</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const renderSentTab = () => (
    <View style={{ flex: 1 }}>
      {loadingSent ? (
        <ActivityIndicator size="large" color={GlowColors.primary} style={{ marginTop: 60 }} />
      ) : sentFeedback.length === 0 ? (
        <EmptyStateCard
          icon="videocam-outline"
          title="No video feedback sent yet"
          message="Send your first video feedback from the Send tab"
        />
      ) : (
        <FlatList
          data={sentFeedback}
          keyExtractor={(item) => item.id}
          renderItem={renderSentItem}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={TextColors.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Video Feedback</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === "send" && styles.tabActive]}
          onPress={() => setActiveTab("send")}
        >
          <Text style={[styles.tabText, activeTab === "send" && styles.tabTextActive]}>Send</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "sent" && styles.tabActive]}
          onPress={() => setActiveTab("sent")}
        >
          <Text style={[styles.tabText, activeTab === "sent" && styles.tabTextActive]}>Sent</Text>
        </Pressable>
      </View>

      {activeTab === "send" ? renderSendTab() : renderSentTab()}

      {/* Add annotation modal */}
      <Modal visible={addingAnnotation} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.annotationModal}>
            <Text style={styles.annotationModalTitle}>Add Note at {formatTimestamp(videoPosition)}</Text>
            <TextInput
              style={styles.annotationInput}
              placeholder="Describe what you want to highlight..."
              placeholderTextColor={TextColors.muted}
              value={annotationText}
              onChangeText={setAnnotationText}
              multiline
              autoFocus
              maxLength={500}
            />
            <View style={styles.annotationModalActions}>
              <Pressable
                style={styles.annotationCancelBtn}
                onPress={() => { setAddingAnnotation(false); setAnnotationText(""); }}
              >
                <Text style={styles.annotationCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.annotationSaveBtn, !annotationText.trim() && styles.sendBtnDisabled]}
                onPress={addAnnotation}
                disabled={!annotationText.trim()}
              >
                <Text style={styles.annotationSaveText}>Add Note</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Player picker modal */}
      <Modal visible={showPlayerPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select Player</Text>
            <FlatList
              data={players}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.playerPickerItem, selectedPlayerId === item.id && styles.playerPickerItemSelected]}
                  onPress={() => {
                    setSelectedPlayerId(item.id);
                    setShowPlayerPicker(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons name="person-circle-outline" size={20} color={TextColors.secondary} />
                  <Text style={styles.playerPickerName}>{item.name}</Text>
                  {selectedPlayerId === item.id ? (
                    <Ionicons name="checkmark-circle" size={20} color={GlowColors.primary} />
                  ) : null}
                </Pressable>
              )}
              style={{ maxHeight: 400 }}
            />
            <Pressable style={styles.annotationCancelBtn} onPress={() => setShowPlayerPicker(false)}>
              <Text style={styles.annotationCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TextColors.primary,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: BorderRadius.md,
  },
  tabActive: {
    backgroundColor: GlowColors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: TextColors.muted,
  },
  tabTextActive: {
    color: Backgrounds.root,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: TextColors.secondary,
    marginTop: Spacing.md,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
  },
  selectorText: {
    flex: 1,
    fontSize: 15,
    color: TextColors.muted,
  },
  selectorSelected: {
    color: TextColors.primary,
  },
  input: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 15,
    color: TextColors.primary,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
  },
  videoPicker: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  videoPickerBtn: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
    borderStyle: "dashed",
  },
  videoPickerBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  videoPreviewContainer: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  videoPreview: {
    width: "100%",
    height: 220,
  },
  videoActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.sm,
    backgroundColor: Backgrounds.card,
  },
  videoTimeText: {
    fontSize: 12,
    color: TextColors.muted,
    fontFamily: "monospace",
  },
  annotateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  annotateBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  annotationsSection: {
    marginTop: Spacing.sm,
  },
  annotationItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: 6,
  },
  annotationTimestamp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: GlowColors.primary + "20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    minWidth: 48,
  },
  annotationTimestampText: {
    fontSize: 11,
    fontWeight: "700",
    color: GlowColors.primary,
    fontFamily: "monospace",
  },
  annotationText: {
    flex: 1,
    fontSize: 13,
    color: TextColors.secondary,
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.xl,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: Backgrounds.root,
  },
  // Sent tab
  sentCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
  },
  sentCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sentTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: TextColors.primary,
  },
  sentMeta: {
    fontSize: 12,
    color: TextColors.muted,
    marginTop: 2,
  },
  annotationsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: GlowColors.primary + "20",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  annotationsBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  sentAnnotationsPreview: {
    marginTop: Spacing.sm,
    gap: 3,
  },
  sentAnnotationPreviewText: {
    fontSize: 12,
    color: TextColors.muted,
  },
  sentAnnotationMore: {
    fontSize: 12,
    color: TextColors.muted,
    fontStyle: "italic",
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  annotationModal: {
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  annotationModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TextColors.primary,
  },
  annotationInput: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 15,
    color: TextColors.primary,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
    minHeight: 100,
    textAlignVertical: "top",
  },
  annotationModalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  annotationCancelBtn: {
    flex: 1,
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  annotationCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: TextColors.secondary,
  },
  annotationSaveBtn: {
    flex: 1,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  annotationSaveText: {
    fontSize: 15,
    fontWeight: "700",
    color: Backgrounds.root,
  },
  pickerModal: {
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    maxHeight: "70%",
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TextColors.primary,
    marginBottom: Spacing.md,
  },
  playerPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Backgrounds.surface,
  },
  playerPickerItemSelected: {
    backgroundColor: GlowColors.primary + "10",
  },
  playerPickerName: {
    flex: 1,
    fontSize: 15,
    color: TextColors.primary,
  },
});
