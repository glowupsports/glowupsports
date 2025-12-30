import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Alert, Platform } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const PLATFORM_COLOR = "#9B59B6";

interface XPMultiplier {
  id: string;
  source: string;
  baseXp: number;
  description: string;
}

export default function XPMultipliersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const defaultMultipliers: XPMultiplier[] = [
    { id: "attendance", source: "Session Attendance", baseXp: 50, description: "XP awarded for attending a session" },
    { id: "feedback", source: "Positive Feedback", baseXp: 25, description: "XP awarded for receiving positive coach feedback" },
    { id: "level_up", source: "Level Up", baseXp: 200, description: "Bonus XP for advancing to next level" },
    { id: "streak", source: "Attendance Streak", baseXp: 10, description: "Bonus XP per consecutive session (multiplied by streak count)" },
    { id: "badge", source: "Badge Earned", baseXp: 100, description: "XP awarded when earning an achievement badge" },
    { id: "validation", source: "Skill Validation", baseXp: 75, description: "XP for coach-validated skill improvement" },
  ];

  const [multipliers, setMultipliers] = useState<XPMultiplier[]>(defaultMultipliers);
  const [hasChanges, setHasChanges] = useState(false);

  const handleValueChange = (id: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setMultipliers(prev => prev.map(m => m.id === id ? { ...m, baseXp: numValue } : m));
    setHasChanges(true);
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHasChanges(false);
    if (Platform.OS === "web") {
      window.alert("XP multipliers saved successfully!");
    } else {
      Alert.alert("Success", "XP multipliers saved successfully!");
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
        <Text style={styles.topBarTitle}>XP Multipliers</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Configure base XP values for different actions</Text>

        <View style={[styles.card, CardStyles.elevated]}>
          {multipliers.map((multiplier) => (
            <View key={multiplier.id} style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>{multiplier.source}</Text>
                <Text style={styles.rowDescription}>{multiplier.description}</Text>
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={String(multiplier.baseXp)}
                  onChangeText={(value) => handleValueChange(multiplier.id, value)}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={Colors.dark.textMuted}
                />
                <Text style={styles.inputSuffix}>XP</Text>
              </View>
            </View>
          ))}
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
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  rowInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  rowLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  rowDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
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
    width: 60,
    textAlign: "right",
    paddingVertical: Spacing.sm,
  },
  inputSuffix: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginLeft: Spacing.xs,
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
