import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

const XP_OPTIONS = [10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500];

interface XPMultiplier {
  id: string;
  source: string;
  baseXp: number;
  description: string;
}

export default function XPMultipliersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

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
  const [showPicker, setShowPicker] = useState(false);
  const [selectedMultiplier, setSelectedMultiplier] = useState<string | null>(null);

  const handleOpenPicker = (id: string) => {
    setSelectedMultiplier(id);
    setShowPicker(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSelectValue = (value: number) => {
    if (selectedMultiplier) {
      setMultipliers(prev => prev.map(m => m.id === selectedMultiplier ? { ...m, baseXp: value } : m));
      setHasChanges(true);
    }
    setShowPicker(false);
    setSelectedMultiplier(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const currentMultiplier = multipliers.find(m => m.id === selectedMultiplier);

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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Configure base XP values for different actions</Text>

        <View style={[styles.card, CardStyles.elevated]}>
          {multipliers.map((multiplier) => (
            <Pressable 
              key={multiplier.id} 
              style={styles.row}
              onPress={() => handleOpenPicker(multiplier.id)}
            >
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>{multiplier.source}</Text>
                <Text style={styles.rowDescription}>{multiplier.description}</Text>
              </View>
              <View style={styles.valueContainer}>
                <Text style={styles.valueText}>{multiplier.baseXp}</Text>
                <Text style={styles.valueSuffix}>XP</Text>
                <Ionicons name="chevron-down" size={16} color={Colors.dark.textMuted} />
              </View>
            </Pressable>
          ))}
        </View>

        {hasChanges ? (
          <Pressable style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select XP Value</Text>
              {currentMultiplier ? (
                <Text style={styles.modalSubtitle}>{currentMultiplier.source}</Text>
              ) : null}
            </View>
            <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
              {XP_OPTIONS.map((value) => (
                <Pressable
                  key={value}
                  style={[
                    styles.optionItem,
                    currentMultiplier?.baseXp === value && styles.optionItemSelected,
                  ]}
                  onPress={() => handleSelectValue(value)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      currentMultiplier?.baseXp === value && styles.optionTextSelected,
                    ]}
                  >
                    {value} XP
                  </Text>
                  {currentMultiplier?.baseXp === value ? (
                    <Ionicons name="checkmark" size={20} color={PLATFORM_COLOR} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  valueContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  valueText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  valueSuffix: {
    ...Typography.small,
    color: Colors.dark.textMuted,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    maxHeight: "70%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  modalHeader: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
    alignItems: "center",
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  modalSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  optionsList: {
    maxHeight: 400,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  optionItemSelected: {
    backgroundColor: PLATFORM_COLOR + "20",
  },
  optionText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  optionTextSelected: {
    color: PLATFORM_COLOR,
    fontWeight: "600",
  },
});
