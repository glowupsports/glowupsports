import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

const ROLE_OPTIONS = [
  { id: "owner", label: "Owner" },
  { id: "director", label: "Director" },
  { id: "founder", label: "Founder" },
];

const YEARS_OPTIONS = [
  { id: "0-5", label: "0-5 years" },
  { id: "6-10", label: "6-10 years" },
  { id: "10-20", label: "10-20 years" },
  { id: "20+", label: "20+ years" },
];

const BACKGROUND_OPTIONS = [
  { id: "former_player", label: "Former Player", icon: "tennisball-outline" },
  { id: "coach", label: "Coach", icon: "people-outline" },
  { id: "business", label: "Business Background", icon: "briefcase-outline" },
  { id: "parent", label: "Tennis Parent", icon: "heart-outline" },
  { id: "mixed", label: "Mixed Background", icon: "layers-outline" },
];

const VISION_OPTIONS = [
  { id: "player_development", label: "Player Development", icon: "trending-up-outline" },
  { id: "long_term_growth", label: "Long-term Growth", icon: "leaf-outline" },
  { id: "fun_confidence", label: "Fun & Confidence", icon: "happy-outline" },
  { id: "performance_pathway", label: "Performance Pathway", icon: "trophy-outline" },
  { id: "community", label: "Community", icon: "people-outline" },
];

const FOCUS_OPTIONS = [
  { id: "recreational", label: "Recreational" },
  { id: "performance", label: "Performance" },
  { id: "mixed", label: "Mixed" },
];

interface OwnerProfile {
  ownerName: string;
  role: string;
  yearsInSports: string | null;
  backgroundTags: string[];
  visionTags: string[];
  academyFocus: string | null;
  internalNote: string;
  publicMessage: string;
  approved: boolean;
}

function SelectableCard({ 
  selected, 
  onPress, 
  label, 
  icon,
  disabled,
}: { 
  selected: boolean; 
  onPress: () => void; 
  label: string;
  icon?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.selectableCard,
        selected ? styles.selectableCardActive : null,
        disabled ? styles.selectableCardDisabled : null,
      ]}
      onPress={() => {
        if (!disabled) {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          onPress();
        }
      }}
    >
      {icon ? (
        <Ionicons
          name={icon as any}
          size={20}
          color={selected ? Colors.dark.gold : Colors.dark.textMuted}
          style={styles.cardIcon}
        />
      ) : null}
      <Text style={[styles.cardLabel, selected ? styles.cardLabelActive : null]}>
        {label}
      </Text>
      {selected ? (
        <Ionicons name="checkmark-circle" size={18} color={Colors.dark.gold} />
      ) : null}
    </Pressable>
  );
}

