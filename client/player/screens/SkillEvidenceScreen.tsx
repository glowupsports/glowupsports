import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions, CameraType } from "expo-camera";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/player/context/PlayerContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { LockedScreen } from "../components/LockedScreen";
import { VideoPlayerModal } from "@/components/VideoPlayerModal";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface Skill {
  id: string;
  name: string;
  pillar: string;
  description?: string;
}

interface Evidence {
  evidence: {
    id: string;
    videoUrl: string;
    status: string;
    captureType: string;
    createdAt: string;
    reviewNotes?: string;
  };
  skill: {
    id: string;
    name: string;
    pillar: string;
  } | null;
}

const PILLAR_COLORS: Record<string, string> = {
  TECHNIQUE: Colors.dark.primary,
  TACTICAL: Colors.dark.primary,
  PHYSICAL: Colors.dark.orange,
  MENTAL: "#9B59B6",
  SOCIAL: "#E91E63",
  MATCH: Colors.dark.gold,
};

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  pending: { color: Colors.dark.orange, label: "Pending Review", icon: "time-outline" },
  approved: { color: Colors.dark.primary, label: "Approved", icon: "checkmark-circle" },
  rejected: { color: Colors.dark.error, label: "Needs Improvement", icon: "close-circle" },
};

export default function SkillEvidenceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { player } = usePlayer();
  const queryClient = useQueryClient();
  const [showCamera, setShowCamera] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [facing, setFacing] = useState<CameraType>("back");
  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedVideo, setSelectedVideo] = useState<Evidence | null>(null);

  const { data: evidence = [], isLoading: loadingEvidence } = useQuery<Evidence[]>({
    queryKey: [`/api/players/${player?.id}/evidence`],
    enabled: !!player?.id,
  });

  const { data: skills = [] } = useQuery<Skill[]>({
    queryKey: ["/api/glow/skills"],
  });

  const startRecording = async () => {
    if (!cameraRef.current || !selectedSkill) return;
    
    try {
      setIsRecording(true);
      setRecordingTime(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 10) {
            stopRecording();
            return 10;
          }
          return prev + 1;
        });
      }, 1000);
      
      const video = await cameraRef.current.recordAsync({
        maxDuration: 10,
      });
      
      if (video?.uri) {
        await uploadEvidence(video.uri);
      }
    } catch (error) {
      console.error("Recording error:", error);
      Alert.alert("Recording Failed", "Please try again");
    } finally {
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const stopRecording = async () => {
    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setIsRecording(false);
    }
  };

  const uploadEvidence = async (videoUri: string) => {
    if (!player?.id || !selectedSkill) return;
    
    try {
      const formData = new FormData();
      
      formData.append("video", {
        uri: videoUri,
        name: `evidence_${Date.now()}.mp4`,
        type: "video/mp4",
      } as any);
      
      formData.append("skillId", selectedSkill.id);
      formData.append("captureType", "skill_demo");
      
      const response = await fetch(
        new URL(`/api/players/${player.id}/evidence`, getApiUrl()).toString(),
        {
          method: "POST",
          body: formData,
          headers: {
            Accept: "application/json",
          },
        }
      );
      
      if (response.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/evidence`] });
        setShowCamera(false);
        setSelectedSkill(null);
        Alert.alert("Success", "Your skill evidence has been uploaded for review!");
      } else {
        const { parseUploadErrorResponse } = await import("@/lib/uploads");
        const { message } = await parseUploadErrorResponse(
          response,
          "Couldn't upload your video. Please try again.",
        );
        throw new Error(message);
      }
    } catch (error) {
      console.error("Upload error:", error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Couldn't upload your video. Please try again.";
      Alert.alert("Upload Failed", message);
    }
  };

  const handleSkillSelect = (skill: Skill) => {
    setSelectedSkill(skill);
    Haptics.selectionAsync();
  };

  const handleStartCapture = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          "Camera Permission Required",
          "Please enable camera access to record skill evidence.",
          Platform.OS === "web" 
            ? [{ text: "OK" }] 
            : [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => {} },
              ]
        );
        return;
      }
    }
    setShowCamera(true);
  };

  const handlePlayVideo = (item: Evidence) => {
    setSelectedVideo(item);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const renderEvidenceCard = (item: Evidence) => {
    const status = STATUS_CONFIG[item.evidence.status] || STATUS_CONFIG.pending;
    const pillarColor = item.skill ? PILLAR_COLORS[item.skill.pillar] : Colors.dark.textMuted;
    
    return (
      <Pressable 
        key={item.evidence.id} 
        style={styles.evidenceCard}
        onPress={() => handlePlayVideo(item)}
      >
        <View style={styles.videoPreviewContainer}>
          <View style={styles.videoPlayOverlay}>
            <Ionicons name="play-circle" size={48} color={Colors.dark.primary} />
          </View>
        </View>
        
        <View style={styles.evidenceContent}>
          <View style={styles.evidenceHeader}>
            <View style={[styles.pillarBadge, { backgroundColor: pillarColor + "20" }]}>
              <Text style={[styles.pillarText, { color: pillarColor }]}>
                {item.skill?.pillar || "Unknown"}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: status.color + "20" }]}>
              <Ionicons name={status.icon as any} size={14} color={status.color} />
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
          
          <Text style={styles.skillName}>{item.skill?.name || "Unknown Skill"}</Text>
          
          <View style={styles.evidenceFooter}>
            <View style={styles.captureInfo}>
              <Ionicons name="videocam-outline" size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.captureType}>
                {item.evidence.captureType.replace("_", " ")}
              </Text>
            </View>
            <Text style={styles.dateText}>
              {new Date(item.evidence.createdAt).toLocaleDateString()}
            </Text>
          </View>
          
          {item.evidence.reviewNotes ? (
            <View style={styles.reviewNotesContainer}>
              <Text style={styles.reviewNotesLabel}>Coach Feedback:</Text>
              <Text style={styles.reviewNotes}>{item.evidence.reviewNotes}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const openSettings = async () => {
    try {
      if (Platform.OS !== "web") {
        await Linking.openSettings();
      }
    } catch (error) {
      console.error("Could not open settings:", error);
    }
  };

  if (showCamera && selectedSkill) {
    if (!permission?.granted) {
      const canAskAgain = permission?.canAskAgain !== false;
      
      return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Pressable onPress={() => { setShowCamera(false); setSelectedSkill(null); }} style={styles.backButton}>
              <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.headerTitle}>Skill Evidence</Text>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.permissionContainer}>
            <Ionicons name="videocam-off" size={64} color={Colors.dark.textMuted} />
            <Text style={styles.permissionTitle}>Camera Access Required</Text>
            <Text style={styles.permissionText}>
              Enable camera access to record skill evidence videos.
            </Text>
            {canAskAgain ? (
              <Pressable style={styles.permissionButton} onPress={requestPermission}>
                <Text style={styles.permissionButtonText}>Enable Camera</Text>
              </Pressable>
            ) : Platform.OS !== "web" ? (
              <Pressable style={styles.permissionButton} onPress={openSettings}>
                <Text style={styles.permissionButtonText}>Open Settings</Text>
              </Pressable>
            ) : (
              <Text style={styles.permissionText}>
                Please enable camera access in your browser settings.
              </Text>
            )}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
        />
        
        <View style={[styles.cameraOverlay, { paddingTop: insets.top }]}>
          <View style={styles.cameraHeader}>
            <Pressable 
              style={styles.closeButton}
              onPress={() => {
                if (isRecording) stopRecording();
                setShowCamera(false);
              }}
            >
              <Ionicons name="close" size={28} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.cameraTitle}>Record: {selectedSkill.name}</Text>
            <Pressable 
              style={styles.flipButton}
              onPress={() => setFacing(facing === "back" ? "front" : "back")}
            >
              <Ionicons name="camera-reverse" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>
          
          <View style={styles.cameraInstructions}>
            <Text style={styles.instructionText}>
              Demonstrate your {selectedSkill.name.toLowerCase()} skill
            </Text>
            <Text style={styles.timerText}>
              {isRecording ? `${recordingTime}s / 10s` : "Max 10 seconds"}
            </Text>
          </View>
          
          <View style={[styles.cameraControls, { paddingBottom: insets.bottom + 20 }]}>
            {isRecording ? (
              <Pressable style={styles.stopButton} onPress={stopRecording}>
                <View style={styles.stopIcon} />
              </Pressable>
            ) : (
              <Pressable style={styles.recordButton} onPress={startRecording}>
                <View style={styles.recordIcon} />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <LockedScreen featureKey="skill_evidence">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Skill Evidence</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.captureSection}>
            <LinearGradient
              colors={[Colors.dark.primary + "20", "transparent"]}
              style={styles.captureSectionGradient}
            >
              <View style={styles.captureSectionHeader}>
                <Ionicons name="videocam" size={24} color={Colors.dark.primary} />
                <Text style={styles.captureSectionTitle}>Record New Evidence</Text>
              </View>
              
              <Text style={styles.captureSectionDesc}>
                Capture a 10-second video demonstrating a skill for coach review
              </Text>

              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.skillSelector}
                contentContainerStyle={styles.skillSelectorContent}
              >
                {skills.slice(0, 10).map((skill) => (
                  <Pressable
                    key={skill.id}
                    style={[
                      styles.skillChip,
                      selectedSkill?.id === skill.id && styles.skillChipSelected,
                    ]}
                    onPress={() => handleSkillSelect(skill)}
                  >
                    <View 
                      style={[
                        styles.skillChipDot,
                        { backgroundColor: PILLAR_COLORS[skill.pillar] || Colors.dark.textMuted },
                      ]} 
                    />
                    <Text 
                      style={[
                        styles.skillChipText,
                        selectedSkill?.id === skill.id && styles.skillChipTextSelected,
                      ]}
                    >
                      {skill.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                style={[styles.captureButton, !selectedSkill && styles.captureButtonDisabled]}
                onPress={handleStartCapture}
                disabled={!selectedSkill}
              >
                <LinearGradient
                  colors={selectedSkill 
                    ? [GlowColors.primary, GlowColors.dark]
                    : [Colors.dark.backgroundTertiary, Colors.dark.backgroundTertiary]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.captureButtonGradient}
                >
                  <Ionicons name="videocam" size={20} color={selectedSkill ? Colors.dark.buttonText : Colors.dark.textMuted} />
                  <Text style={[styles.captureButtonText, !selectedSkill && styles.captureButtonTextDisabled]}>
                    Start Recording
                  </Text>
                </LinearGradient>
              </Pressable>
            </LinearGradient>
          </View>

          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>My Evidence</Text>
            
            {loadingEvidence ? (
              <ActivityIndicator color={Colors.dark.primary} style={styles.loader} />
            ) : evidence.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="film-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyText}>No evidence recorded yet</Text>
                <Text style={styles.emptySubtext}>
                  Select a skill above and record your first video!
                </Text>
              </View>
            ) : (
              evidence.map(renderEvidenceCard)
            )}
          </View>
        </ScrollView>
      </View>

      <VideoPlayerModal
        visible={!!selectedVideo}
        videoUrl={selectedVideo?.evidence.videoUrl || ""}
        title={selectedVideo?.skill?.name || "Skill Evidence"}
        onClose={() => setSelectedVideo(null)}
      />
    </LockedScreen>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.heading3,
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  captureSection: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  captureSectionGradient: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  captureSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  captureSectionTitle: {
    ...Typography.heading4,
    color: Colors.dark.text,
  },
  captureSectionDesc: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  skillSelector: {
    marginBottom: Spacing.md,
  },
  skillSelectorContent: {
    gap: Spacing.sm,
  },
  skillChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
  },
  skillChipSelected: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  skillChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.xs,
  },
  skillChipText: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
  },
  skillChipTextSelected: {
    color: Colors.dark.primary,
  },
  captureButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  captureButtonText: {
    ...Typography.buttonMedium,
    color: Colors.dark.buttonText,
  },
  captureButtonTextDisabled: {
    color: Colors.dark.textMuted,
  },
  historySection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.heading4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  evidenceCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    flexDirection: "row",
    overflow: "hidden",
  },
  videoPreviewContainer: {
    width: 80,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlayOverlay: {
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceContent: {
    flex: 1,
    padding: Spacing.md,
  },
  evidenceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  pillarBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  pillarText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  skillName: {
    ...Typography.bodyLarge,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  evidenceFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  captureInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  captureType: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    textTransform: "capitalize",
  },
  dateText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  reviewNotesContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  reviewNotesLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginBottom: 2,
  },
  reviewNotes: {
    ...Typography.bodySmall,
    color: Colors.dark.text,
    fontStyle: "italic",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    ...Typography.bodyLarge,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.bodySmall,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  loader: {
    marginVertical: Spacing.xl,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  cameraHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 22,
  },
  cameraTitle: {
    ...Typography.bodyLarge,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  flipButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 22,
  },
  cameraInstructions: {
    alignItems: "center",
    padding: Spacing.lg,
  },
  instructionText: {
    ...Typography.body,
    color: Colors.dark.text,
    textAlign: "center",
  },
  timerText: {
    ...Typography.heading3,
    color: Colors.dark.primary,
    marginTop: Spacing.sm,
  },
  cameraControls: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: Colors.dark.text,
    alignItems: "center",
    justifyContent: "center",
  },
  recordIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.error,
  },
  stopButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
  },
  stopIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: Colors.dark.error,
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  permissionTitle: {
    ...Typography.heading3,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  permissionText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  permissionButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  permissionButtonText: {
    ...Typography.buttonMedium,
    color: Colors.dark.buttonText,
  },
}));
