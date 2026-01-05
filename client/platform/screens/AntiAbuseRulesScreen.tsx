import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Modal, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

const DAILY_XP_OPTIONS = [100, 200, 300, 400, 500, 600, 750, 1000, 1500, 2000];
const WEEKLY_XP_OPTIONS = [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
const MIN_DURATION_OPTIONS = [5, 10, 15, 20, 25, 30, 45, 60];

type PickerType = "daily" | "weekly" | "duration" | null;

export default function AntiAbuseRulesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [dailyXpCap, setDailyXpCap] = useState(500);
  const [weeklyXpCap, setWeeklyXpCap] = useState(2000);
  const [patternDetection, setPatternDetection] = useState(true);
  const [rapidFireProtection, setRapidFireProtection] = useState(true);
  const [minSessionDuration, setMinSessionDuration] = useState(15);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPicker, setShowPicker] = useState<PickerType>(null);

  const handleOpenPicker = (type: PickerType) => {
    setShowPicker(type);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSelectValue = (value: number) => {
    if (showPicker === "daily") {
      setDailyXpCap(value);
    } else if (showPicker === "weekly") {
      setWeeklyXpCap(value);
    } else if (showPicker === "duration") {
      setMinSessionDuration(value);
    }
    setHasChanges(true);
    setShowPicker(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHasChanges(false);
    if (Platform.OS === "web") {
      window.alert("Anti-abuse rules saved successfully!");
    } else {
      Alert.alert("Success", "Anti-abuse rules saved successfully!");
    }
  };

  const getPickerOptions = () => {
    switch (showPicker) {
      case "daily":
        return DAILY_XP_OPTIONS;
      case "weekly":
        return WEEKLY_XP_OPTIONS;
      case "duration":
        return MIN_DURATION_OPTIONS;
      default:
        return [];
    }
  };

  const getPickerTitle = () => {
    switch (showPicker) {
      case "daily":
        return "Daily XP Cap";
      case "weekly":
        return "Weekly XP Cap";
      case "duration":
        return "Min Session Duration";
      default:
        return "";
    }
  };

  const getPickerSuffix = () => {
    switch (showPicker) {
      case "daily":
      case "weekly":
        return "XP";
      case "duration":
        return "min";
      default:
        return "";
    }
  };

  const getCurrentValue = () => {
    switch (showPicker) {
      case "daily":
        return dailyXpCap;
      case "weekly":
        return weeklyXpCap;
      case "duration":
        return minSessionDuration;
      default:
        return 0;
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
        <Text style={styles.topBarTitle}>Anti-Abuse Rules</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Configure XP caps and abuse detection</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>XP Caps</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <Pressable style={styles.row} onPress={() => handleOpenPicker("daily")}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Daily XP Cap</Text>
                <Text style={styles.rowDescription}>Maximum XP a player can earn per day</Text>
              </View>
              <View style={styles.valueContainer}>
                <Text style={styles.valueText}>{dailyXpCap}</Text>
                <Text style={styles.valueSuffix}>XP</Text>
                <Ionicons name="chevron-down" size={16} color={Colors.dark.textMuted} />
              </View>
            </Pressable>
            <Pressable style={styles.row} onPress={() => handleOpenPicker("weekly")}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Weekly XP Cap</Text>
                <Text style={styles.rowDescription}>Maximum XP a player can earn per week</Text>
              </View>
              <View style={styles.valueContainer}>
                <Text style={styles.valueText}>{weeklyXpCap}</Text>
                <Text style={styles.valueSuffix}>XP</Text>
                <Ionicons name="chevron-down" size={16} color={Colors.dark.textMuted} />
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detection Settings</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Pattern Detection</Text>
                <Text style={styles.rowDescription}>Detect suspicious XP farming patterns</Text>
              </View>
              <Switch
                value={patternDetection}
                onValueChange={(v) => { setPatternDetection(v); setHasChanges(true); }}
                trackColor={{ false: Colors.dark.backgroundRoot, true: `${PLATFORM_COLOR}80` }}
                thumbColor={patternDetection ? PLATFORM_COLOR : Colors.dark.textMuted}
              />
            </View>
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Rapid Fire Protection</Text>
                <Text style={styles.rowDescription}>Block multiple XP awards in short time</Text>
              </View>
              <Switch
                value={rapidFireProtection}
                onValueChange={(v) => { setRapidFireProtection(v); setHasChanges(true); }}
                trackColor={{ false: Colors.dark.backgroundRoot, true: `${PLATFORM_COLOR}80` }}
                thumbColor={rapidFireProtection ? PLATFORM_COLOR : Colors.dark.textMuted}
              />
            </View>
            <Pressable style={styles.row} onPress={() => handleOpenPicker("duration")}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Min Session Duration</Text>
                <Text style={styles.rowDescription}>Minimum session length to award XP</Text>
              </View>
              <View style={styles.valueContainer}>
                <Text style={styles.valueText}>{minSessionDuration}</Text>
                <Text style={styles.valueSuffix}>min</Text>
                <Ionicons name="chevron-down" size={16} color={Colors.dark.textMuted} />
              </View>
            </Pressable>
          </View>
        </View>

        {hasChanges ? (
          <Pressable style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal
        visible={showPicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{getPickerTitle()}</Text>
            </View>
            <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
              {getPickerOptions().map((value) => (
                <Pressable
                  key={value}
                  style={[
                    styles.optionItem,
                    getCurrentValue() === value && styles.optionItemSelected,
                  ]}
                  onPress={() => handleSelectValue(value)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      getCurrentValue() === value && styles.optionTextSelected,
                    ]}
                  >
                    {value} {getPickerSuffix()}
                  </Text>
                  {getCurrentValue() === value ? (
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
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
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
    maxHeight: "60%",
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
  optionsList: {
    maxHeight: 350,
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
