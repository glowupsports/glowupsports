import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, TextInput, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";
import { useAppMode } from "@/context/AppModeContext";
import { AVATAR_PRESETS } from "@/constants/playerData";
import * as Haptics from "expo-haptics";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { player, updateProfile, resetData } = usePlayer();
  const { setMode } = useAppMode();
  const [name, setName] = useState(player.name);
  const [selectedAvatar, setSelectedAvatar] = useState(player.avatar);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setName(player.name);
    setSelectedAvatar(player.avatar);
  }, [player.name, player.avatar]);

  const handleAvatarSelect = (avatar: string) => {
    setSelectedAvatar(avatar);
    setHasChanges(true);
  };

  const handleNameChange = (text: string) => {
    setName(text);
    setHasChanges(true);
  };

  const handleSave = async () => {
    await updateProfile(name, selectedAvatar);
    setHasChanges(false);
    Alert.alert("Success", "Profile updated successfully!");
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Confirm Deletion",
              "All your progress will be lost forever. This is your final warning.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete Forever",
                  style: "destructive",
                  onPress: async () => {
                    await resetData();
                    Alert.alert("Account Deleted", "Your account has been deleted.");
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Avatar</ThemedText>
        <View style={styles.avatarGrid}>
          {AVATAR_PRESETS.map((avatar) => (
            <Pressable
              key={avatar}
              onPress={() => handleAvatarSelect(avatar)}
              style={[
                styles.avatarOption,
                selectedAvatar === avatar && styles.avatarSelected,
              ]}
            >
              <PlayerAvatar avatar={avatar} size={50} />
            </Pressable>
          ))}
        </View>
      </Card>

      {/* Switch to Coach App */}
      <Pressable
        style={styles.switchAppButton}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setMode("coach");
        }}
      >
        <View style={styles.switchAppContent}>
          <Ionicons name="swap-horizontal" size={24} color={Colors.dark.primary} />
          <View>
            <ThemedText style={styles.switchAppTitle}>Switch to Coach App</ThemedText>
            <ThemedText style={styles.switchAppDescription}>View as a coach</ThemedText>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
      </Pressable>

      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Display Name</ThemedText>
        <TextInput
          value={name}
          onChangeText={handleNameChange}
          style={styles.input}
          placeholderTextColor={Colors.dark.textMuted}
          placeholder="Enter your name"
        />
      </Card>

      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Preferences</ThemedText>
        <Pressable style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons name="notifications-outline" size={20} color={Colors.dark.text} />
            <ThemedText style={styles.settingText}>Notifications</ThemedText>
          </View>
          <Ionicons name="toggle-outline" size={24} color={Colors.dark.primary} />
        </Pressable>
        <Pressable style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons name="volume-high-outline" size={20} color={Colors.dark.text} />
            <ThemedText style={styles.settingText}>Sound Effects</ThemedText>
          </View>
          <Ionicons name="toggle-outline" size={24} color={Colors.dark.primary} />
        </Pressable>
        <Pressable style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons name="phone-portrait-outline" size={20} color={Colors.dark.text} />
            <ThemedText style={styles.settingText}>Haptic Feedback</ThemedText>
          </View>
          <Ionicons name="toggle-outline" size={24} color={Colors.dark.primary} />
        </Pressable>
      </Card>

      {hasChanges ? (
        <Button onPress={handleSave} style={styles.saveButton}>
          Save Changes
        </Button>
      ) : null}

      <Card style={[styles.section, styles.dangerSection]}>
        <ThemedText style={styles.sectionTitle}>Account</ThemedText>
        <Pressable
          onPress={handleDeleteAccount}
          style={styles.dangerButton}
        >
          <Ionicons name="trash-outline" size={20} color={Colors.dark.error} />
          <ThemedText style={styles.dangerText}>Delete Account</ThemedText>
        </Pressable>
      </Card>

      <View style={styles.footer}>
        <ThemedText style={styles.version}>Glow Up Tennis v1.0.0</ThemedText>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  section: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  avatarOption: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: "transparent",
  },
  avatarSelected: {
    borderColor: Colors.dark.primary,
  },
  switchAppButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  switchAppContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  switchAppTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  switchAppDescription: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    fontSize: 16,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  settingInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  settingText: {
    fontSize: 16,
    color: Colors.dark.text,
  },
  saveButton: {
    marginBottom: Spacing.lg,
  },
  dangerSection: {
    marginTop: Spacing.xl,
  },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  dangerText: {
    fontSize: 16,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  footer: {
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  version: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
});
