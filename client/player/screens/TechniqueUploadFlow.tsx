import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";

import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { useQueryClient } from "@tanstack/react-query";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import { File as EXFile } from "expo-file-system";

const STROKES = ["Serve", "Forehand", "Backhand", "Volley", "Return", "Overhead"] as const;
type Stroke = (typeof STROKES)[number];

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const STROKE_ICONS: Record<Stroke, IoniconName> = {
  Serve: "arrow-up-circle-outline",
  Forehand: "flash-outline",
  Backhand: "swap-horizontal-outline",
  Volley: "contract-outline",
  Return: "return-down-back-outline",
  Overhead: "chevron-up-circle-outline",
};

const STROKE_TIPS: Record<Stroke, string> = {
  Serve: "Film from the side or behind the baseline showing your full serve motion.",
  Forehand: "Film from the side at court level showing your swing from takeback to follow-through.",
  Backhand: "Film from the side showing your shoulder turn and contact point.",
  Volley: "Film from the net side showing your ready position and punch action.",
  Return: "Film from the side showing your split step and swing.",
  Overhead: "Film from the side showing your positioning and overhead motion.",
};

export default function TechniqueUploadFlow() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedStroke, setSelectedStroke] = useState<Stroke | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState<string>("video/mp4");
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const handlePickVideo = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not Supported", "Video upload is only available in the Expo Go app on your device.");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Required", "Please allow access to your photo library to select a video.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: true,
      videoMaxDuration: 30,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const dur = asset.duration ? asset.duration / 1000 : null;
    if (dur && dur > 32) {
      Alert.alert("Clip Too Long", "Please select a clip that is 30 seconds or shorter for analysis.");
      return;
    }
    setVideoUri(asset.uri);
    setVideoName(asset.fileName ?? `clip-${Date.now()}.mp4`);
    setVideoMime(asset.mimeType ?? "video/mp4");
    setVideoDuration(dur);
    // Generate a thumbnail for the Step 2 preview — dynamic import so the
    // native ExpoVideoThumbnails bridge is only required when actually used,
    // not at module-load time (which would crash on binaries that don't have
    // the native module compiled in).
    import("expo-video-thumbnails") // eslint-disable-line import/no-unresolved
      .then((VideoThumbnails) =>
        VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 }),
      )
      .then((res: { uri: string }) => setThumbnailUri(res.uri))
      .catch(() => setThumbnailUri(null));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const handleRecordVideo = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not Supported", "Video recording is only available in the Expo Go app on your device.");
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Required", "Please allow access to the camera to record a video.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      allowsEditing: true,
      videoMaxDuration: 30,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const dur = asset.duration ? asset.duration / 1000 : null;
    if (dur && dur > 32) {
      Alert.alert("Clip Too Long", "Please record a clip that is 30 seconds or shorter for analysis.");
      return;
    }
    setVideoUri(asset.uri);
    setVideoName(asset.fileName ?? `clip-${Date.now()}.mp4`);
    setVideoMime(asset.mimeType ?? "video/mp4");
    setVideoDuration(dur);
    // Generate a thumbnail for the Step 2 preview — dynamic import (see above).
    import("expo-video-thumbnails") // eslint-disable-line import/no-unresolved
      .then((VideoThumbnails) =>
        VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 }),
      )
      .then((res: { uri: string }) => setThumbnailUri(res.uri))
      .catch(() => setThumbnailUri(null));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const handleUpload = useCallback(() => {
    if (!videoUri || !selectedStroke) return;
    setUploading(true);
    setUploadProgress(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const stroke = selectedStroke;
    const uri = videoUri; // narrow: guard above ensures non-null

    const sendXhr = (formData: FormData) => {
      const base = getApiUrl();
      const url = new URL("/api/player/me/technique-analyses", base).toString();
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.onload = () => {
        setUploading(false);
        xhrRef.current = null;
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            queryClient.invalidateQueries({ queryKey: ["/api/player/me/technique-analyses"] });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            navigation.replace("TechniqueAnalysisResult", { analysisId: data.analysisId, strokeType: stroke });
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("Upload Failed", data.error ?? "Something went wrong. Please try again.");
          }
        } catch {
          Alert.alert("Upload Failed", "Unexpected server response. Please try again.");
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        xhrRef.current = null;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Upload Failed", "Network error. Please check your connection and try again.");
      };

      xhr.open("POST", url);
      xhr.withCredentials = true;
      // Attach auth token so the protected upload endpoint accepts the request
      AsyncStorage.getItem("auth_token").then((token) => {
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.send(formData);
      }).catch(() => { xhr.send(formData); });
    };

    // Read the player's coach-share preference (set in Privacy Settings), then upload
    AsyncStorage.getItem("technique_share_with_coach_default").then((val) => {
      const shareDefault = val === null ? "true" : val;
      if (Platform.OS === "web") {
        fetch(uri)
          .then((r) => r.blob())
          .then((blob) => {
            const formData = new FormData();
            formData.append("video", blob, videoName ?? "clip.mp4");
            formData.append("stroke_type", stroke);
            formData.append("share_with_coach", shareDefault);
            sendXhr(formData);
          })
          .catch((err) => {
            setUploading(false);
            Alert.alert("Upload Failed", err.message ?? "Something went wrong. Please try again.");
          });
      } else {
        const formData = new FormData();
        const file = new EXFile(uri, videoName ?? "clip.mp4", videoMime);
        formData.append("video", file);
        formData.append("stroke_type", stroke);
        formData.append("share_with_coach", shareDefault);
        sendXhr(formData);
      }
    }).catch(() => {
      setUploading(false);
      Alert.alert("Upload Failed", "Could not read preferences. Please try again.");
    });
  }, [videoUri, selectedStroke, videoName, videoMime, navigation, queryClient]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.stepRow}>
        {([1, 2, 3] as const).map((s) => (
          <View key={s} style={styles.stepItem}>
            <View style={[styles.stepDot, step >= s && styles.stepDotActive]}>
              {step > s ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : (
                <Text style={[styles.stepNum, step >= s && styles.stepNumActive]}>{s}</Text>
              )}
            </View>
            {s < 3 ? <View style={[styles.stepLine, step > s && styles.stepLineActive]} /> : null}
          </View>
        ))}
      </View>

      {step === 1 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Stroke Type</Text>
          <Text style={styles.sectionSub}>Which shot would you like the AI to analyze?</Text>
          <View style={styles.strokeGrid}>
            {STROKES.map((stroke) => (
              <Pressable
                key={stroke}
                style={({ pressed }) => [
                  styles.strokeCard,
                  selectedStroke === stroke && styles.strokeCardActive,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => {
                  setSelectedStroke(stroke);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Ionicons
                  name={STROKE_ICONS[stroke]}
                  size={24}
                  color={selectedStroke === stroke ? Colors.dark.primary : Colors.dark.textMuted}
                />
                <Text style={[styles.strokeName, selectedStroke === stroke && styles.strokeNameActive]}>
                  {stroke}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={({ pressed }) => [styles.nextBtn, !selectedStroke && styles.nextBtnDisabled, pressed && { opacity: 0.8 }]}
            onPress={() => { if (selectedStroke) { setStep(2); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }}
            disabled={!selectedStroke}
          >
            <Text style={styles.nextBtnText}>Continue</Text>
            <Ionicons name="chevron-forward" size={16} color="#000" />
          </Pressable>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload Your Clip</Text>
          <Text style={styles.sectionSub}>Select or record a video of your {selectedStroke}.</Text>

          <View style={styles.tipCard}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.dark.primary} />
            <Text style={styles.tipText}>{selectedStroke ? STROKE_TIPS[selectedStroke] : ""}</Text>
          </View>

          <View style={styles.durationNote}>
            <Ionicons name="time-outline" size={15} color="#F59E0B" />
            <Text style={styles.durationNoteText}>Maximum clip length: 30 seconds. Longer clips will be rejected.</Text>
          </View>

          {videoUri ? (
            <View style={styles.videoPreviewCard}>
              {thumbnailUri ? (
                <Image
                  source={{ uri: thumbnailUri }}
                  style={styles.videoThumbnailImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.videoThumbnailPlaceholder}>
                  <Ionicons name="videocam" size={32} color={Colors.dark.primary} />
                </View>
              )}
              <View style={styles.videoPreviewInfo}>
                <Text style={styles.videoSelectedTitle}>Ready to analyze</Text>
                <Text style={styles.videoSelectedSub} numberOfLines={1}>
                  {videoName}{videoDuration ? ` · ${Math.round(videoDuration)}s` : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => { setVideoUri(null); setVideoName(null); setVideoDuration(null); setThumbnailUri(null); }}
                style={styles.removeBtn}
              >
                <Ionicons name="close-circle" size={22} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.uploadOptions}>
              <Pressable
                style={({ pressed }) => [styles.uploadOptionBtn, pressed && { opacity: 0.8 }]}
                onPress={handlePickVideo}
              >
                <Ionicons name="images-outline" size={28} color={Colors.dark.primary} />
                <Text style={styles.uploadOptionText}>Choose from library</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.uploadOptionBtn, pressed && { opacity: 0.8 }]}
                onPress={handleRecordVideo}
              >
                <Ionicons name="camera-outline" size={28} color={Colors.dark.primary} />
                <Text style={styles.uploadOptionText}>Record now</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.rowBtns}>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.8 }]}
              onPress={() => setStep(1)}
            >
              <Ionicons name="chevron-back" size={16} color={Colors.dark.text} />
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.nextBtn, { flex: 1 }, !videoUri && styles.nextBtnDisabled, pressed && { opacity: 0.8 }]}
              onPress={() => { if (videoUri) { setStep(3); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }}
              disabled={!videoUri}
            >
              <Text style={styles.nextBtnText}>Continue</Text>
              <Ionicons name="chevron-forward" size={16} color="#000" />
            </Pressable>
          </View>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ready to Analyze</Text>
          <Text style={styles.sectionSub}>Review the details and start your AI analysis.</Text>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Stroke</Text>
              <View style={styles.summaryValueRow}>
                <Ionicons name={selectedStroke ? STROKE_ICONS[selectedStroke] : "tennisball-outline"} size={16} color={Colors.dark.primary} />
                <Text style={styles.summaryValue}>{selectedStroke}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Video</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>{videoName}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Length</Text>
              <Text style={styles.summaryValue}>{videoDuration ? `${Math.round(videoDuration)}s` : "Under 30s"}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Processing</Text>
              <Text style={styles.summaryValue}>30 – 90 seconds</Text>
            </View>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="notifications-outline" size={16} color={Colors.dark.primary} />
            <Text style={styles.infoBoxText}>
              You will receive a push notification when the analysis is ready. You can close this screen — your result will be saved in your history.
            </Text>
          </View>

          <View style={styles.deleteNotice}>
            <Ionicons name="trash-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.deleteNoticeText}>
              Videos are automatically deleted after 90 days. Your analysis results are kept permanently.
            </Text>
          </View>

          {uploading ? (
            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <ActivityIndicator size="small" color={Colors.dark.primary} />
                <Text style={styles.progressLabel}>
                  {uploadProgress < 100 ? `Uploading... ${uploadProgress}%` : "Processing your video..."}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
            </View>
          ) : null}

          <View style={styles.rowBtns}>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.8 }]}
              onPress={() => setStep(2)}
              disabled={uploading}
            >
              <Ionicons name="chevron-back" size={16} color={Colors.dark.text} />
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.uploadBtn, { flex: 1 }, uploading && styles.nextBtnDisabled, pressed && { opacity: 0.85 }]}
              onPress={handleUpload}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color="#000" />
                  <Text style={styles.uploadBtnText}>Start Analysis</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = makeReactiveStyles(() =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
    content: { paddingHorizontal: Spacing.lg, gap: Spacing.xl },
    stepRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 0,
    },
    stepItem: { flexDirection: "row", alignItems: "center" },
    stepDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: Colors.dark.chipBackgroundStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    stepDotActive: { backgroundColor: Colors.dark.primary },
    stepNum: { fontSize: 13, fontWeight: "700", color: Colors.dark.textMuted },
    stepNumActive: { color: "#000" },
    stepLine: { width: 40, height: 2, backgroundColor: Colors.dark.chipBackgroundStrong },
    stepLineActive: { backgroundColor: Colors.dark.primary },
    section: { gap: Spacing.lg },
    sectionTitle: { ...Typography.heading2, color: Colors.dark.text, textAlign: "center" },
    sectionSub: { ...Typography.body, color: Colors.dark.textMuted, textAlign: "center" },
    strokeGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.sm,
      justifyContent: "center",
    },
    strokeCard: {
      width: "30%",
      aspectRatio: 1,
      backgroundColor: Colors.dark.chipBackgroundStrong,
      borderRadius: BorderRadius.md,
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.xs,
      borderWidth: 2,
      borderColor: "transparent",
    },
    strokeCardActive: {
      borderColor: Colors.dark.primary,
      backgroundColor: Colors.dark.primary + "18",
    },
    strokeName: { ...Typography.caption, color: Colors.dark.textMuted, fontWeight: "600" },
    strokeNameActive: { color: Colors.dark.primary },
    nextBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.xs,
      backgroundColor: Colors.dark.primary,
      borderRadius: BorderRadius.full,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
    },
    nextBtnDisabled: { opacity: 0.4 },
    nextBtnText: { color: "#000", fontWeight: "700", fontSize: 15 },
    tipCard: {
      flexDirection: "row",
      gap: Spacing.sm,
      backgroundColor: Colors.dark.primary + "14",
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      alignItems: "flex-start",
    },
    tipText: { ...Typography.body, color: Colors.dark.text, flex: 1 },
    durationNote: {
      flexDirection: "row",
      gap: Spacing.xs,
      alignItems: "center",
      backgroundColor: "#F59E0B14",
      borderRadius: BorderRadius.sm,
      padding: Spacing.sm,
    },
    durationNoteText: { fontSize: 12, color: "#F59E0B", flex: 1, fontWeight: "600" },
    uploadOptions: { flexDirection: "row", gap: Spacing.sm },
    uploadOptionBtn: {
      flex: 1,
      backgroundColor: Colors.dark.chipBackgroundStrong,
      borderRadius: BorderRadius.md,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: Spacing.xl,
      gap: Spacing.sm,
    },
    uploadOptionText: { ...Typography.caption, color: Colors.dark.text, fontWeight: "600" },
    videoPreviewCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      backgroundColor: Colors.dark.chipBackgroundStrong,
      borderRadius: BorderRadius.md,
      overflow: "hidden",
    },
    videoThumbnailImage: {
      width: 90,
      height: 70,
      borderRadius: 0,
      backgroundColor: Colors.dark.backgroundRoot,
    },
    videoThumbnailPlaceholder: {
      width: 90,
      height: 70,
      backgroundColor: Colors.dark.primary + "14",
      alignItems: "center",
      justifyContent: "center",
    },
    videoPreviewInfo: {
      flex: 1,
      gap: 2,
    },
    videoSelectedTitle: { ...Typography.body, color: Colors.dark.text, fontWeight: "700" },
    videoSelectedSub: { ...Typography.caption, color: Colors.dark.textMuted },
    removeBtn: { padding: Spacing.md },
    rowBtns: { flexDirection: "row", gap: Spacing.sm },
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: Colors.dark.chipBackgroundStrong,
      borderRadius: BorderRadius.full,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
    },
    backBtnText: { color: Colors.dark.text, fontWeight: "600", fontSize: 15 },
    summaryCard: {
      backgroundColor: Colors.dark.chipBackgroundStrong,
      borderRadius: BorderRadius.md,
      overflow: "hidden",
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: Spacing.md,
    },
    summaryValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    summaryLabel: { ...Typography.body, color: Colors.dark.textMuted },
    summaryValue: { ...Typography.body, color: Colors.dark.text, fontWeight: "700" },
    divider: { height: 1, backgroundColor: Colors.dark.backgroundRoot },
    infoBox: {
      flexDirection: "row",
      gap: Spacing.sm,
      backgroundColor: Colors.dark.primary + "14",
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      alignItems: "flex-start",
    },
    infoBoxText: { ...Typography.caption, color: Colors.dark.text, flex: 1, lineHeight: 18 },
    deleteNotice: {
      flexDirection: "row",
      gap: Spacing.xs,
      alignItems: "flex-start",
      paddingHorizontal: Spacing.xs,
    },
    deleteNoticeText: {
      fontSize: 11,
      color: Colors.dark.textMuted,
      flex: 1,
      lineHeight: 16,
    },
    progressContainer: {
      gap: Spacing.sm,
    },
    progressHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    progressLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: Colors.dark.text,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: Colors.dark.chipBackgroundStrong,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 3,
      backgroundColor: Colors.dark.primary,
    },
    uploadBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.xs,
      backgroundColor: Colors.dark.primary,
      borderRadius: BorderRadius.full,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
    },
    uploadBtnText: { color: "#000", fontWeight: "700", fontSize: 15 },
  })
);
