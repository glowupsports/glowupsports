import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

type RouteParams = {
  CourtBookingConfirmation: {
    sessionId: string;
  };
};

interface SessionInfo {
  id: string;
  date: string;
  time: string;
  coachName: string;
  locationName?: string | null;
  courtLocation?: string | null;
}

interface BookingConfirmation {
  id?: string;
  status: "pending" | "confirmed" | "rejected";
  screenshotUrl?: string | null;
  rejectionNote?: string | null;
  confirmedAt?: string | null;
}

export default function CourtBookingConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RouteParams, "CourtBookingConfirmation">>();
  const { sessionId } = route.params;
  const queryClient = useQueryClient();

  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: sessionInfo, isLoading: loadingSession } = useQuery<SessionInfo>({
    queryKey: [`/api/player/me/session/${sessionId}/court-booking`],
  });

  const { data: confirmation, isLoading: loadingConfirmation } = useQuery<BookingConfirmation | null>({
    queryKey: [`/api/player/sessions/${sessionId}/court-booking-confirmation`],
  });

  const uploadMutation = useMutation({
    mutationFn: async (imageUri: string) => {
      setUploading(true);
      const authHeaders = await getAuthHeaders();
      const formData = new FormData();
      const fileName = `court-screenshot-${Date.now()}.jpg`;

      if (Platform.OS === "web") {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        formData.append("screenshot", blob, fileName);
      } else {
        formData.append("screenshot", {
          uri: imageUri,
          type: "image/jpeg",
          name: fileName,
        } as unknown as Blob);
      }

      const url = `${getApiUrl()}/api/player/sessions/${sessionId}/court-booking-confirmation`;
      const resp = await fetch(url, {
        method: "POST",
        headers: authHeaders as Record<string, string>,
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      return resp.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({
        queryKey: [`/api/player/sessions/${sessionId}/court-booking-confirmation`],
      });
      setLocalImageUri(null);
    },
    onError: (err: Error) => {
      Alert.alert("Upload Failed", err.message || "Please try again.");
    },
    onSettled: () => {
      setUploading(false);
    },
  });

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please allow access to your photo library to upload a screenshot."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setLocalImageUri(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please allow camera access to take a photo of your booking confirmation."
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setLocalImageUri(result.assets[0].uri);
    }
  };

  const handleChooseSource = () => {
    Alert.alert(
      "Upload Screenshot",
      "Choose how to add your court booking screenshot",
      [
        { text: "Camera", onPress: handleTakePhoto },
        { text: "Photo Library", onPress: handlePickImage },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const handleUpload = async () => {
    if (!localImageUri) return;
    uploadMutation.mutate(localImageUri);
  };

  const isLoading = loadingSession || loadingConfirmation;
  const isConfirmed = confirmation?.status === "confirmed";
  const isRejected = confirmation?.status === "rejected";
  const isPending = confirmation?.status === "pending";

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <TennisBallSpinner size="large" color={Colors.dark.successNeon} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Session Info */}
      <View style={styles.sessionCard}>
        <View style={styles.sessionRow}>
          <Ionicons name="calendar-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.sessionText}>
            {sessionInfo?.date ?? "—"} at {sessionInfo?.time ?? "—"}
          </Text>
        </View>
        {sessionInfo?.coachName ? (
          <View style={styles.sessionRow}>
            <Ionicons name="person-outline" size={16} color={Colors.dark.textMuted} />
            <Text style={styles.sessionText}>{sessionInfo.coachName}</Text>
          </View>
        ) : null}
        {sessionInfo?.courtLocation ? (
          <View style={styles.sessionRow}>
            <Ionicons name="location-outline" size={16} color={Colors.dark.accentCyan} />
            <Text style={[styles.sessionText, { color: Colors.dark.accentCyan }]}>
              {sessionInfo.courtLocation}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Status Banner */}
      {isConfirmed ? (
        <View style={[styles.statusBanner, styles.confirmedBanner]}>
          <Ionicons name="checkmark-circle" size={22} color={Colors.dark.successNeon} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: Colors.dark.successNeon }]}>
              Booking Confirmed
            </Text>
            <Text style={styles.statusSubtitle}>
              Your court booking screenshot has been received. See you on court!
            </Text>
          </View>
        </View>
      ) : isRejected ? (
        <View style={[styles.statusBanner, styles.rejectedBanner]}>
          <Ionicons name="close-circle" size={22} color={Colors.dark.error} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: Colors.dark.error }]}>
              Screenshot Rejected
            </Text>
            {confirmation?.rejectionNote ? (
              <Text style={styles.statusSubtitle}>{confirmation.rejectionNote}</Text>
            ) : (
              <Text style={styles.statusSubtitle}>
                Please upload a clear screenshot of your court booking.
              </Text>
            )}
          </View>
        </View>
      ) : isPending ? (
        <View style={[styles.statusBanner, styles.pendingBanner]}>
          <Ionicons name="time-outline" size={22} color={Colors.dark.accentWarning} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: Colors.dark.accentWarning }]}>
              Awaiting Review
            </Text>
            <Text style={styles.statusSubtitle}>
              Your screenshot has been uploaded and is pending coach review.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Existing screenshot */}
      {confirmation?.screenshotUrl && !localImageUri ? (
        <View style={styles.screenshotContainer}>
          <Text style={styles.sectionLabel}>Uploaded Screenshot</Text>
          <Image
            source={{ uri: confirmation.screenshotUrl }}
            style={styles.screenshotImage}
            resizeMode="contain"
          />
        </View>
      ) : null}

      {/* Instructions */}
      {!isConfirmed ? (
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>How to Confirm Your Booking</Text>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.stepText}>
              Book {sessionInfo?.courtLocation ?? "the required court"} through the
              venue&apos;s booking system or app.
            </Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={styles.stepText}>
              Take a screenshot of your booking confirmation.
            </Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <Text style={styles.stepText}>
              Upload the screenshot below to confirm your booking with your coach.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Upload area */}
      {!isConfirmed ? (
        <View style={styles.uploadSection}>
          <Text style={styles.sectionLabel}>
            {localImageUri
              ? "Screenshot Selected"
              : isRejected || isPending
              ? "Upload New Screenshot"
              : "Upload Your Booking Screenshot"}
          </Text>

          {localImageUri ? (
            <View style={styles.selectedImageContainer}>
              <Image
                source={{ uri: localImageUri }}
                style={styles.screenshotImage}
                resizeMode="contain"
              />
              <Pressable
                style={styles.removeImageBtn}
                onPress={() => setLocalImageUri(null)}
              >
                <Ionicons name="close-circle" size={24} color={Colors.dark.error} />
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.pickImageBtn} onPress={handleChooseSource}>
              <Ionicons name="image-outline" size={32} color={Colors.dark.textMuted} />
              <Text style={styles.pickImageText}>Upload Screenshot</Text>
            </Pressable>
          )}

          {localImageUri ? (
            <Pressable
              style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
              onPress={handleUpload}
              disabled={uploading || uploadMutation.isPending}
            >
              {uploading || uploadMutation.isPending ? (
                <TennisBallSpinner size="small" color="#000" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#000" />
                  <Text style={styles.uploadBtnText}>Submit Screenshot</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  content: {
    padding: Spacing.md,
    gap: 16,
  },
  sessionCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 8,
  },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sessionText: { fontSize: 14, color: Colors.dark.text },
  statusBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: BorderRadius.lg,
    padding: 14,
    borderWidth: 1,
  },
  confirmedBanner: {
    backgroundColor: "rgba(0, 255, 135, 0.08)",
    borderColor: "rgba(0, 255, 135, 0.3)",
  },
  rejectedBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  pendingBanner: {
    backgroundColor: "rgba(251, 191, 36, 0.08)",
    borderColor: "rgba(251, 191, 36, 0.3)",
  },
  statusTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  statusSubtitle: { fontSize: 13, color: Colors.dark.textMuted, lineHeight: 18 },
  instructionsCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 12,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dark.accentCyan + "30",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepNumberText: { fontSize: 12, fontWeight: "700", color: Colors.dark.accentCyan },
  stepText: { fontSize: 13, color: Colors.dark.textMuted, flex: 1, lineHeight: 18 },
  uploadSection: { gap: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  pickImageBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    borderStyle: "dashed",
    paddingVertical: 40,
  },
  pickImageText: { fontSize: 14, color: Colors.dark.textMuted },
  selectedImageContainer: { position: "relative" },
  screenshotContainer: { gap: 8 },
  screenshotImage: {
    width: "100%",
    height: 240,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  removeImageBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.dark.successNeon,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnText: { fontSize: 16, fontWeight: "700", color: "#000" },
});
