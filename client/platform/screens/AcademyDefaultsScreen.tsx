import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert, Platform, ScrollView } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

export default function AcademyDefaultsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [defaultCurrency, setDefaultCurrency] = useState("AED");
  const [defaultTimezone, setDefaultTimezone] = useState("Asia/Dubai");
  const [defaultSessionDuration, setDefaultSessionDuration] = useState("60");
  const [defaultTrialDays, setDefaultTrialDays] = useState("14");
  const [hasChanges, setHasChanges] = useState(false);

  const currencies = ["AED", "USD", "EUR", "GBP", "SAR", "QAR", "KWD", "BHD", "OMR"];

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHasChanges(false);
    if (Platform.OS === "web") {
      window.alert("Academy defaults saved successfully!");
    } else {
      Alert.alert("Success", "Academy defaults saved successfully!");
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
        <Text style={styles.topBarTitle}>Academy Defaults</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Default settings for new academies</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Regional Settings</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <View style={styles.formRow}>
              <Text style={styles.label}>Default Currency</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyScroll}>
                {currencies.map((currency) => (
                  <Pressable
                    key={currency}
                    style={[
                      styles.currencyChip,
                      defaultCurrency === currency && styles.currencyChipActive
                    ]}
                    onPress={() => { setDefaultCurrency(currency); setHasChanges(true); }}
                  >
                    <Text style={[
                      styles.currencyText,
                      defaultCurrency === currency && styles.currencyTextActive
                    ]}>
                      {currency}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Default Timezone</Text>
              <TextInput
                style={styles.input}
                value={defaultTimezone}
                onChangeText={(v) => { setDefaultTimezone(v); setHasChanges(true); }}
                placeholder="Asia/Dubai"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Session Settings</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Default Session Duration</Text>
                <Text style={styles.rowDescription}>Standard session length for new academies</Text>
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.numberInput}
                  value={defaultSessionDuration}
                  onChangeText={(v) => { setDefaultSessionDuration(v); setHasChanges(true); }}
                  keyboardType="numeric"
                  placeholder="60"
                  placeholderTextColor={Colors.dark.textMuted}
                />
                <Text style={styles.inputSuffix}>min</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trial Settings</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Trial Period</Text>
                <Text style={styles.rowDescription}>Free trial duration for new academies</Text>
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.numberInput}
                  value={defaultTrialDays}
                  onChangeText={(v) => { setDefaultTrialDays(v); setHasChanges(true); }}
                  keyboardType="numeric"
                  placeholder="14"
                  placeholderTextColor={Colors.dark.textMuted}
                />
                <Text style={styles.inputSuffix}>days</Text>
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
    padding: Spacing.lg,
  },
  formRow: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  input: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  currencyScroll: {
    marginTop: Spacing.xs,
  },
  currencyChip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  currencyChipActive: {
    backgroundColor: PLATFORM_COLOR,
  },
  currencyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  currencyTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
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
  numberInput: {
    ...Typography.body,
    color: Colors.dark.text,
    width: 50,
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
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
});