export default function OwnerProfileScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [profile, setProfile] = useState<OwnerProfile>({
    ownerName: "",
    role: "owner",
    yearsInSports: null,
    backgroundTags: [],
    visionTags: [],
    academyFocus: null,
    internalNote: "",
    publicMessage: "",
    approved: false,
  });

  const { data: existingProfile, isLoading } = useQuery<{ profile: OwnerProfile | null }>({
    queryKey: ["/api/owner/profile"],
  });

  useEffect(() => {
    if (existingProfile?.profile) {
      setProfile({
        ownerName: existingProfile.profile.ownerName || "",
        role: existingProfile.profile.role || "owner",
        yearsInSports: existingProfile.profile.yearsInSports || null,
        backgroundTags: existingProfile.profile.backgroundTags || [],
        visionTags: existingProfile.profile.visionTags || [],
        academyFocus: existingProfile.profile.academyFocus || null,
        internalNote: existingProfile.profile.internalNote || "",
        publicMessage: existingProfile.profile.publicMessage || "",
        approved: existingProfile.profile.approved || false,
      });
    }
  }, [existingProfile]);

  const saveMutation = useMutation({
    mutationFn: async (data: OwnerProfile) => {
      return apiRequest("POST", "/api/owner/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/profile"] });
      if (Platform.OS === "web") {
        window.alert("Profile saved! It will be reviewed by the platform team.");
      } else {
        Alert.alert("Profile Saved", "Your profile has been submitted for review.");
      }
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to save profile";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
    },
  });

  const toggleBackground = (id: string) => {
    setProfile((prev) => ({
      ...prev,
      backgroundTags: prev.backgroundTags.includes(id)
        ? prev.backgroundTags.filter((t) => t !== id)
        : [...prev.backgroundTags, id],
    }));
  };

  const toggleVision = (id: string) => {
    const currentTags = profile.visionTags;
    if (currentTags.includes(id)) {
      setProfile((prev) => ({
        ...prev,
        visionTags: prev.visionTags.filter((t) => t !== id),
      }));
    } else if (currentTags.length < 3) {
      setProfile((prev) => ({
        ...prev,
        visionTags: [...prev.visionTags, id],
      }));
    }
  };

  const handleSave = () => {
    if (!profile.ownerName.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter your name");
      } else {
        Alert.alert("Required", "Please enter your name");
      }
      return;
    }
    if (profile.visionTags.length === 0) {
      if (Platform.OS === "web") {
        window.alert("Please select at least one vision tag");
      } else {
        Alert.alert("Required", "Please select at least one vision tag");
      }
      return;
    }
    saveMutation.mutate(profile);
  };

  const canSave = profile.ownerName.trim() && profile.visionTags.length > 0;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.gold} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255, 215, 0, 0.1)", "transparent"]}
        style={styles.headerGradient}
      />
      
      <View style={styles.header}>
        <Text style={styles.title}>Owner Profile</Text>
        <Text style={styles.subtitle}>
          Build trust with parents and players by sharing your vision
        </Text>
        {profile.approved ? (
          <View style={styles.approvedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.dark.primary} />
            <Text style={styles.approvedText}>Approved</Text>
          </View>
        ) : existingProfile?.profile ? (
          <View style={styles.pendingBadge}>
            <Ionicons name="time-outline" size={16} color={Colors.dark.accentWarning} />
            <Text style={styles.pendingText}>Pending Review</Text>
          </View>
        ) : null}
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Name</Text>
          <TextInput
            style={styles.textInput}
            value={profile.ownerName}
            onChangeText={(text) => setProfile((prev) => ({ ...prev, ownerName: text }))}
            placeholder="Enter your name"
            placeholderTextColor={Colors.dark.textMuted}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Role</Text>
          <View style={styles.optionsRow}>
            {ROLE_OPTIONS.map((option) => (
              <SelectableCard
                key={option.id}
                selected={profile.role === option.id}
                onPress={() => setProfile((prev) => ({ ...prev, role: option.id }))}
                label={option.label}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Years in Tennis / Sports</Text>
          <View style={styles.optionsRow}>
            {YEARS_OPTIONS.map((option) => (
              <SelectableCard
                key={option.id}
                selected={profile.yearsInSports === option.id}
                onPress={() => setProfile((prev) => ({ ...prev, yearsInSports: option.id }))}
                label={option.label}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Background</Text>
          <Text style={styles.sectionHint}>Select all that apply</Text>
          <View style={styles.optionsGrid}>
            {BACKGROUND_OPTIONS.map((option) => (
              <SelectableCard
                key={option.id}
                selected={profile.backgroundTags.includes(option.id)}
                onPress={() => toggleBackground(option.id)}
                label={option.label}
                icon={option.icon}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Academy Vision</Text>
          <Text style={styles.sectionHint}>Select up to 3 that define your academy</Text>
          <View style={styles.optionsGrid}>
            {VISION_OPTIONS.map((option) => (
              <SelectableCard
                key={option.id}
                selected={profile.visionTags.includes(option.id)}
                onPress={() => toggleVision(option.id)}
                label={option.label}
                icon={option.icon}
                disabled={!profile.visionTags.includes(option.id) && profile.visionTags.length >= 3}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Academy Focus</Text>
          <View style={styles.optionsRow}>
            {FOCUS_OPTIONS.map((option) => (
              <SelectableCard
                key={option.id}
                selected={profile.academyFocus === option.id}
                onPress={() => setProfile((prev) => ({ ...prev, academyFocus: option.id }))}
                label={option.label}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Public Message</Text>
          <Text style={styles.sectionHint}>This will be visible to players and parents</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={profile.publicMessage}
            onChangeText={(text) => setProfile((prev) => ({ ...prev, publicMessage: text }))}
            placeholder="At our academy, we focus on..."
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            numberOfLines={3}
            maxLength={200}
          />
          <Text style={styles.charCount}>{profile.publicMessage.length}/200</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Internal Note</Text>
          <Text style={styles.sectionHint}>Only visible to platform admins</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={profile.internalNote}
            onChangeText={(text) => setProfile((prev) => ({ ...prev, internalNote: text }))}
            placeholder="What matters most in this academy?"
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            numberOfLines={2}
            maxLength={150}
          />
        </View>
      </KeyboardAwareScrollViewCompat>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          style={[styles.saveButton, !canSave ? styles.saveButtonDisabled : null]}
          onPress={handleSave}
          disabled={!canSave || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.dark.buttonText} />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color={Colors.dark.buttonText} />
              <Text style={styles.saveButtonText}>Save Profile</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  header: {
    padding: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  approvedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    backgroundColor: "rgba(46, 204, 64, 0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    alignSelf: "flex-start",
  },
  approvedText: {
    ...Typography.small,
    color: Colors.dark.primary,
  },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    backgroundColor: "rgba(255, 165, 0, 0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    alignSelf: "flex-start",
  },
  pendingText: {
    ...Typography.small,
    color: Colors.dark.accentWarning,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  sectionHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  textInput: {
    ...CardStyles.elevated,
    ...Typography.body,
    color: Colors.dark.text,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  charCount: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  selectableCard: {
    ...CardStyles.elevated,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  selectableCardActive: {
    borderColor: Colors.dark.gold,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
  },
  selectableCardDisabled: {
    opacity: 0.5,
  },
  cardIcon: {
    marginRight: 0,
  },
  cardLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  cardLabelActive: {
    color: Colors.dark.gold,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.gold,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
});
