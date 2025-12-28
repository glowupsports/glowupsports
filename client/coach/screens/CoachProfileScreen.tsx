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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
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
}

export default function CoachProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const { refreshAuth } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<CoachProfile>>({});

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
    });
    setIsEditing(true);
  };

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
        colors={[Colors.dark.backgroundRoot, "#0A0A0A"]}
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
      colors={[Colors.dark.backgroundRoot, "#0A0A0A"]}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.title}>Coach Profile</Text>
        {isEditing ? (
          <View style={styles.editActions}>
            <Pressable style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.saveButton}
              onPress={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.editButton} onPress={handleEdit}>
            <Ionicons name="pencil-outline" size={20} color={Colors.dark.primary} />
          </Pressable>
        )}
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={48} color={Colors.dark.primary} />
          </View>
          <Text style={styles.avatarName}>{profile?.name || "Coach"}</Text>
          {profile?.specialty ? (
            <Text style={styles.avatarSpecialty}>{profile.specialty}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Name</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Enter name"
                placeholderTextColor={Colors.dark.disabled}
              />
            ) : (
              <Text style={styles.fieldValue}>{profile?.name || "Not set"}</Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Email</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={formData.email || ""}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                placeholder="Enter email"
                placeholderTextColor={Colors.dark.disabled}
                keyboardType="email-address"
              />
            ) : (
              <Text style={styles.fieldValue}>{profile?.email || "Not set"}</Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Phone</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={formData.phone || ""}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                placeholder="Enter phone"
                placeholderTextColor={Colors.dark.disabled}
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={styles.fieldValue}>{profile?.phone || "Not set"}</Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Specialty</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={formData.specialty || ""}
                onChangeText={(text) => setFormData({ ...formData, specialty: text })}
                placeholder="e.g., Youth coaching, Advanced technique"
                placeholderTextColor={Colors.dark.disabled}
              />
            ) : (
              <Text style={styles.fieldValue}>{profile?.specialty || "Not set"}</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bio</Text>
          <View style={styles.field}>
            {isEditing ? (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.bio || ""}
                onChangeText={(text) => setFormData({ ...formData, bio: text })}
                placeholder="Tell us about yourself..."
                placeholderTextColor={Colors.dark.disabled}
                multiline
                numberOfLines={4}
              />
            ) : (
              <Text style={styles.fieldValue}>
                {profile?.bio || "No bio added yet"}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Session Defaults</Text>
          
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="time-outline" size={24} color={Colors.dark.primary} />
              <Text style={styles.statValue}>
                {profile?.defaultSessionDuration || 60} min
              </Text>
              <Text style={styles.statLabel}>Default Duration</Text>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="car-outline" size={24} color={Colors.dark.orange} />
              <Text style={styles.statValue}>
                {profile?.defaultTravelTime || 0} min
              </Text>
              <Text style={styles.statLabel}>Travel Time</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="sunny-outline" size={24} color="#00D4FF" />
              <Text style={styles.statValue}>
                {profile?.workingHoursStart || "08:00"}
              </Text>
              <Text style={styles.statLabel}>Start Time</Text>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="moon-outline" size={24} color={Colors.dark.tabIconDefault} />
              <Text style={styles.statValue}>
                {profile?.workingHoursEnd || "20:00"}
              </Text>
              <Text style={styles.statLabel}>End Time</Text>
            </View>
          </View>

          {profile?.hourlyRate ? (
            <View style={styles.rateCard}>
              <Ionicons name="cash-outline" size={24} color={Colors.dark.primary} />
              <View>
                <Text style={styles.rateValue}>${profile.hourlyRate}/hr</Text>
                <Text style={styles.rateLabel}>Hourly Rate</Text>
              </View>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  title: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  editButton: {
    padding: Spacing.sm,
  },
  editActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  cancelButton: {
    padding: Spacing.sm,
  },
  cancelText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  saveButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  saveText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: "#FFF",
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
  avatarSection: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarName: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  avatarSpecialty: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.primary,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  field: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  fieldLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  statValue: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  rateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
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
  },
});
