import React, { useState, useRef, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform, Alert, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming,
  runOnJS 
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { apiFetch, getAuthHeaders } from "@/lib/query-client";

const MAX_DURATION = 10;

export default function EvidenceCaptureScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const cameraRef = useRef<CameraView>(null);

  const { skillTags = [], sessionId, blockId, playerId } = route.params || {};

  const [permission, requestPermission] = useCameraPermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [selectedSkill, setSelectedSkill] = useState<string | null>(skillTags[0] || null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressWidth = useSharedValue(0);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsRecording(true);
    setRecordingTime(0);
    progressWidth.value = 0;

    progressWidth.value = withTiming(100, { duration: MAX_DURATION * 1000 });

    timerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= MAX_DURATION - 1) {
          stopRecording();
          return MAX_DURATION;
        }
        return prev + 1;
      });
    }, 1000);

    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION,
      });
      
      if (video) {
        handleVideoRecorded(video.uri);
      }
    } catch (error) {
      console.error("Recording error:", error);
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
    }

    setIsRecording(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [isRecording]);

  const handleVideoRecorded = async (uri: string) => {
    Alert.alert(
      "Evidence Captured",
      `${MAX_DURATION} second video recorded successfully. Would you like to save this evidence?`,
      [
        { 
          text: "Discard", 
          style: "destructive",
          onPress: () => {
            setRecordingTime(0);
            progressWidth.value = 0;
          }
        },
        { 
          text: "Save", 
          onPress: () => {
            uploadEvidence(uri);
          }
        },
      ]
    );
  };

  const uploadEvidence = async (uri: string) => {
    if (!playerId) {
      Alert.alert("Error", "No player selected for evidence upload");
      return;
    }

    try {
      const formData = new FormData();
      
      if (Platform.OS === "web") {
        try {
          const blobRes = await fetch(uri);
          const blob = await blobRes.blob();
          const webFile = new window.File([blob], `evidence-${Date.now()}.mp4`, { type: blob.type || "video/mp4" });
          formData.append("video", webFile);
        } catch {
          formData.append("video", { uri, type: "video/mp4", name: `evidence-${Date.now()}.mp4` } as any);
        }
      } else {
        const filename = uri.split('/').pop() || `evidence-${Date.now()}.mp4`;
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `video/${match[1].toLowerCase()}` : 'video/mp4';
        formData.append("video", { uri, name: filename, type } as any);
      }
      
      formData.append("skillId", selectedSkill || "GENERAL");
      formData.append("captureType", "session");
      if (sessionId) formData.append("sessionId", sessionId);
      formData.append("durationSeconds", String(MAX_DURATION));

      const response = await apiFetch(`/api/players/${playerId}/evidence`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        Alert.alert("Success", "Evidence uploaded successfully!", [
          { text: "OK", onPress: () => navigation.goBack() }
        ]);
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Upload Failed", "Could not upload evidence. Please try again.");
    }
  };

  const toggleCamera = () => {
    setFacing(current => (current === "back" ? "front" : "back"));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  if (!permission) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <ThemedText>Loading camera...</ThemedText>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centerContainer, { paddingTop: insets.top }]}>
        <Card style={styles.permissionCard}>
          <Ionicons name="videocam-off" size={48} color={Colors.dark.disabled} />
          <ThemedText style={styles.permissionTitle}>Camera Permission Required</ThemedText>
          <ThemedText style={styles.permissionText}>
            We need camera access to record skill evidence videos for player progress tracking.
          </ThemedText>
          {Platform.OS !== "web" && permission.status === "denied" && !permission.canAskAgain ? (
            <Pressable 
              style={styles.permissionButton} 
              onPress={async () => {
                try {
                  await Linking.openSettings();
                } catch (error) {
                  console.error("Could not open settings:", error);
                }
              }}
            >
              <ThemedText style={styles.permissionButtonText}>Open Settings</ThemedText>
            </Pressable>
          ) : (
            <Pressable style={styles.permissionButton} onPress={requestPermission}>
              <ThemedText style={styles.permissionButtonText}>Enable Camera</ThemedText>
            </Pressable>
          )}
          {Platform.OS !== "web" && permission.status === "denied" && !permission.canAskAgain ? (
            <ThemedText style={styles.settingsHint}>
              Camera access was denied. Please enable it in your device settings.
            </ThemedText>
          ) : null}
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode="video"
      >
        <View style={[styles.overlay, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.topBar}>
            <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={28} color={Colors.dark.text} />
            </Pressable>

            <View style={styles.timerContainer}>
              <View style={styles.timerBadge}>
                <View style={[styles.recordDot, isRecording && styles.recordDotActive]} />
                <ThemedText style={styles.timerText}>
                  {recordingTime}s / {MAX_DURATION}s
                </ThemedText>
              </View>
            </View>

            <Pressable style={styles.flipButton} onPress={toggleCamera}>
              <Ionicons name="camera-reverse" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          {skillTags.length > 0 ? (
            <View style={styles.skillSelector}>
              <ThemedText style={styles.skillLabel}>Recording for:</ThemedText>
              <View style={styles.skillTags}>
                {skillTags.map((skill: string) => (
                  <Pressable
                    key={skill}
                    style={[
                      styles.skillTag,
                      selectedSkill === skill && styles.skillTagSelected,
                    ]}
                    onPress={() => setSelectedSkill(skill)}
                  >
                    <ThemedText style={[
                      styles.skillTagText,
                      selectedSkill === skill && styles.skillTagTextSelected,
                    ]}>
                      {skill.replace(/_/g, " ")}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <View style={[styles.bottomOverlay, { paddingBottom: insets.bottom + Spacing.xl }]}>
          <View style={styles.progressBar}>
            <Animated.View style={[styles.progressFill, progressAnimatedStyle]} />
          </View>

          <View style={styles.controls}>
            <View style={styles.controlPlaceholder} />

            <Pressable
              style={[styles.recordButton, isRecording && styles.recordButtonActive]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <View style={[styles.recordButtonInner, isRecording && styles.recordButtonInnerActive]} />
            </Pressable>

            <View style={styles.controlPlaceholder}>
              {isRecording ? (
                <Pressable style={styles.stopButton} onPress={stopRecording}>
                  <Ionicons name="stop" size={24} color={Colors.dark.error} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.instructions}>
            <Ionicons name="information-circle" size={16} color={Colors.dark.text} style={{ opacity: 0.6 }} />
            <ThemedText style={styles.instructionText}>
              {isRecording 
                ? "Recording... Tap stop or wait for auto-stop" 
                : "Tap record to capture 10-second evidence video"
              }
            </ThemedText>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centerContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  permissionCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    gap: Spacing.md,
    maxWidth: 320,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
  },
  permissionText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
    textAlign: "center",
    lineHeight: 20,
  },
  permissionButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  settingsHint: {
    fontSize: 12,
    color: Colors.dark.orange,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  timerContainer: {
    flex: 1,
    alignItems: "center",
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.disabled,
  },
  recordDotActive: {
    backgroundColor: Colors.dark.error,
  },
  timerText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    fontVariant: ["tabular-nums"],
  },
  flipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  skillSelector: {
    marginTop: Spacing.lg,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  skillLabel: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.8,
    marginBottom: Spacing.sm,
  },
  skillTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  skillTag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  skillTagSelected: {
    backgroundColor: Colors.dark.primary + "30",
    borderColor: Colors.dark.primary,
  },
  skillTagText: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.8,
  },
  skillTagTextSelected: {
    color: Colors.dark.primary,
    opacity: 1,
  },
  bottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    backgroundColor: "rgba(0,0,0,0.3)",
    paddingTop: Spacing.lg,
  },
  progressBar: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.error,
    borderRadius: 2,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  controlPlaceholder: {
    width: 60,
    alignItems: "center",
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: Colors.dark.text,
  },
  recordButtonActive: {
    backgroundColor: "rgba(255,0,0,0.3)",
  },
  recordButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.error,
  },
  recordButtonInnerActive: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  stopButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  instructions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  instructionText: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.8,
  },
});
