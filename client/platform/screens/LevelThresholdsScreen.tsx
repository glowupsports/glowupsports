import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert, Platform } from "react-native";
import KeyboardAwareScrollViewCompat from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography, CardStyles, getPlayerLevelColor } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

interface LevelThreshold {
  level: string;
  xpRequired: number;
  color: string;
}

export default function LevelThresholdsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [thresholds, setThresholds] = useState<LevelThreshold[]>([
    { level: "Red", xpRequired: 0, color: getPlayerLevelColor("red") },
    { level: "Orange", xpRequired: 500, color: getPlayerLevelColor("orange") },
    { level: "Green", xpRequired: 1500, color: getPlayerLevelColor("green") },
    { level: "Yellow", xpRequired: 3500, color: getPlayerLevelColor("yellow") },
    { level: "Glow", xpRequired: 7000, color: getPlayerLevelColor("glow") },
  ]);
  const [hasChanges, setHasChanges] = useState(false);

  const handleValueChange = (level: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setThresholds(prev => prev.map(t => t.level === level ? { ...t, xpRequired: numValue } : t));
    setHasChanges(true);
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHasChanges(false);
    if (Platform.OS === "web") {
      window.alert("Level thresholds saved successfully!");
    } else {
      Alert.alert("Success", "Level thresholds saved successfully!");
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Level Thresholds</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Configure XP required for each player level</Text>

        <View style={[styles.card, CardStyles.elevated]}>
          {thresholds.map((threshold, index) => (
            <View key={threshold.level} style={styles.row}>
              <View style={[styles.levelBadge, { backgroundColor: `${threshold.color}20` }]}>
                <View style={[styles.levelDot, { backgroundColor: threshold.color }]} />
                <Text style={[styles.levelText, { color: threshold.color }]}>{threshold.level}</Text>
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, index === 0 && styles.inputDisabled]}
                  value={String(threshold.xpRequired)}
                  onChangeText={(value) => handleValueChange(threshold.level, value)}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={Colors.dark.textMuted}
                  editable={index !== 0}
                />
                <Text style={styles.inputSuffix}>XP</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>
            Players start at Red level (0 XP). Each subsequent level requires more XP to achieve.
          </Text>
        </View>

        {hasChanges ? (
          <Pressable style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  topBarTitle: {
    ...Typography.h2,
    color: PLATFORM_COLOR,
    flex: 1,
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  levelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  levelText: {
    ...Typography.body,
    fontWeight: "600",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
  },
  input: {
    ...Typography.body,
    color: Colors.dark.text,
    width: 70,
    textAlign: "right",
    paddingVertical: Spacing.sm,
  },
  inputDisabled: {
    color: Colors.dark.textMuted,
  },
  inputSuffix: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginLeft: Spacing.xs,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  infoText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  saveButton: {
    backgroundColor: PLATFORM_COLOR,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
});
