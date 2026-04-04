import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { useSubscription } from "@/lib/revenuecat";
import { PurchasesPackage } from "react-native-purchases";
import type { PurchasesError } from "@revenuecat/purchases-typescript-internal";

interface Props {
  visible: boolean;
  onClose: () => void;
  callCount?: number;
  limit?: number;
  onSubscribed?: () => void;
}

const FEATURES = [
  "Unlimited AI conversations per month",
  "Personal AI coach insights",
  "AI session summaries",
  "Match prep & strategy",
  "Quest AI guidance",
];

const ACCENT = Colors.dark.primary;

export default function AiProUpgradeModal({ visible, onClose, callCount = 0, limit = 5, onSubscribed }: Props) {
  const { offerings, isPurchasing, isRestoring, purchase, restore } = useSubscription();
  const [selectedPackageType, setSelectedPackageType] = useState<"monthly" | "yearly">("yearly");
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  const currentOffering = offerings?.current;
  const monthlyPkg = currentOffering?.availablePackages.find(
    (p) => p.packageType === "MONTHLY"
  );
  const yearlyPkg = currentOffering?.availablePackages.find(
    (p) => p.packageType === "ANNUAL"
  );

  const selectedPkg: PurchasesPackage | undefined =
    selectedPackageType === "yearly" ? yearlyPkg : monthlyPkg;

  const handlePurchase = async () => {
    if (!selectedPkg) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await purchase(selectedPkg);
      onSubscribed?.();
      onClose();
    } catch (e: unknown) {
      const purchaseErr = e as PurchasesError;
      if (purchaseErr?.userCancelled) return;
      console.error("[AiProUpgradeModal] Purchase error:", e);
    }
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await restore();
      setRestoreSuccess(true);
      setTimeout(() => setRestoreSuccess(false), 3000);
    } catch (e) {
      console.error("[AiProUpgradeModal] Restore error:", e);
    }
  };

  const isLoading = !currentOffering;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.handle} />

          <View style={styles.iconRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="flash" size={28} color="#000" />
            </View>
          </View>

          <Text style={styles.title}>AI Pro</Text>
          {callCount > 0 ? (
            <Text style={styles.subtitle}>
              You have used {callCount} of your {limit} free AI conversations this month.
            </Text>
          ) : (
            <Text style={styles.subtitle}>
              Unlock unlimited AI coaching to reach your full potential.
            </Text>
          )}

          <View style={styles.featureList}>
            {FEATURES.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={18} color={ACCENT} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>

          {isLoading ? (
            <ActivityIndicator color={ACCENT} style={{ marginVertical: Spacing.lg }} />
          ) : (
            <View style={styles.planRow}>
              {monthlyPkg ? (
                <Pressable
                  style={[
                    styles.planCard,
                    selectedPackageType === "monthly" && styles.planCardSelected,
                  ]}
                  onPress={() => setSelectedPackageType("monthly")}
                >
                  <Text style={styles.planLabel}>Monthly</Text>
                  <Text style={styles.planPrice}>{monthlyPkg.product.priceString}</Text>
                  <Text style={styles.planPer}>/ month</Text>
                </Pressable>
              ) : null}

              {yearlyPkg ? (
                <Pressable
                  style={[
                    styles.planCard,
                    selectedPackageType === "yearly" && styles.planCardSelected,
                  ]}
                  onPress={() => setSelectedPackageType("yearly")}
                >
                  <View style={styles.bestValueBadge}>
                    <Text style={styles.bestValueText}>Best Value</Text>
                  </View>
                  <Text style={styles.planLabel}>Yearly</Text>
                  <Text style={styles.planPrice}>{yearlyPkg.product.priceString}</Text>
                  <Text style={styles.planPer}>/ year</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          <Pressable
            style={[styles.upgradeButton, (isPurchasing || isLoading || !selectedPkg) && styles.upgradeButtonDisabled]}
            onPress={handlePurchase}
            disabled={isPurchasing || isLoading || !selectedPkg}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.upgradeButtonText}>
                {selectedPkg ? `Subscribe — ${selectedPkg.product.priceString}` : "Subscribe to AI Pro"}
              </Text>
            )}
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Maybe later</Text>
          </Pressable>

          <Pressable style={styles.restoreButton} onPress={handleRestore} disabled={isRestoring}>
            {isRestoring ? (
              <ActivityIndicator color={Colors.dark.textMuted} size="small" />
            ) : restoreSuccess ? (
              <Text style={[styles.restoreText, { color: Colors.dark.successNeon }]}>Purchases restored</Text>
            ) : (
              <Text style={styles.restoreText}>Restore purchases</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#161D28",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.xl,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  iconRow: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: ACCENT,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  featureList: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  featureText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  planRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  planCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: Spacing.md,
    alignItems: "center",
    minHeight: 90,
    justifyContent: "center",
    position: "relative",
  },
  planCardSelected: {
    borderColor: ACCENT,
    backgroundColor: `${ACCENT}18`,
  },
  bestValueBadge: {
    position: "absolute",
    top: -10,
    backgroundColor: ACCENT,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  bestValueText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#000",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  planLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  planPer: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  upgradeButton: {
    backgroundColor: ACCENT,
    borderRadius: BorderRadius.md,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  upgradeButtonDisabled: {
    opacity: 0.5,
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  cancelText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  restoreButton: {
    alignItems: "center",
    paddingVertical: Spacing.xs,
    marginTop: Spacing.xs,
  },
  restoreText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textDecorationLine: "underline",
  },
});
