import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { WhatsNewSettingsCard } from "@/components/WhatsNewSettingsCard";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface ParentSettings {
  id: string;
  userId: string;
  invoiceEmail: string | null;
  preferredLanguage: string;
  notifyInvoiceCreated: boolean;
  notifyPaymentReminder: boolean;
  notifyPaymentOverdue: boolean;
  notifyPaymentConfirmed: boolean;
  reminderDaysBefore: number;
}

export default function ParentSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ settings: ParentSettings }>({
    queryKey: ["/api/parent/settings"],
  });

  const settings = data?.settings;

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<ParentSettings>) =>
      apiRequest("/api/parent/settings", { method: "PATCH", body: JSON.stringify(updates) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parent/settings"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to update settings");
    },
  });

  const toggleSetting = (key: keyof ParentSettings) => {
    if (!settings) return;
    const currentValue = settings[key];
    if (typeof currentValue === "boolean") {
      updateMutation.mutate({ [key]: !currentValue });
    }
  };

  const renderToggle = (
    icon: string,
    label: string,
    description: string,
    key: keyof ParentSettings
  ) => {
    const value = settings?.[key];
    return (
      <View style={styles.settingRow}>
        <View style={styles.settingIcon}>
          <Ionicons name={icon as any} size={20} color={Colors.dark.text} />
        </View>
        <View style={styles.settingContent}>
          <Text style={styles.settingLabel}>{label}</Text>
          <Text style={styles.settingDescription}>{description}</Text>
        </View>
        <Switch
          value={typeof value === "boolean" ? value : false}
          onValueChange={() => toggleSetting(key)}
          trackColor={{ false: Colors.dark.backgroundTertiary, true: "#22C55E" }}
          thumbColor={Colors.dark.text}
          disabled={updateMutation.isPending}
        />
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable 
          onPress={() => navigation.goBack()} 
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
          android_ripple={{ color: 'rgba(255, 255, 255, 0.2)' }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Payment Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.text} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Notifications</Text>
            <Text style={styles.sectionDescription}>
              Control which payment-related notifications you receive
            </Text>

            <View style={styles.settingsCard}>
              {renderToggle(
                "document-text-outline",
                "New Invoice",
                "Get notified when a new invoice is created",
                "notifyInvoiceCreated"
              )}

              <View style={styles.settingDivider} />

              {renderToggle(
                "alarm-outline",
                "Payment Reminder",
                "Receive a reminder before payment is due",
                "notifyPaymentReminder"
              )}

              <View style={styles.settingDivider} />

              {renderToggle(
                "alert-circle-outline",
                "Overdue Alert",
                "Get alerted when a payment is overdue",
                "notifyPaymentOverdue"
              )}

              <View style={styles.settingDivider} />

              {renderToggle(
                "checkmark-circle-outline",
                "Payment Confirmed",
                "Confirmation when your payment is processed",
                "notifyPaymentConfirmed"
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reminder Timing</Text>
            <View style={styles.settingsCard}>
              <View style={styles.timingRow}>
                <View style={styles.timingInfo}>
                  <Text style={styles.settingLabel}>Days Before Due Date</Text>
                  <Text style={styles.settingDescription}>
                    Receive reminder this many days before payment is due
                  </Text>
                </View>
                <View style={styles.timingValue}>
                  <Text style={styles.timingNumber}>{settings?.reminderDaysBefore || 3}</Text>
                  <Text style={styles.timingLabel}>days</Text>
                </View>
              </View>
            </View>
          </View>

          <WhatsNewSettingsCard />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About Parent Dashboard</Text>
            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={24} color={Colors.dark.textMuted} />
              <View style={styles.infoContent}>
                <Text style={styles.infoText}>
                  The Parent Dashboard gives you complete visibility into your child&apos;s tennis journey, 
                  including lesson attendance, invoices, and payments. All data is view-only for transparency.
                </Text>
                <Text style={[styles.infoText, { marginTop: Spacing.sm }]}>
                  Need help? Contact your academy directly for billing questions or payment arrangements.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.7,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.subtitle,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  sectionDescription: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  settingsCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  settingContent: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingLabel: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  settingDescription: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  settingDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.md,
  },
  timingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timingInfo: {
    flex: 1,
    marginRight: Spacing.lg,
  },
  timingValue: {
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  timingNumber: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  timingLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  infoContent: {
    flex: 1,
  },
  infoText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    lineHeight: 18,
  },
}));
