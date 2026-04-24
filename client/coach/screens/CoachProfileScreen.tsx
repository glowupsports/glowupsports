import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
  Image as RNImage,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Sentry from "@sentry/react-native";
import { Image } from "expo-image";
import { appendImageToFormData, isUploadClientError, type UploadClientError } from "@/lib/uploads";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useCoach } from "@/coach/context/CoachContext";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface CoachProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  bio: string | null;
  hourlyRate: string | null;
  defaultTravelTime: number | null;
  defaultSessionDuration: number | null;
  workingHoursStart: string | null;
  workingHoursEnd: string | null;
  photoUrl: string | null;
  // Public profile (Task #1037)
  publicProfileEnabled?: boolean | null;
  publicQuote?: string | null;
  languages?: string[] | null;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function StatBadge({
  icon,
  value,
  label,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <LinearGradient
        colors={["rgba(255, 255, 255, 0.02)", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.fieldGradient}
      >
        <View style={styles.statCardInner}>
          <View style={[styles.statIconBadge, { backgroundColor: color + "20" }]}>
            <Ionicons name={icon} size={22} color={color} />
          </View>
          <Text style={styles.statValue}>{value}</Text>
          <Text style={styles.statLabel}>{label}</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

export default function CoachProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const { refreshAuth } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<CoachProfile>>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const saveScale = useSharedValue(1);

  const saveAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: saveScale.value }],
  }));

  const handleSavePress = () => {
    saveScale.value = withSpring(0.95, { damping: 15 });
    setTimeout(() => {
      saveScale.value = withSpring(1, { damping: 15 });
      handleSave();
    }, 100);
  };

  const handleChangePhoto = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission Required", "Please allow access to your photo library to change your profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      setIsUploadingPhoto(true);
      const asset = result.assets[0];

      const uploadFormData = new FormData();
      await appendImageToFormData(uploadFormData, "photo", asset.uri);

      const token = getAuthToken();
      
      const response = await fetch(`${getApiUrl()}/api/coach/profile/photo`, {
        method: "POST",
        body: uploadFormData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        const { parseUploadErrorResponse } = await import("@/lib/uploads");
        const { message, code } = await parseUploadErrorResponse(
          response,
          "Failed to upload photo. Please try again.",
        );
        const err: UploadClientError = Object.assign(new Error(message), {
          code,
          status: response.status,
        });
        throw err;
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/coach/profile"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      await refreshAuth();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Profile photo updated!");
    } catch (error) {
      console.error("Error uploading photo:", error);
      const uploadErr = isUploadClientError(error) ? error : null;
      Sentry.captureException(error, {
        tags: { area: "coach_profile_photo_upload" },
        extra: {
          message: error instanceof Error ? error.message : String(error),
          code: uploadErr?.code,
          status: uploadErr?.status,
        },
      });
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to upload photo. Please try again.";
      Alert.alert("Upload failed", message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const { data: profile, isLoading } = useQuery<CoachProfile>({
    queryKey: ["/api/coach/profile", coach?.id],
    enabled: !!coach?.id,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { coachId: string; updates: Partial<CoachProfile> }) =>
      apiRequest("PATCH", `/api/coach/profile/${data.coachId}`, data.updates),
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coaches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      await refreshAuth();
      setIsEditing(false);
      Alert.alert("Saved", "Profile updated successfully");
    },
    onError: (error: Error) => {
      console.error("Profile update error:", error);
      Alert.alert("Error", error.message || "Failed to update profile");
    },
  });

  const handleEdit = () => {
    setFormData({
      name: profile?.name || "",
      email: profile?.email || "",
      phone: profile?.phone || "",
      specialty: profile?.specialty || "",
      bio: profile?.bio || "",
      hourlyRate: profile?.hourlyRate || "",
      publicProfileEnabled: profile?.publicProfileEnabled !== false,
      publicQuote: profile?.publicQuote || "",
      languages: profile?.languages || [],
    });
    setIsEditing(true);
  };

  // Quick-toggle the public discoverability switch (Task #1037 — privacy control).
  // Persists immediately so the coach doesn't have to enter "edit mode" just to opt out.
  const togglePublicMutation = useMutation({
    mutationFn: async (enabled: boolean) =>
      apiRequest("PATCH", "/api/coach/me/public-profile", { publicProfileEnabled: enabled }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/profile"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to update visibility");
    },
  });

  const handleSave = () => {
    if (!coach?.id) {
      Alert.alert("Error", "Coach profile not loaded");
      return;
    }
    updateMutation.mutate({ coachId: coach.id, updates: formData });
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({});
  };

  if (isLoading) {
    return (
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerGradientLine}
        />
        <View style={styles.headerContent}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.title}>COACH PROFILE</Text>
          {isEditing ? (
            <View style={styles.editActions}>
              <Pressable style={styles.cancelButton} onPress={handleCancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <AnimatedPressable
                style={saveAnimatedStyle}
                onPress={handleSavePress}
                disabled={updateMutation.isPending}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.saveButton}
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                  ) : (
                    <Text style={styles.saveText}>Save</Text>
                  )}
                </LinearGradient>
              </AnimatedPressable>
            </View>
          ) : (
            <Pressable style={styles.editButton} onPress={handleEdit}>
              <View style={styles.editButtonInner}>
                <Ionicons name="pencil-outline" size={18} color={Colors.dark.xpCyan} />
              </View>
            </Pressable>
          )}
        </View>
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <LinearGradient
            colors={[Colors.dark.primary + "30", Colors.dark.xpCyan + "20"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.profileCardGradient}
          >
            <View style={styles.avatarSection}>
              <Pressable 
                style={styles.avatarContainer} 
                onPress={handleChangePhoto}
                disabled={isUploadingPhoto}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarBorder}
                >
                  {profile?.photoUrl ? (
                    Platform.OS === 'web' ? (
                      <RNImage
                        source={{ uri: profile.photoUrl.startsWith('data:') ? profile.photoUrl : `${getApiUrl()}${profile.photoUrl}` }}
                        style={styles.avatarImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Image
                        source={{ uri: profile.photoUrl.startsWith('data:') ? profile.photoUrl : `${getApiUrl()}${profile.photoUrl}` }}
                        style={styles.avatarImage}
                        contentFit="cover"
                      />
                    )
                  ) : (
                    <View style={styles.avatar}>
                      <Ionicons name="person" size={48} color={Colors.dark.xpCyan} />
                    </View>
                  )}
                </LinearGradient>
                <View style={styles.cameraIconOverlay}>
                  {isUploadingPhoto ? (
                    <ActivityIndicator size="small" color={Colors.dark.text} />
                  ) : (
                    <Ionicons name="camera" size={16} color={Colors.dark.text} />
                  )}
                </View>
              </Pressable>
              <Text style={styles.avatarName}>{profile?.name || "Coach"}</Text>
              {profile?.specialty ? (
                <View style={styles.specialtyBadge}>
                  <Ionicons name="star" size={12} color={Colors.dark.gold} />
                  <Text style={styles.avatarSpecialty}>{profile.specialty}</Text>
                </View>
              ) : null}
            </View>
          </LinearGradient>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PERSONAL INFORMATION</Text>
          
          <View style={styles.field}>
            <LinearGradient
              colors={["rgba(255, 255, 255, 0.02)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.fieldGradient}
            >
              <View style={styles.fieldInner}>
                <Text style={styles.fieldLabel}>Name</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                    placeholder="Enter name"
                    placeholderTextColor={Colors.dark.textMuted}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{profile?.name || "Not set"}</Text>
                )}
              </View>
            </LinearGradient>
          </View>

          <View style={styles.field}>
            <LinearGradient
              colors={["rgba(255, 255, 255, 0.02)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.fieldGradient}
            >
              <View style={styles.fieldInner}>
                <Text style={styles.fieldLabel}>Email</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.email || ""}
                    onChangeText={(text) => setFormData({ ...formData, email: text })}
                    placeholder="Enter email"
                    placeholderTextColor={Colors.dark.textMuted}
                    keyboardType="email-address"
                  />
                ) : (
                  <Text style={styles.fieldValue}>{profile?.email || "Not set"}</Text>
                )}
              </View>
            </LinearGradient>
          </View>

          <View style={styles.field}>
            <LinearGradient
              colors={["rgba(255, 255, 255, 0.02)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.fieldGradient}
            >
              <View style={styles.fieldInner}>
                <Text style={styles.fieldLabel}>Phone</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.phone || ""}
                    onChangeText={(text) => setFormData({ ...formData, phone: text })}
                    placeholder="Enter phone"
                    placeholderTextColor={Colors.dark.textMuted}
                    keyboardType="phone-pad"
                  />
                ) : (
                  <Text style={styles.fieldValue}>{profile?.phone || "Not set"}</Text>
                )}
              </View>
            </LinearGradient>
          </View>

          <View style={styles.field}>
            <LinearGradient
              colors={["rgba(255, 255, 255, 0.02)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.fieldGradient}
            >
              <View style={styles.fieldInner}>
                <Text style={styles.fieldLabel}>Specialty</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.specialty || ""}
                    onChangeText={(text) => setFormData({ ...formData, specialty: text })}
                    placeholder="e.g., Youth coaching, Advanced technique"
                    placeholderTextColor={Colors.dark.textMuted}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{profile?.specialty || "Not set"}</Text>
                )}
              </View>
            </LinearGradient>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BIO</Text>
          <View style={styles.field}>
            <LinearGradient
              colors={["rgba(255, 255, 255, 0.02)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.fieldGradient}
            >
              <View style={styles.fieldInner}>
                {isEditing ? (
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={formData.bio || ""}
                    onChangeText={(text) => setFormData({ ...formData, bio: text })}
                    placeholder="Tell us about yourself..."
                    placeholderTextColor={Colors.dark.textMuted}
                    multiline
                    numberOfLines={4}
                  />
                ) : (
                  <Text style={styles.fieldValue}>
                    {profile?.bio || "No bio added yet"}
                  </Text>
                )}
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* Public Profile (Task #1037) — controls public discoverability and bio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PUBLIC PROFILE</Text>

          {/* Task #1112: when the coach is opted-in publicly but has nothing
              to show (no photo, no quote, no specialty) explain why they
              aren't appearing in the public coach rail. */}
          {(() => {
            const enabled = isEditing
              ? formData.publicProfileEnabled !== false
              : profile?.publicProfileEnabled !== false;
            // Photo isn't part of the edit form (uploaded separately) so the
            // saved profile is always the source of truth here.
            const photo = profile?.photoUrl;
            const quote = isEditing ? formData.publicQuote : profile?.publicQuote;
            const specialty = isEditing ? formData.specialty : profile?.specialty;
            const meetsGate =
              !!(photo && photo.trim()) ||
              !!(quote && quote.trim()) ||
              !!(specialty && specialty.trim());
            if (!enabled || meetsGate) return null;
            return (
              <View style={styles.hintBanner}>
                <Ionicons
                  name="alert-circle-outline"
                  size={20}
                  color={Colors.dark.gold}
                  style={{ marginTop: 1 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.hintTitle}>Complete your public profile</Text>
                  <Text style={styles.hintBody}>
                    You're opted-in, but players won't see you in the public coach rail until you add a photo, a public quote, or a specialty.
                  </Text>
                </View>
              </View>
            );
          })()}

          <View style={styles.field}>
            <LinearGradient
              colors={["rgba(255, 255, 255, 0.02)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.fieldGradient}
            >
              <View style={[styles.fieldInner, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
                <View style={{ flex: 1, paddingRight: Spacing.md }}>
                  <Text style={styles.fieldLabel}>Discoverable worldwide</Text>
                  <Text style={[styles.fieldValue, { fontSize: 12, color: Colors.dark.textMuted, marginTop: 4 }]}>
                    Players can find you in the public coach directory and book drop-in lessons.
                  </Text>
                </View>
                <Switch
                  value={
                    isEditing
                      ? formData.publicProfileEnabled !== false
                      : profile?.publicProfileEnabled !== false
                  }
                  onValueChange={(v) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (isEditing) {
                      setFormData({ ...formData, publicProfileEnabled: v });
                    } else {
                      togglePublicMutation.mutate(v);
                    }
                  }}
                  trackColor={{ false: Colors.dark.backgroundRoot, true: Colors.dark.xpCyan }}
                  thumbColor={Colors.dark.text}
                />
              </View>
            </LinearGradient>
          </View>

          {/* Task #1110: lets coaches preview their listing as players see it
              before deciding to stay discoverable. */}
          <Pressable
            style={styles.previewButton}
            disabled={!coach?.id}
            onPress={() => {
              if (!coach?.id) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("CoachPublicPreview" as never, { coachId: coach.id, previewMode: true } as never);
            }}
          >
            <Ionicons name="eye-outline" size={18} color={Colors.dark.xpCyan} />
            <Text style={styles.previewButtonText}>Preview my public profile</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
          </Pressable>

          <View style={styles.field}>
            <LinearGradient
              colors={["rgba(255, 255, 255, 0.02)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.fieldGradient}
            >
              <View style={styles.fieldInner}>
                <Text style={styles.fieldLabel}>Public quote (one-liner)</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.publicQuote || ""}
                    onChangeText={(text) => setFormData({ ...formData, publicQuote: text })}
                    placeholder="e.g., I help juniors fall in love with the game"
                    placeholderTextColor={Colors.dark.textMuted}
                    maxLength={120}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{profile?.publicQuote || "Not set"}</Text>
                )}
              </View>
            </LinearGradient>
          </View>

          <View style={styles.field}>
            <LinearGradient
              colors={["rgba(255, 255, 255, 0.02)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.fieldGradient}
            >
              <View style={styles.fieldInner}>
                <Text style={styles.fieldLabel}>Languages (comma-separated)</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={(formData.languages || []).join(", ")}
                    onChangeText={(text) =>
                      setFormData({
                        ...formData,
                        languages: text
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="English, Dutch, Spanish"
                    placeholderTextColor={Colors.dark.textMuted}
                    autoCapitalize="words"
                  />
                ) : (
                  <Text style={styles.fieldValue}>
                    {(profile?.languages && profile.languages.length > 0)
                      ? profile.languages.join(", ")
                      : "Not set"}
                  </Text>
                )}
              </View>
            </LinearGradient>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SESSION DEFAULTS</Text>
          
          <View style={styles.statsRow}>
            <StatBadge
              icon="time-outline"
              value={`${profile?.defaultSessionDuration || 60} min`}
              label="Duration"
              color={Colors.dark.xpCyan}
            />
            <StatBadge
              icon="car-outline"
              value={`${profile?.defaultTravelTime || 0} min`}
              label="Travel"
              color={Colors.dark.orange}
            />
          </View>

          <View style={styles.statsRow}>
            <StatBadge
              icon="sunny-outline"
              value={profile?.workingHoursStart || "08:00"}
              label="Start"
              color={Colors.dark.gold}
            />
            <StatBadge
              icon="moon-outline"
              value={profile?.workingHoursEnd || "20:00"}
              label="End"
              color={Colors.dark.primary}
            />
          </View>

          {profile?.hourlyRate ? (
            <View style={styles.rateCard}>
              <LinearGradient
                colors={["rgba(255, 255, 255, 0.02)", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.fieldGradient}
              >
                <View style={styles.rateCardInner}>
                  <View style={[styles.statIconBadge, { backgroundColor: Colors.dark.gold + "20" }]}>
                    <Ionicons name="cash-outline" size={22} color={Colors.dark.gold} />
                  </View>
                  <View>
                    <Text style={styles.rateValue}>${profile.hourlyRate}/hr</Text>
                    <Text style={styles.rateLabel}>Hourly Rate</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          ) : null}
        </View>
      </KeyboardAwareScrollViewCompat>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: Spacing.sm,
  },
  headerGradientLine: {
    height: 3,
    width: "100%",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  editButton: {
    padding: Spacing.xs,
  },
  editButtonInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.xpCyan + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  editActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "center",
  },
  cancelButton: {
    padding: Spacing.sm,
  },
  cancelText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  saveButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  saveText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  profileCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    backgroundColor: Backgrounds.card,
  },
  profileCardGradient: {
    padding: Spacing.xl,
  },
  avatarSection: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  avatarContainer: {
    position: "relative",
  },
  avatarBorder: {
    padding: 3,
    borderRadius: 55,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  cameraIconOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.xpCyan,
  },
  avatarName: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  specialtyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  avatarSpecialty: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.gold,
    fontWeight: "500",
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.xs,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  field: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
    backgroundColor: Backgrounds.card,
  },
  fieldGradient: {
    flex: 1,
  },
  fieldInner: {
    backgroundColor: Backgrounds.card,
    padding: Spacing.md,
  },
  fieldLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  input: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    padding: 0,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
    backgroundColor: Backgrounds.card,
  },
  statCardInner: {
    backgroundColor: Backgrounds.card,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  statIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rateCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
    backgroundColor: Backgrounds.card,
  },
  rateCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Backgrounds.card,
    padding: Spacing.lg,
  },
  rateValue: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  rateLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  hintBanner: {
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "55",
    backgroundColor: Colors.dark.gold + "14",
  },
  hintTitle: {
    fontSize: Typography.small.fontSize,
    fontWeight: "700",
    color: Colors.dark.gold,
    marginBottom: 2,
  },
  hintBody: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.text,
    lineHeight: 18,
  },
  previewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
    backgroundColor: Colors.dark.xpCyan + "10",
  },
  previewButtonText: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});
