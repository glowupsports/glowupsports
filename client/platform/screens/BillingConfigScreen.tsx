import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Switch, Alert, Platform } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

export default function BillingConfigScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [stripeEnabled, setStripeEnabled] = useState(true);
  const [stripeTestMode, setStripeTestMode] = useState(true);
  const [monthlyPrice, setMonthlyPrice] = useState("299");
  const [annualPrice, setAnnualPrice] = useState("2990");
  const [hasChanges, setHasChanges] = useState(false);

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHasChanges(false);
    if (Platform.OS === "web") {
      window.alert("Billing configuration saved successfully!");
    } else {
      Alert.alert("Success", "Billing configuration saved successfully!");
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
        <Text style={styles.topBarTitle}>Billing Config</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Configure payment processing and pricing</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Gateway</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="card" size={24} color="#635bff" />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Stripe Payments</Text>
                <Text style={styles.rowDescription}>Accept credit card payments</Text>
              </View>
              <Switch
                value={stripeEnabled}
                onValueChange={(v) => { setStripeEnabled(v); setHasChanges(true); }}
                trackColor={{ false: Colors.dark.backgroundRoot, true: `${PLATFORM_COLOR}80` }}
                thumbColor={stripeEnabled ? PLATFORM_COLOR : Colors.dark.textMuted}
              />
            </View>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="flask" size={24} color={Colors.dark.orange} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Test Mode</Text>
                <Text style={styles.rowDescription}>Use Stripe test environment</Text>
              </View>
              <Switch
                value={stripeTestMode}
                onValueChange={(v) => { setStripeTestMode(v); setHasChanges(true); }}
                trackColor={{ false: Colors.dark.backgroundRoot, true: `${Colors.dark.orange}80` }}
                thumbColor={stripeTestMode ? Colors.dark.orange : Colors.dark.textMuted}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription Pricing (AED)</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <View style={styles.priceRow}>
              <View style={styles.priceInfo}>
                <Text style={styles.priceLabel}>Monthly Plan</Text>
                <Text style={styles.priceDescription}>Per academy per month</Text>
              </View>
              <View style={styles.priceInputContainer}>
                <Text style={styles.currency}>AED</Text>
                <TextInput
                  style={styles.priceInput}
                  value={monthlyPrice}
                  onChangeText={(v) => { setMonthlyPrice(v); setHasChanges(true); }}
                  keyboardType="numeric"
                  placeholder="299"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>
            </View>
            <View style={styles.priceRow}>
              <View style={styles.priceInfo}>
                <Text style={styles.priceLabel}>Annual Plan</Text>
                <Text style={styles.priceDescription}>Per academy per year (2 months free)</Text>
              </View>
              <View style={styles.priceInputContainer}>
                <Text style={styles.currency}>AED</Text>
                <TextInput
                  style={styles.priceInput}
                  value={annualPrice}
                  onChangeText={(v) => { setAnnualPrice(v); setHasChanges(true); }}
                  keyboardType="numeric"
                  placeholder="2990"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>
            Stripe API keys should be configured in environment variables. Contact support if you need to update payment credentials.
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
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  rowInfo: {
    flex: 1,
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
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  priceInfo: {
    flex: 1,
  },
  priceLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  priceDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  priceInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
  },
  currency: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginRight: Spacing.xs,
  },
  priceInput: {
    ...Typography.body,
    color: Colors.dark.text,
    width: 70,
    textAlign: "right",
    paddingVertical: Spacing.sm,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
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
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
});
