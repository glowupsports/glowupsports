import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert, Platform, ScrollView, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const PLATFORM_COLOR = "#9B59B6";

interface PlatformConfig {
  id?: number;
  key: string;
  value: string;
  description?: string;
  updatedAt?: string;
}

const CONFIG_KEYS = {
  DEFAULT_CURRENCY: "default_currency",
  DEFAULT_TIMEZONE: "default_timezone",
  DEFAULT_SESSION_DURATION: "default_session_duration",
  DEFAULT_TRIAL_DAYS: "default_trial_days",
};

const CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR", "QAR", "KWD", "BHD", "OMR"];

export default function AcademyDefaultsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const [localConfigs, setLocalConfigs] = useState<Record<string, string>>({
    [CONFIG_KEYS.DEFAULT_CURRENCY]: "AED",
    [CONFIG_KEYS.DEFAULT_TIMEZONE]: "Asia/Dubai",
    [CONFIG_KEYS.DEFAULT_SESSION_DURATION]: "60",
    [CONFIG_KEYS.DEFAULT_TRIAL_DAYS]: "14",
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const { data: configs = [], isLoading } = useQuery<PlatformConfig[]>({
    queryKey: ["/api/platform/config"],
  });

  useEffect(() => {
    if (configs.length > 0) {
      const configMap: Record<string, string> = {};
      configs.forEach(config => {
        configMap[config.key] = config.value;
      });
      setLocalConfigs(prev => ({
        ...prev,
        ...configMap,
      }));
    }
  }, [configs]);

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      if (!value) throw new Error("Value is required");
      return apiRequest("PUT", `/api/platform/config/${key}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/config"] });
    },
  });

  const handleValueChange = (key: string, value: string) => {
    setLocalConfigs(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    const originalConfigs: Record<string, string> = {};
    configs.forEach(config => {
      originalConfigs[config.key] = config.value;
    });

    const changedKeys = Object.keys(localConfigs).filter(key => 
      localConfigs[key] !== originalConfigs[key]
    );

    if (changedKeys.length === 0) {
      setHasChanges(false);
      return;
    }

    try {
      for (const key of changedKeys) {
        setSavingKey(key);
        await updateMutation.mutateAsync({
          key,
          value: localConfigs[key],
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHasChanges(false);
      setSavingKey(null);

      if (Platform.OS === "web") {
        window.alert("Academy defaults saved successfully!");
      } else {
        Alert.alert("Success", "Academy defaults saved successfully!");
      }
    } catch (error) {
      setSavingKey(null);
      if (Platform.OS === "web") {
        window.alert("Failed to save academy defaults");
      } else {
        Alert.alert("Error", "Failed to save academy defaults");
      }
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading academy defaults...</Text>
      </View>
    );
  }

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
              <View style={styles.labelRow}>
                <Text style={styles.label}>Default Currency</Text>
                {savingKey === CONFIG_KEYS.DEFAULT_CURRENCY ? (
                  <ActivityIndicator size="small" color={PLATFORM_COLOR} />
                ) : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyScroll}>
                {CURRENCIES.map((currency) => (
                  <Pressable
                    key={currency}
                    style={[
                      styles.currencyChip,
                      localConfigs[CONFIG_KEYS.DEFAULT_CURRENCY] === currency && styles.currencyChipActive
                    ]}
                    onPress={() => handleValueChange(CONFIG_KEYS.DEFAULT_CURRENCY, currency)}
                  >
                    <Text style={[
                      styles.currencyText,
                      localConfigs[CONFIG_KEYS.DEFAULT_CURRENCY] === currency && styles.currencyTextActive
                    ]}>
                      {currency}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.formRow}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Default Timezone</Text>
                {savingKey === CONFIG_KEYS.DEFAULT_TIMEZONE ? (
                  <ActivityIndicator size="small" color={PLATFORM_COLOR} />
                ) : null}
              </View>
              <TextInput
                style={styles.input}
                value={localConfigs[CONFIG_KEYS.DEFAULT_TIMEZONE]}
                onChangeText={(v) => handleValueChange(CONFIG_KEYS.DEFAULT_TIMEZONE, v)}
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
                {savingKey === CONFIG_KEYS.DEFAULT_SESSION_DURATION ? (
                  <ActivityIndicator size="small" color={PLATFORM_COLOR} />
                ) : (
                  <>
                    <TextInput
                      style={styles.smallInput}
                      value={localConfigs[CONFIG_KEYS.DEFAULT_SESSION_DURATION]}
                      onChangeText={(v) => handleValueChange(CONFIG_KEYS.DEFAULT_SESSION_DURATION, v)}
                      keyboardType="numeric"
                      placeholder="60"
                      placeholderTextColor={Colors.dark.textMuted}
                    />
                    <Text style={styles.inputSuffix}>min</Text>
                  </>
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trial Settings</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Default Trial Period</Text>
                <Text style={styles.rowDescription}>Free trial duration for new academies</Text>
              </View>
              <View style={styles.inputContainer}>
                {savingKey === CONFIG_KEYS.DEFAULT_TRIAL_DAYS ? (
                  <ActivityIndicator size="small" color={PLATFORM_COLOR} />
                ) : (
                  <>
                    <TextInput
                      style={styles.smallInput}
                      value={localConfigs[CONFIG_KEYS.DEFAULT_TRIAL_DAYS]}
                      onChangeText={(v) => handleValueChange(CONFIG_KEYS.DEFAULT_TRIAL_DAYS, v)}
                      keyboardType="numeric"
                      placeholder="14"
                      placeholderTextColor={Colors.dark.textMuted}
                    />
                    <Text style={styles.inputSuffix}>days</Text>
                  </>
                )}
              </View>
            </View>
          </View>
        </View>

        {hasChanges ? (
          <Pressable
            style={[styles.saveButton, updateMutation.isPending && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.text} />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
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
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
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
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  formRow: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  label: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  currencyScroll: {
    flexGrow: 0,
  },
  currencyChip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
    marginRight: Spacing.sm,
  },
  currencyChipActive: {
    backgroundColor: PLATFORM_COLOR,
  },
  currencyText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  currencyTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  input: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    fontWeight: "500",
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
    minWidth: 100,
    justifyContent: "center",
  },
  smallInput: {
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
    marginTop: Spacing.xl,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
});
