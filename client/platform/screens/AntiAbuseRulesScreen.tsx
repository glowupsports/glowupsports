import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Switch, Alert, Platform } from "react-native";
import KeyboardAwareScrollViewCompat from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

export default function AntiAbuseRulesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [dailyXpCap, setDailyXpCap] = useState("500");
  const [weeklyXpCap, setWeeklyXpCap] = useState("2000");
  const [patternDetection, setPatternDetection] = useState(true);
  const [rapidFireProtection, setRapidFireProtection] = useState(true);
  const [minSessionDuration, setMinSessionDuration] = useState("15");
  const [hasChanges, setHasChanges] = useState(false);

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHasChanges(false);
    if (Platform.OS === "web") {
      window.alert("Anti-abuse rules saved successfully!");
    } else {
      Alert.alert("Success", "Anti-abuse rules saved successfully!");
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

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Configure XP caps and abuse detection</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>XP Caps</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Daily XP Cap</Text>
                <Text style={styles.rowDescription}>Maximum XP a player can earn per day</Text>
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={dailyXpCap}
                  onChangeText={(v) => { setDailyXpCap(v); setHasChanges(true); }}
                  keyboardType="numeric"
                  placeholder="500"
                  placeholderTextColor={Colors.dark.textMuted}
                />
                <Text style={styles.inputSuffix}>XP</Text>
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Weekly XP Cap</Text>
                <Text style={styles.rowDescription}>Maximum XP a player can earn per week</Text>
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={weeklyXpCap}
                  onChangeText={(v) => { setWeeklyXpCap(v); setHasChanges(true); }}
                  keyboardType="numeric"
                  placeholder="2000"
                  placeholderTextColor={Colors.dark.textMuted}
                />
                <Text style={styles.inputSuffix}>XP</Text>
              </View>
            </View>
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
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Min Session Duration</Text>
                <Text style={styles.rowDescription}>Minimum session length to award XP</Text>
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={minSessionDuration}
                  onChangeText={(v) => { setMinSessionDuration(v); setHasChanges(true); }}
                  keyboardType="numeric"
                  placeholder="15"
                  placeholderTextColor={Colors.dark.textMuted}
                />
                <Text style={styles.inputSuffix}>min</Text>
              </View>
            </View>
          </View>
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
    marginTop: Spacing.md,
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
});
